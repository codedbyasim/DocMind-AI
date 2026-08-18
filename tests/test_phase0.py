"""Phase 0 Verification Tests: Configuration, Core Models, Layer Separation, and Swappability."""

import pytest
from core.config import (
    EmbeddingProviderType,
    LLMProviderType,
    Settings,
    VectorDBProviderType,
    get_settings,
    settings,
)
from core.models import Chunk, Page, ScrapeRun, HealEvent, ChatResponse, Citation
from pipeline.chunker import DocumentChunker
from pipeline.embeddings.factory import get_embedding_provider
from retrieval.factory import get_vector_store
from chat.llm.factory import get_llm_provider
from chat.engine import ChatQueryEngine


def test_settings_defaults():
    """Verify that Settings loads with appropriate defaults and typed enums."""
    settings = get_settings()
    assert settings.app_name == "DocMind"
    assert settings.chunk_size_tokens == 500
    assert settings.chunk_overlap_tokens == 50
    assert settings.embedding_provider in EmbeddingProviderType
    assert settings.llm_provider in LLMProviderType
    assert settings.vector_db_provider in VectorDBProviderType


def test_core_models_instantiation():
    """Verify core domain entity creation per SRS Section 6.1."""
    page = Page(
        url="https://docs.example.com/getting-started",
        title="Getting Started",
        section="Installation",
        content="This is the getting started guide for the SDK.",
    )
    assert page.id is not None
    assert page.url == "https://docs.example.com/getting-started"

    chunker = DocumentChunker(chunk_size_tokens=100, chunk_overlap_tokens=10)
    chunks = chunker.chunk_page(page)
    assert len(chunks) >= 1
    assert chunks[0].page_id == page.id
    assert chunks[0].metadata["url"] == page.url
    assert chunks[0].metadata["title"] == page.title


def test_provider_swappability_mock():
    """Verify dynamic factory selection for embeddings, vector store, and LLM."""
    embedder = get_embedding_provider("mock")
    assert embedder.provider_name == "mock"

    store = get_vector_store("mock", force_new=True)
    assert store.provider_name == "mock"

    llm = get_llm_provider("mock")
    assert llm.provider_name == "mock"


@pytest.mark.asyncio
async def test_end_to_end_mock_pipeline():
    """Verify full end-to-end ingestion, retrieval, and chat query using mock providers."""
    # 1. Scraped Page
    page = Page(
        url="https://docs.example.com/api",
        title="API Reference",
        section="Authentication",
        content="To authenticate with the API, include the Authorization header with your Bearer token in every request.",
    )

    # 2. Chunk
    chunker = DocumentChunker(chunk_size_tokens=200, chunk_overlap_tokens=20)
    chunks = chunker.chunk_page(page)
    assert len(chunks) > 0

    # 3. Embed & Store
    embedder = get_embedding_provider("mock")
    vector_store = get_vector_store("mock", force_new=True)

    embeddings = await embedder.embed_texts([c.text for c in chunks])
    upserted = await vector_store.upsert_chunks(chunks, embeddings)
    assert upserted == len(chunks)
    assert await vector_store.count() == len(chunks)

    # 4. Chat Engine Query (Grounded)
    llm = get_llm_provider("mock")
    engine = ChatQueryEngine(
        embedding_provider=embedder,
        vector_store=vector_store,
        llm_provider=llm,
        confidence_threshold=0.1,
    )

    response = await engine.process_query("How do I authenticate with the API?")
    assert isinstance(response, ChatResponse)
    assert response.grounded is True
    assert len(response.citations) > 0
    assert response.citations[0].url == "https://docs.example.com/api"

    # 5. Chat Engine Query (Fallback when confidence is not met / irrelevant query)
    strict_engine = ChatQueryEngine(
        embedding_provider=embedder,
        vector_store=vector_store,
        llm_provider=llm,
        confidence_threshold=0.99,
    )
    fallback_response = await strict_engine.process_query("What is the recipe for chocolate cake?")
    assert isinstance(fallback_response, ChatResponse)
    assert fallback_response.grounded is False
    assert len(fallback_response.citations) == 0
    assert "could not find" in fallback_response.answer.lower()


def test_openai_compatible_base_url_passthrough():
    """Verify that OpenAI provider adapters properly configure base_url for AI/ML API compatibility."""
    from pipeline.embeddings.openai_provider import OpenAIEmbeddingProvider
    from chat.llm.openai_provider import OpenAILLMProvider

    # 1. Custom base_url instantiation (e.g. AI/ML API)
    aiml_base_url = "https://api.aimlapi.com/v1"
    fake_key = "fake_test_key_123"

    embedder = OpenAIEmbeddingProvider(api_key=fake_key, base_url=aiml_base_url)
    assert embedder.base_url == aiml_base_url
    client_emb = embedder._get_client()
    assert str(client_emb.base_url).rstrip("/") == aiml_base_url

    llm = OpenAILLMProvider(api_key=fake_key, base_url=aiml_base_url)
    assert llm.base_url == aiml_base_url
    client_llm = llm._get_client()
    assert str(client_llm.base_url).rstrip("/") == aiml_base_url

    # 2. Plain OpenAI base_url override
    openai_url = "https://api.openai.com/v1"
    custom_embedder = OpenAIEmbeddingProvider(api_key=fake_key, base_url=openai_url)
    assert custom_embedder.base_url == openai_url
    custom_client_emb = custom_embedder._get_client()
    assert str(custom_client_emb.base_url).rstrip("/") == openai_url

    # 3. Default base_url uses settings.embedding_base_url
    default_embedder = OpenAIEmbeddingProvider(api_key=fake_key)
    assert default_embedder.base_url == settings.embedding_base_url




