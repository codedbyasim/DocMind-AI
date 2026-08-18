"""In-Memory Mock Vector Store for testing and offline development."""

import math
from typing import Dict, List, Optional, Tuple
from core.config import settings
from core.models import Chunk
from retrieval.base import BaseVectorStore


class MockVectorStore(BaseVectorStore):
    """Simple in-memory vector store with cosine similarity calculation."""

    def __init__(self):
        self._chunks: Dict[str, Chunk] = {}
        self._vectors: Dict[str, List[float]] = {}

    @property
    def provider_name(self) -> str:
        return "mock"

    @staticmethod
    def _cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
        dot = sum(a * b for a, b in zip(vec1, vec2))
        norm1 = math.sqrt(sum(a * a for a in vec1)) or 1.0
        norm2 = math.sqrt(sum(b * b for b in vec2)) or 1.0
        return max(0.0, min(1.0, dot / (norm1 * norm2)))

    async def upsert_chunks(
        self, chunks: List[Chunk], embeddings: List[List[float]]
    ) -> int:
        for chunk, emb in zip(chunks, embeddings):
            self._chunks[chunk.id] = chunk
            self._vectors[chunk.id] = emb
        return len(chunks)

    async def search(
        self,
        query_vector: List[float],
        top_k: int = 5,
        confidence_threshold: Optional[float] = None,
    ) -> List[Tuple[Chunk, float]]:
        threshold = confidence_threshold if confidence_threshold is not None else settings.confidence_threshold
        scored: List[Tuple[Chunk, float]] = []

        for cid, chunk in self._chunks.items():
            emb = self._vectors.get(cid)
            if not emb:
                continue
            sim = self._cosine_similarity(query_vector, emb)
            if sim >= threshold:
                scored.append((chunk, sim))

        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:top_k]

    async def delete_by_page_id(self, page_id: str) -> int:
        to_delete = [
            cid for cid, chunk in self._chunks.items() if chunk.page_id == page_id
        ]
        for cid in to_delete:
            del self._chunks[cid]
            if cid in self._vectors:
                del self._vectors[cid]
        return len(to_delete)

    async def count(self) -> int:
        return len(self._chunks)

    async def clear(self) -> bool:
        self._chunks.clear()
        self._vectors.clear()
        return True
