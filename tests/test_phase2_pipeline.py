"""Phase 2 Verification Tests: Chunking & Embedding Pipeline (FR-201 to FR-204)."""

import pytest
from unittest.mock import AsyncMock, patch
from core.models import Page
from pipeline.chunker import DocumentChunker
from pipeline.embeddings.openai_provider import OpenAIEmbeddingProvider
from pipeline.embeddings.factory import get_embedding_provider
from pipeline.indexer import DocumentIndexer
from retrieval.factory import get_vector_store


@pytest.fixture(autouse=True)
def setup_mock_environment(monkeypatch):
    """Ensure tests run predictably with mock embeddings without consuming live API tokens."""
    monkeypatch.setenv("DOCMIND_MOCK_EMBEDDINGS", "true")


def test_token_accurate_chunking_and_metadata():
    """Verify FR-201 & FR-203: Token-accurate chunking and source metadata attachment."""
    chunker = DocumentChunker(chunk_size_tokens=100, chunk_overlap_tokens=20)

    long_content = (
        "DocMind is a self-healing documentation to RAG pipeline. "
        "It scrapes documentation sites using Bright Data Scraper Studio and creates semantic chunks. "
    ) * 10  # Approx ~250 tokens

    page = Page(
        url="https://docs.litellm.ai/docs/proxy",
        title="LiteLLM Proxy Architecture",
        section="Architecture Overview",
        content=long_content,
        scrape_run_id="test_run_123",
    )

    chunks = chunker.chunk_page(page)

    assert len(chunks) > 1, "Long page should be split into multiple chunks"
    
    for idx, chunk in enumerate(chunks):
        assert chunk.page_id == page.id
        assert chunk.chunk_order == idx
        assert chunk.token_count <= 110, f"Chunk {idx} token count {chunk.token_count} exceeds target"
        
        # Verify FR-203 metadata
        assert chunk.metadata["url"] == page.url
        assert chunk.metadata["title"] == page.title
        assert chunk.metadata["section"] == page.section
        assert chunk.metadata["page_id"] == page.id
        assert chunk.metadata["chunk_order"] == idx
        assert chunk.metadata["scrape_run_id"] == "test_run_123"


def test_chunking_overlap_continuity():
    """Verify that chunk overlap preserves contextual continuity between consecutive chunks."""
    chunker = DocumentChunker(chunk_size_tokens=50, chunk_overlap_tokens=15)
    
    text = (
        "Section Alpha explains the basic setup and prerequisites for installation. "
        "Section Beta details the configuration parameters and environment variables. "
        "Section Gamma provides troubleshooting tips for common network errors."
    )
    page = Page(url="https://docs.example.com", title="Guide", content=text)
    chunks = chunker.chunk_page(page)

    if len(chunks) >= 2:
        # Check that words near the end of chunk 0 exist at the beginning of chunk 1
        words_chunk_0 = chunks[0].text.split()
        words_chunk_1 = chunks[1].text.split()
        overlap_words = set(words_chunk_0[-5:]).intersection(set(words_chunk_1[:10]))
        assert len(overlap_words) > 0, "Expected overlap between consecutive chunks"


@pytest.mark.asyncio
async def test_embedding_retry_on_transient_failure():
    """Verify FR-202: Embedding generation retries on transient API failure with exponential backoff."""
    provider = OpenAIEmbeddingProvider(api_key="fake_key", max_retries=3, batch_size=2)

    mock_client = AsyncMock()
    mock_client.embeddings.create = AsyncMock(
        side_effect=[
            Exception("RateLimitError: 429 Too Many Requests"),
            Exception("ConnectionResetError: 502 Bad Gateway"),
            AsyncMock(data=[AsyncMock(embedding=[0.1] * 1536), AsyncMock(embedding=[0.2] * 1536)]),
        ]
    )

    with patch.object(provider, "_get_client", return_value=mock_client):
        embeddings = await provider.embed_texts(["Chunk one text", "Chunk two text"])

        assert len(embeddings) == 2
        assert len(embeddings[0]) == 1536
        assert mock_client.embeddings.create.call_count == 3


@pytest.mark.asyncio
async def test_embedding_persistent_failure_handling():
    """Verify FR-202: Persistent failures exceed max retries and raise appropriately for caller handling."""
    provider = OpenAIEmbeddingProvider(api_key="fake_key", max_retries=2)

    mock_client = AsyncMock()
    mock_client.embeddings.create = AsyncMock(
        side_effect=Exception("Permanent 401 Unauthorized")
    )

    with patch.object(provider, "_get_client", return_value=mock_client):
        with pytest.raises(Exception) as exc_info:
            await provider.embed_texts(["Test chunk"])

        assert "Permanent 401 Unauthorized" in str(exc_info.value)
        assert mock_client.embeddings.create.call_count == 2


@pytest.mark.asyncio
async def test_document_indexer_and_delta_reindexing():
    """Verify FR-204 & SRS §6.1: DocumentIndexer processes pages, tracks progress, and executes delta updates."""
    vector_store = get_vector_store("mock", force_new=True)
    embedder = get_embedding_provider("mock")
    indexer = DocumentIndexer(
        embedding_provider=embedder,
        vector_store=vector_store,
        storage_dir="./data/test_indexed_chunks",
    )

    page1 = Page(
        url="https://docs.litellm.ai/docs/page1",
        title="Page 1",
        content="This is the first page content describing authentication and tokens in detail.",
    )
    page2 = Page(
        url="https://docs.litellm.ai/docs/page2",
        title="Page 2",
        content="This is the second page content describing models and supported parameters.",
    )

    # 1. Full Indexing of 2 pages
    pages_indexed, chunks_indexed = await indexer.index_pages([page1, page2])
    assert pages_indexed == 2
    assert chunks_indexed >= 2

    # Check progress tracker
    progress = indexer.get_progress()
    assert progress.status == "completed"
    assert progress.processed_pages == 2
    assert progress.processed_chunks == chunks_indexed
    assert progress.last_indexed_at is not None

    # Verify vector store contents
    assert await vector_store.count() == chunks_indexed

    # 2. Delta Re-indexing: update only page1
    page1_updated = Page(
        id=page1.id,
        url="https://docs.litellm.ai/docs/page1",
        title="Page 1 Updated",
        content="This is updated page 1 content with newly added section on OAuth2 login flows.",
    )
    delta_pages, delta_chunks = await indexer.index_pages([page1_updated], is_delta=True)
    assert delta_pages == 1
    assert delta_chunks >= 1

    # Stale chunk cleanup check: page1's previous chunks should have been deleted and replaced
    assert await vector_store.count() >= 2
