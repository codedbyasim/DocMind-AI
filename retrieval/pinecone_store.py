"""Pinecone Vector Store Implementation (Swappable Hosted Alternative)."""

import logging
from typing import Any, Dict, List, Optional, Tuple
from core.config import settings
from core.models import Chunk
from retrieval.base import BaseVectorStore

logger = logging.getLogger("docmind.retrieval.pinecone")


class PineconeVectorStore(BaseVectorStore):
    """Pinecone vector database store for hosted cloud persistence."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        index_name: Optional[str] = None,
    ):
        self.api_key = api_key or settings.pinecone_api_key
        self.index_name = index_name or settings.pinecone_index_name
        self._index = None

    @property
    def provider_name(self) -> str:
        return "pinecone"

    def _get_index(self):
        if self._index is None:
            from pinecone import Pinecone
            if not self.api_key:
                raise ValueError("Pinecone API key missing. Set PINECONE_API_KEY in .env")
            pc = Pinecone(api_key=self.api_key)
            self._index = pc.Index(self.index_name)
        return self._index

    async def upsert_chunks(
        self, chunks: List[Chunk], embeddings: List[List[float]]
    ) -> int:
        if not chunks or not embeddings:
            return 0
        index = self._get_index()
        vectors = []
        for chunk, emb in zip(chunks, embeddings):
            vectors.append({
                "id": chunk.id,
                "values": emb,
                "metadata": {
                    "text": chunk.text,
                    "page_id": chunk.page_id,
                    "url": chunk.metadata.get("url", ""),
                    "title": chunk.metadata.get("title", ""),
                    "section": chunk.metadata.get("section") or "",
                    "chunk_order": chunk.chunk_order,
                    "token_count": chunk.token_count,
                },
            })
        index.upsert(vectors=vectors)
        return len(chunks)

    async def search(
        self,
        query_vector: List[float],
        top_k: int = 5,
        confidence_threshold: Optional[float] = None,
    ) -> List[Tuple[Chunk, float]]:
        threshold = confidence_threshold if confidence_threshold is not None else settings.confidence_threshold
        index = self._get_index()
        results = index.query(
            vector=query_vector,
            top_k=top_k,
            include_metadata=True,
        )
        output = []
        for match in results.get("matches", []):
            score = match.get("score", 0.0)
            if score < threshold:
                continue
            meta = match.get("metadata", {})
            chunk = Chunk(
                id=match["id"],
                page_id=meta.get("page_id", ""),
                text=meta.get("text", ""),
                token_count=int(meta.get("token_count", 0)),
                chunk_order=int(meta.get("chunk_order", 0)),
                metadata=meta,
            )
            output.append((chunk, score))
        return output

    async def delete_by_page_id(self, page_id: str) -> int:
        index = self._get_index()
        try:
            index.delete(filter={"page_id": {"$eq": page_id}})
            return 1
        except Exception as exc:
            logger.error("Failed to delete chunks in Pinecone for page_id '%s': %s", page_id, exc)
            return 0

    async def count(self) -> int:
        index = self._get_index()
        stats = index.describe_index_stats()
        return stats.get("total_vector_count", 0)

    async def clear(self) -> bool:
        index = self._get_index()
        index.delete(delete_all=True)
        return True
