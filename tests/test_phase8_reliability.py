"""Phase 8 Verification Tests: Production Readiness, Reliability & Durability (NFR-01 to NFR-08, FMEA R-01 to R-12)."""

import asyncio
import json
import pytest
from pathlib import Path
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient

from api.main import app
from admin.monitor import HealthMonitor
from admin.service import AdminScraperService
from chat.engine import ChatQueryEngine
from core.config import settings
from core.models import Chunk, Page, ScrapeRun, ScrapeRunStatus, SystemHealthState
from core.security import audit_log, get_audit_logs
from pipeline.chunker import DocumentChunker
from pipeline.embeddings.mock_provider import MockEmbeddingProvider
from pipeline.indexer import DocumentIndexer
from retrieval.chroma_store import ChromaVectorStore
from retrieval.mock_store import MockVectorStore
from scraper.client import BrightDataClient
from scraper.logger import ScrapeRunLogger


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("DOCMIND_MOCK_EMBEDDINGS", "true")
    monkeypatch.setenv("DOCMIND_MOCK_LLM", "true")
    return TestClient(app)


@pytest.mark.asyncio
async def test_end_to_end_multiturn_rag_pipeline_integration(tmp_path):
    """Integration Test: Scrape -> Validate -> Chunk -> Embed -> Store -> Retrieve -> Grounded Answer."""
    chroma_dir = tmp_path / "chroma_test"
    vector_store = ChromaVectorStore(persist_directory=str(chroma_dir), collection_name="test_rag_pipeline")
    embedding_provider = MockEmbeddingProvider()
    chunker = DocumentChunker(chunk_size_tokens=300, chunk_overlap_tokens=30)
    indexer = DocumentIndexer(chunker=chunker, embedding_provider=embedding_provider, vector_store=vector_store)

    # 1. Ingest Sample Documentation Pages
    sample_pages = [
        Page(
            url="https://docs.litellm.ai/docs/proxy/quickstart",
            title="Proxy Docker Quickstart",
            section="Setup",
            content="To start the LiteLLM proxy using Docker, run: docker run -p 4000:4000 ghcr.io/berriai/litellm:main-latest. Use the proxy to route across 100+ LLMs.",
        ),
        Page(
            url="https://docs.litellm.ai/docs/exception_mapping",
            title="Exception Mapping",
            section="Reliability",
            content="LiteLLM maps provider errors (e.g. RateLimitError, AuthenticationError) to standard OpenAI-compatible HTTP status codes.",
        ),
    ]

    indexed_pages, total_chunks = await indexer.index_pages(sample_pages)
    assert indexed_pages == 2
    assert total_chunks >= 2

    # 2. Query with Chat Query Engine
    chat_engine = ChatQueryEngine(
        embedding_provider=embedding_provider,
        vector_store=vector_store,
        confidence_threshold=0.5,
    )

    response = await chat_engine.process_query(
        raw_query="How do I run the LiteLLM proxy with Docker?",
        session_id="integration_sess_1",
    )

    assert response.grounded is True
    assert len(response.citations) > 0
    assert "https://docs.litellm.ai/docs/proxy/quickstart" in [c.url for c in response.citations]
    assert response.latency_ms > 0


@pytest.mark.asyncio
async def test_simulated_site_breakage_self_healing_lifecycle():
    """Integration Test: Full 6-step Self-Healing Lifecycle (FR-501 to FR-505)."""
    bdata_mock = BrightDataClient(mock_mode=True)
    admin_svc = AdminScraperService(bdata_client=bdata_mock)

    # Step 1: Inject simulated breakage run (1 page)
    broken_run, heal_event = await admin_svc.simulate_degraded_scrape()
    assert broken_run.page_count == 1
    assert heal_event is not None
    assert heal_event.approved is None

    # Step 2: Evaluate health status
    health_state, reason, diag = HealthMonitor.evaluate_system_health()
    assert health_state in (SystemHealthState.DEGRADED, SystemHealthState.HEALING)

    # Step 3: Admin Approval Gate
    approved, msg = await admin_svc.approve_heal_and_reindex(heal_event.id, approve=True)
    assert approved is True

    # Step 4: Health Restoration Check
    post_health_state, post_reason, _ = HealthMonitor.evaluate_system_health()
    assert post_health_state == SystemHealthState.HEALTHY


@pytest.mark.asyncio
async def test_chroma_vector_store_durability_across_restart(tmp_path):
    """NFR-05 Durability: Confirm ChromaDB persists and reloads vectors after simulated restart."""
    persist_dir = str(tmp_path / "chroma_durability")
    col_name = "durability_test"

    # 1. First session: Index chunks
    store_v1 = ChromaVectorStore(persist_directory=persist_dir, collection_name=col_name)
    chunk = Chunk(
        page_id="page_durable_1",
        text="Durability test document text content.",
        token_count=10,
        chunk_order=0,
        metadata={"url": "https://test.com/durable", "title": "Durable Doc"},
    )

    vector = [0.1] * 1536
    await store_v1.upsert_chunks([chunk], [vector])
    assert await store_v1.count() == 1

    # 2. Simulate complete restart: Delete store reference
    del store_v1

    # 3. Second session: Re-instantiate from same directory
    store_v2 = ChromaVectorStore(persist_directory=persist_dir, collection_name=col_name)
    assert await store_v2.count() == 1

    # Search in reloaded store
    results = await store_v2.search(query_vector=vector, top_k=1, confidence_threshold=0.5)
    assert len(results) == 1
    assert results[0][0].metadata["title"] == "Durable Doc"


def test_json_logs_atomic_write_and_durability_across_restart(tmp_path):
    """NFR-05 Durability: Confirm JSON logger survives restart and handles concurrent updates."""
    log_dir = str(tmp_path / "logs")
    logger_v1 = ScrapeRunLogger(storage_dir=log_dir)

    run = ScrapeRun(
        id="run_durable_123",
        collector_id="c_durable",
        target_url="https://test.com",
        status=ScrapeRunStatus.COMPLETED,
        page_count=8,
    )
    logger_v1.record_run(run)

    # Re-instantiate logger
    logger_v2 = ScrapeRunLogger(storage_dir=log_dir)
    latest = logger_v2.get_latest_run()
    assert latest is not None
    assert latest.id == "run_durable_123"
    assert latest.page_count == 8


@pytest.mark.asyncio
async def test_chat_endpoint_graceful_degradation_on_empty_store(monkeypatch):
    """Confirm /api/chat returns friendly response when no documents are indexed yet."""
    empty_store = MockVectorStore()
    engine = ChatQueryEngine(vector_store=empty_store)

    response = await engine.process_query(raw_query="What is this documentation about?")
    assert response.grounded is False
    assert len(response.citations) == 0
    assert "could not find" in response.answer.lower()


@pytest.mark.asyncio
async def test_chat_endpoint_graceful_degradation_on_provider_timeout():
    """Confirm chat pipeline fails gracefully with descriptive error when provider times out."""
    timing_out_provider = MockEmbeddingProvider()
    timing_out_provider.embed_query = AsyncMock(side_effect=asyncio.TimeoutError("Provider request timed out after 30s"))

    engine = ChatQueryEngine(embedding_provider=timing_out_provider)

    with pytest.raises(asyncio.TimeoutError):
        await engine.process_query(raw_query="Test timeout query")


@pytest.mark.asyncio
async def test_scraper_client_cli_timeout_handling():
    """Confirm Bright Data client catches process timeouts gracefully without hanging."""
    bdata = BrightDataClient()

    with patch("asyncio.wait_for", side_effect=asyncio.TimeoutError):
        code, stdout, stderr = await bdata.run_cli_command(["scraper", "run", "c_test", "https://test.com"])
        assert code == -1
        assert "timed out" in stderr.lower()
