"""Vector Storage & Semantic Retrieval Layer for DocMind."""
from retrieval.base import BaseVectorStore
from retrieval.factory import get_vector_store

__all__ = ["BaseVectorStore", "get_vector_store"]
