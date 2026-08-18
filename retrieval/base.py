"""Abstract Base Class for Vector Database Stores (FR-301 to FR-303, NFR-08).

Ensures Chroma (default local) and Pinecone (hosted) can be swapped via
VECTOR_DB_PROVIDER without modifying chunking, ingestion, or chat logic.
"""

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, Tuple
from core.models import Chunk, Citation


class BaseVectorStore(ABC):
    """Abstract interface for storing and querying chunk embeddings."""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Name of the vector database provider."""
        pass

    @abstractmethod
    async def upsert_chunks(
        self, chunks: List[Chunk], embeddings: List[List[float]]
    ) -> int:
        """Store or update chunks with their corresponding embedding vectors (FR-301).

        Args:
            chunks: List of Chunk objects
            embeddings: List of embedding vectors

        Returns:
            Count of successfully stored chunks
        """
        pass

    @abstractmethod
    async def search(
        self,
        query_vector: List[float],
        top_k: int = 5,
        confidence_threshold: Optional[float] = None,
    ) -> List[Tuple[Chunk, float]]:
        """Retrieve top-k semantically relevant chunks for a query vector (FR-302).

        Args:
            query_vector: Query embedding vector
            top_k: Number of nearest neighbors to retrieve
            confidence_threshold: Optional minimum cosine similarity score

        Returns:
            List of (Chunk, similarity_score) tuples ordered by relevance
        """
        pass

    @abstractmethod
    async def delete_by_page_id(self, page_id: str) -> int:
        """Remove existing chunks for a re-scraped page to prevent stale duplicates (FR-303).

        Args:
            page_id: Unique Page ID

        Returns:
            Count of deleted chunks
        """
        pass

    @abstractmethod
    async def count(self) -> int:
        """Return the total number of chunks currently indexed in the vector store."""
        pass

    @abstractmethod
    async def clear(self) -> bool:
        """Delete all indexed chunks (for testing or full reset)."""
        pass
