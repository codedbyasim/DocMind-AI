"""Deterministic Mock Embedding Provider for offline tests and development."""

import hashlib
import math
import re
from typing import List
from pipeline.embeddings.base import BaseEmbeddingProvider


class MockEmbeddingProvider(BaseEmbeddingProvider):
    """Produces deterministic normalized pseudo-embeddings using token feature hashing.

    Text sharing common words or tokens will produce positive cosine similarity,
    accurately mimicking real embeddings for offline testing without network calls.
    """

    def __init__(self, dimension: int = 1536):
        self._dimension = dimension

    @property
    def provider_name(self) -> str:
        return "mock"

    @property
    def model_name(self) -> str:
        return "mock-embedding-v1"

    @property
    def dimension(self) -> int:
        return self._dimension

    def _text_to_vector(self, text: str) -> List[float]:
        """Convert text into a normalized feature hash vector."""
        vec = [0.0] * self._dimension
        tokens = re.findall(r"\w+", text.lower())

        if not tokens:
            tokens = ["empty"]

        for token in tokens:
            # Hash token to a dimension index and sign
            h = int(hashlib.md5(token.encode("utf-8")).hexdigest(), 16)
            idx = h % self._dimension
            sign = 1.0 if (h % 2 == 0) else 1.0  # Keep positive for semantic similarity
            vec[idx] += sign

            # Also add bi-gram character hashing for fuzzy matching
            for i in range(len(token) - 1):
                bg = token[i : i + 2]
                bg_h = int(hashlib.md5(bg.encode("utf-8")).hexdigest(), 16)
                bg_idx = bg_h % self._dimension
                vec[bg_idx] += 0.3

        # L2 Normalize
        norm = math.sqrt(sum(x * x for x in vec)) or 1.0
        return [x / norm for x in vec]

    async def embed_texts(self, texts: List[str]) -> List[List[float]]:
        return [self._text_to_vector(t) for t in texts]

    async def embed_query(self, query: str) -> List[float]:
        return self._text_to_vector(query)
