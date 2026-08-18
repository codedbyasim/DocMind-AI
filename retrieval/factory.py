"""Factory for dynamically creating Vector Store instances (NFR-08)."""

import logging
from typing import Optional
from core.config import VectorDBProviderType, settings
from retrieval.base import BaseVectorStore
from retrieval.chroma_store import ChromaVectorStore
from retrieval.mock_store import MockVectorStore
from retrieval.pinecone_store import PineconeVectorStore

logger = logging.getLogger("docmind.retrieval.factory")

_global_store_instance: Optional[BaseVectorStore] = None


def get_vector_store(
    provider_override: Optional[str] = None,
    force_new: bool = False,
) -> BaseVectorStore:
    """Return a vector store instance according to settings or override.

    Args:
        provider_override: Optional override ('chroma', 'pinecone', 'mock')
        force_new: If True, creates a new instance instead of returning cached singleton

    Returns:
        Instance of BaseVectorStore
    """
    global _global_store_instance

    if _global_store_instance is not None and not force_new and not provider_override:
        return _global_store_instance

    provider_str = (provider_override or settings.vector_db_provider).lower()

    if provider_str == VectorDBProviderType.CHROMA:
        store = ChromaVectorStore()
    elif provider_str == VectorDBProviderType.PINECONE:
        store = PineconeVectorStore()
    elif provider_str == VectorDBProviderType.MOCK:
        store = MockVectorStore()
    else:
        logger.warning(
            "Unknown vector DB provider '%s'; defaulting to ChromaVectorStore",
            provider_str,
        )
        store = ChromaVectorStore()

    if not provider_override:
        _global_store_instance = store

    return store
