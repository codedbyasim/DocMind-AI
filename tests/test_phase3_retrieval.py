"""Phase 3 Verification Tests: Vector Storage & Retrieval (FR-301 to FR-303)."""

import pytest
from core.models import Chunk, Page
from pipeline.chunker import DocumentChunker
from pipeline.embeddings.factory import get_embedding_provider
from retrieval.factory import get_vector_store
from retrieval.mock_store import MockVectorStore


@pytest.fixture(autouse=True)
def setup_mock_environment(monkeypatch):
    """Ensure tests run predictably with mock embeddings without consuming live API tokens."""
    monkeypatch.setenv("DOCMIND_MOCK_EMBEDDINGS", "true")


@pytest.mark.asyncio
async def test_vector_store_upsert_and_query_roundtrip():
    """Verify FR-301 & FR-302: Upsert chunks and perform top-k similarity retrieval."""
    store = MockVectorStore()
    
    # 2 Sample chunks with known vectors
    c1 = Chunk(
        id="c1",
        page_id="p1",
        text="Docker quickstart guide for running the LiteLLM proxy gateway.",
        token_count=12,
        chunk_order=0,
        metadata={
            "url": "https://docs.litellm.ai/docs/proxy/docker",
            "title": "Docker Quickstart",
            "section": "Installation",
        },
    )
    c2 = Chunk(
        id="c2",
        page_id="p2",
        text="Callbacks and observability integrations with Sentry and PostHog.",
        token_count=10,
        chunk_order=0,
        metadata={
            "url": "https://docs.litellm.ai/docs/observability/callbacks",
            "title": "Callbacks",
            "section": "Observability",
        },
    )

    # Mock vectors: v1 points mostly in x, v2 points in y
    v1 = [1.0, 0.0, 0.0]
    v2 = [0.0, 1.0, 0.0]

    upserted = await store.upsert_chunks([c1, c2], [v1, v2])
    assert upserted == 2
    assert await store.count() == 2

    # Query closest to v1 (with confidence_threshold=0.0 to inspect full top-2)
    query_vec_1 = [0.9, 0.1, 0.0]
    results_1 = await store.search(query_vec_1, top_k=2, confidence_threshold=0.0)
    assert len(results_1) == 2
    top_chunk, score = results_1[0]
    assert top_chunk.id == "c1"
    assert score > 0.8
    assert top_chunk.metadata["url"] == "https://docs.litellm.ai/docs/proxy/docker"
    assert top_chunk.metadata["title"] == "Docker Quickstart"



@pytest.mark.asyncio
async def test_top_k_ordering_and_confidence_threshold():
    """Verify FR-302: Results are strictly ordered descending by score and respect threshold."""
    store = MockVectorStore()
    
    chunks = [
        Chunk(id=f"c{i}", page_id=f"p{i}", text=f"Text {i}", token_count=5, chunk_order=i)
        for i in range(4)
    ]
    # Vectors with decreasing cosine similarity relative to [1, 0, 0]
    vectors = [
        [1.0, 0.0, 0.0],  # sim = 1.0
        [0.8, 0.6, 0.0],  # sim = 0.8
        [0.5, 0.866, 0.0],# sim = 0.5
        [0.0, 1.0, 0.0],  # sim = 0.0
    ]
    await store.upsert_chunks(chunks, vectors)

    # 1. Top-k limit
    results = await store.search([1.0, 0.0, 0.0], top_k=2)
    assert len(results) == 2
    assert results[0][0].id == "c0"
    assert results[1][0].id == "c1"
    assert results[0][1] >= results[1][1]

    # 2. Confidence threshold filtering
    filtered_results = await store.search([1.0, 0.0, 0.0], top_k=4, confidence_threshold=0.7)
    assert len(filtered_results) == 2
    assert all(score >= 0.7 for _, score in filtered_results)


@pytest.mark.asyncio
async def test_stale_chunk_cleanup_on_reindex():
    """Verify FR-303: delete_by_page_id completely purges old chunks before new ones are indexed."""
    store = MockVectorStore()
    page_id = "page_abc_123"

    # Initial indexing: 3 chunks for page_abc_123
    old_chunks = [
        Chunk(id=f"old_{i}", page_id=page_id, text=f"Old version text {i}", token_count=10, chunk_order=i)
        for i in range(3)
    ]
    old_vectors = [[0.5, 0.5, 0.0] for _ in range(3)]
    await store.upsert_chunks(old_chunks, old_vectors)
    assert await store.count() == 3

    # Add a chunk from a different page
    other_chunk = Chunk(id="other_1", page_id="page_xyz_999", text="Other page", token_count=5, chunk_order=0)
    await store.upsert_chunks([other_chunk], [[0.0, 0.0, 1.0]])
    assert await store.count() == 4

    # Perform stale cleanup for page_abc_123 (FR-303)
    deleted = await store.delete_by_page_id(page_id)
    assert deleted == 3
    assert await store.count() == 1  # Only other_chunk remains

    # Re-index new updated version: 2 chunks for page_abc_123
    new_chunks = [
        Chunk(id=f"new_{i}", page_id=page_id, text=f"New version text {i}", token_count=12, chunk_order=i)
        for i in range(2)
    ]
    new_vectors = [[0.6, 0.4, 0.0] for _ in range(2)]
    await store.upsert_chunks(new_chunks, new_vectors)
    assert await store.count() == 3

    # Verify search only finds new chunks, not old ones
    all_results = await store.search([0.5, 0.5, 0.0], top_k=10, confidence_threshold=0.0)
    found_ids = {chunk.id for chunk, _ in all_results}
    assert "old_0" not in found_ids
    assert "old_1" not in found_ids
    assert "old_2" not in found_ids
    assert "new_0" in found_ids
    assert "new_1" in found_ids
    assert "other_1" in found_ids


def test_vector_store_swappability_factory():
    """Verify NFR-08: get_vector_store dynamically instantiates requested provider."""
    mock_store = get_vector_store("mock", force_new=True)
    assert mock_store.provider_name == "mock"

    chroma_store = get_vector_store("chroma", force_new=True)
    assert chroma_store.provider_name == "chroma"

    pinecone_store = get_vector_store("pinecone", force_new=True)
    assert pinecone_store.provider_name == "pinecone"
