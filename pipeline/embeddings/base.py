"""Abstract Base Class for Embedding Providers (FR-202, NFR-08).

Ensures all embedding providers (OpenAI, Cohere, VoyageAI, Ollama, Mock) adhere
to a unified interface so the chunking and retrieval layers remain decoupled.
"""

from abc import ABC, abstractmethod
from typing import List


class BaseEmbeddingProvider(ABC):
    """Abstract interface for text embedding models."""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Name of the embedding provider."""
        pass

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Name of the specific embedding model."""
        pass

    @property
    @abstractmethod
    def dimension(self) -> int:
        """Dimension size of the embedding vectors."""
        pass

    @abstractmethod
    async def embed_texts(self, texts: List[str]) -> List[List[float]]:
        """Generate embedding vectors for a list of text strings.

        Args:
            texts: List of text chunk strings

        Returns:
            List of float vectors, each of length self.dimension
        """
        pass

    @abstractmethod
    async def embed_query(self, query: str) -> List[float]:
        """Generate a single embedding vector for a user search query.

        Args:
            query: Natural language query string

        Returns:
            Float vector of length self.dimension
        """
        pass
