"""Factory for dynamically creating Embedding Provider instances (NFR-08)."""

import logging
import os
from typing import Optional
from core.config import EmbeddingProviderType, settings
from pipeline.embeddings.base import BaseEmbeddingProvider
from pipeline.embeddings.mock_provider import MockEmbeddingProvider
from pipeline.embeddings.openai_provider import OpenAIEmbeddingProvider

logger = logging.getLogger("docmind.pipeline.embeddings.factory")


def get_embedding_provider(
    provider_override: Optional[str] = None,
) -> BaseEmbeddingProvider:
    """Return an embedding provider based on configuration or override.

    Args:
        provider_override: Optional string to override settings.embedding_provider

    Returns:
        Instance of BaseEmbeddingProvider
    """
    if os.getenv("DOCMIND_MOCK_EMBEDDINGS", "").lower() in ("true", "1", "yes"):
        return MockEmbeddingProvider(dimension=settings.embedding_dimension)

    provider_str = (provider_override or settings.embedding_provider).lower()

    if provider_str == EmbeddingProviderType.OPENAI:
        return OpenAIEmbeddingProvider()
    elif provider_str == EmbeddingProviderType.MOCK:
        return MockEmbeddingProvider(dimension=settings.embedding_dimension)

    else:
        logger.warning(
            "Embedding provider '%s' not explicitly configured; falling back to OpenAI or Mock",
            provider_str,
        )
        try:
            return OpenAIEmbeddingProvider()
        except Exception:
            logger.warning("Failed to initialize OpenAI embedding provider; using MockEmbeddingProvider")
            return MockEmbeddingProvider(dimension=settings.embedding_dimension)
