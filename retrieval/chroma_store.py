"""ChromaDB Vector Store Implementation (Default Local Persistence)."""

import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from core.config import settings
from core.models import Chunk
from retrieval.base import BaseVectorStore

logger = logging.getLogger("docmind.retrieval.chroma")


class ChromaVectorStore(BaseVectorStore):
    """ChromaDB vector database store using local disk persistence."""

    def __init__(
        self,
        persist_directory: Optional[str] = None,
        collection_name: Optional[str] = None,
    ):
        self.persist_dir = persist_directory or settings.chroma_persist_dir
        self.collection_name = collection_name or settings.chroma_collection_name
        self._client = None
        self._collection = None

    @property
    def provider_name(self) -> str:
        return "chroma"

    def _get_collection(self):
        if self._collection is None:
            import chromadb
            from chromadb.config import Settings as ChromaSettings

            Path(self.persist_dir).mkdir(parents=True, exist_ok=True)
            self._client = chromadb.PersistentClient(
                path=self.persist_dir,
                settings=ChromaSettings(anonymized_telemetry=False),
            )
            self._collection = self._client.get_or_create_collection(
                name=self.collection_name,
                metadata={"hnsw:space": "cosine"},
            )
        return self._collection

    async def upsert_chunks(
        self, chunks: List[Chunk], embeddings: List[List[float]]
    ) -> int:
        if not chunks or not embeddings:
            return 0
        if len(chunks) != len(embeddings):
            raise ValueError("Chunks and embeddings lists must have the same length")

        collection = self._get_collection()

        ids: List[str] = []
        documents: List[str] = []
        metadatas: List[Dict[str, Any]] = []

        for chunk in chunks:
            ids.append(chunk.id)
            documents.append(chunk.text)
            # Flatten metadata for Chroma compatibility
            meta = {
                "page_id": chunk.page_id,
                "url": chunk.metadata.get("url", ""),
                "title": chunk.metadata.get("title", ""),
                "section": chunk.metadata.get("section") or "",
                "chunk_order": chunk.chunk_order,
                "token_count": chunk.token_count,
            }
            metadatas.append(meta)

        collection.upsert(
            ids=ids,
            embeddings=embeddings,
            documents=documents,
            metadatas=metadatas,
        )
        logger.info("Upserted %d chunks into Chroma collection '%s'", len(chunks), self.collection_name)
        return len(chunks)

    async def search(
        self,
        query_vector: List[float],
        top_k: int = 5,
        confidence_threshold: Optional[float] = None,
    ) -> List[Tuple[Chunk, float]]:
        threshold = confidence_threshold if confidence_threshold is not None else settings.confidence_threshold
        collection = self._get_collection()

        count = collection.count()
        if count == 0:
            return []

        actual_k = min(top_k, count)
        results = collection.query(
            query_embeddings=[query_vector],
            n_results=actual_k,
            include=["documents", "metadatas", "distances"],
        )

        output: List[Tuple[Chunk, float]] = []

        if not results or not results["ids"] or not results["ids"][0]:
            return []

        ids = results["ids"][0]
        docs = results["documents"][0] if results.get("documents") else []
        metas = results["metadatas"][0] if results.get("metadatas") else []
        distances = results["distances"][0] if results.get("distances") else []

        for i in range(len(ids)):
            distance = distances[i] if i < len(distances) else 1.0
            # For cosine distance in Chroma: similarity = 1.0 - distance
            similarity = max(0.0, 1.0 - distance)

            if similarity < threshold:
                logger.debug(
                    "Skipping chunk %s with similarity %.3f below threshold %.3f",
                    ids[i],
                    similarity,
                    threshold,
                )
                continue

            meta = metas[i] if i < len(metas) else {}
            chunk = Chunk(
                id=ids[i],
                page_id=str(meta.get("page_id", "")),
                text=docs[i] if i < len(docs) else "",
                token_count=int(meta.get("token_count", 0)),
                chunk_order=int(meta.get("chunk_order", 0)),
                metadata=meta,
            )
            output.append((chunk, similarity))

        return output

    async def delete_by_page_id(self, page_id: str) -> int:
        collection = self._get_collection()
        try:
            results = collection.get(where={"page_id": page_id})
            ids_to_delete = results.get("ids", [])
            if ids_to_delete:
                collection.delete(ids=ids_to_delete)
                logger.info("Deleted %d stale chunks for page_id '%s'", len(ids_to_delete), page_id)
                return len(ids_to_delete)
            return 0
        except Exception as exc:
            logger.error("Failed to delete chunks for page_id '%s': %s", page_id, exc)
            return 0

    async def count(self) -> int:
        collection = self._get_collection()
        return collection.count()

    async def clear(self) -> bool:
        if self._client:
            self._client.delete_collection(name=self.collection_name)
            self._collection = None
            return True
        return False
