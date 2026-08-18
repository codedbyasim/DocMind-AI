"""Indexing Pipeline Coordinator per FR-201, FR-202, FR-203, FR-204.

Coordinates:
- Token-accurate page chunking (FR-201, FR-203)
- Embedding generation with retry and exponential backoff (FR-202)
- Local chunk and embedding persistence matching SRS §6.1 schema
- Vector database upsertion and stale chunk cleanup (FR-303 / R-08)
- Delta re-indexing for subsets of pages (FR-204)
- Live indexing progress tracking for Admin UI (SRS §3.2)
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from core.config import settings
from core.models import Chunk, EmbeddingRecord, IndexingProgress, Page
from pipeline.chunker import DocumentChunker
from pipeline.embeddings.factory import get_embedding_provider
from retrieval.factory import get_vector_store
from scraper.logger import run_logger
from scraper.validator import PageValidator

logger = logging.getLogger("docmind.pipeline.indexer")


class DocumentIndexer:
    """Manages document chunking, embedding generation, vector storage, and delta re-indexing."""

    def __init__(
        self,
        chunker: Optional[DocumentChunker] = None,
        embedding_provider=None,
        vector_store=None,
        storage_dir: str = "./data/indexed_chunks",
    ):
        self.chunker = chunker or DocumentChunker()
        self.embedding_provider = embedding_provider or get_embedding_provider()
        self.vector_store = vector_store or get_vector_store()
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.state_file = Path("./data/index_state.json")

        self._progress = IndexingProgress()
        self._load_last_state()

    def _load_last_state(self):
        """Load last indexed timestamp and counts from state file."""
        if self.state_file.exists():
            try:
                with open(self.state_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if "last_indexed_at" in data and data["last_indexed_at"]:
                        self._progress.last_indexed_at = datetime.fromisoformat(
                            data["last_indexed_at"]
                        )
                    self._progress.processed_pages = data.get("total_pages_indexed", 0)
                    self._progress.processed_chunks = data.get("total_chunks_indexed", 0)
            except Exception as e:
                logger.warning("Could not load index_state.json: %s", e)

    def _save_state(self, total_pages: int, total_chunks: int):
        """Persist index state to disk."""
        now = datetime.now(timezone.utc)
        self._progress.last_indexed_at = now
        try:
            self.state_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self.state_file, "w", encoding="utf-8") as f:
                json.dump(
                    {
                        "last_indexed_at": now.isoformat(),
                        "total_pages_indexed": total_pages,
                        "total_chunks_indexed": total_chunks,
                    },
                    f,
                    indent=2,
                )
        except Exception as e:
            logger.error("Failed to save index_state.json: %s", e)

    def get_progress(self) -> IndexingProgress:
        """Return current real-time indexing progress."""
        return self._progress

    def persist_chunks_and_embeddings(
        self,
        page: Page,
        chunks: List[Chunk],
        embeddings: List[List[float]],
    ):
        """Persist Chunk and EmbeddingRecord entities locally per SRS §6.1 schema."""
        page_file = self.storage_dir / f"{page.id}.json"
        records = []
        model_ver = getattr(self.embedding_provider, "model_name", settings.embedding_model)

        for chunk, emb in zip(chunks, embeddings):
            emb_record = EmbeddingRecord(
                chunk_id=chunk.id,
                vector=emb,
                embedding_model_version=model_ver,
            )
            records.append({
                "chunk": chunk.model_dump(mode="json"),
                "embedding": emb_record.model_dump(mode="json"),
            })

        try:
            with open(page_file, "w", encoding="utf-8") as f:
                json.dump(
                    {
                        "page_id": page.id,
                        "url": page.url,
                        "title": page.title,
                        "indexed_at": datetime.now(timezone.utc).isoformat(),
                        "records": records,
                    },
                    f,
                    indent=2,
                )
        except Exception as e:
            logger.error("Failed to persist chunk storage for page %s: %s", page.id, e)

    async def index_pages(
        self,
        pages: List[Page],
        is_delta: bool = False,
    ) -> Tuple[int, int]:
        """Process, chunk, embed, and index a list of valid documentation pages.

        Args:
            pages: List of validated Page models
            is_delta: True if this is a delta update for a subset of pages

        Returns:
            Tuple of (total_pages_indexed, total_chunks_indexed)
        """
        if not pages:
            return 0, 0

        self._progress.status = "indexing"
        self._progress.total_pages = len(pages)
        self._progress.processed_pages = 0
        self._progress.total_chunks = 0
        self._progress.processed_chunks = 0
        self._progress.error_message = None

        total_chunks_count = 0
        try:
            for idx, page in enumerate(pages):
                self._progress.current_page_title = page.title
                logger.info("Indexing page %d/%d: '%s' (%s)", idx + 1, len(pages), page.title, page.url)

                # Step 1: Token-accurate chunking (FR-201, FR-203)
                chunks = self.chunker.chunk_page(page)
                if not chunks:
                    self._progress.processed_pages += 1
                    continue

                self._progress.total_chunks += len(chunks)

                # Step 2: Embedding generation with retry (FR-202)
                texts = [c.text for c in chunks]
                embeddings = await self.embedding_provider.embed_texts(texts)

                # Step 3: Local persistence (SRS §6.1)
                self.persist_chunks_and_embeddings(page, chunks, embeddings)

                # Step 4: Stale chunk cleanup & vector DB upsertion (FR-303)
                await self.vector_store.delete_by_page_id(page.id)
                await self.vector_store.upsert_chunks(chunks, embeddings)

                total_chunks_count += len(chunks)
                self._progress.processed_chunks += len(chunks)
                self._progress.processed_pages += 1

            self._progress.status = "completed"
            self._save_state(len(pages), total_chunks_count)
            logger.info("Successfully indexed %d pages (%d chunks total)", len(pages), total_chunks_count)
            return len(pages), total_chunks_count

        except Exception as exc:
            logger.exception("Indexing job encountered an error: %s", exc)
            self._progress.status = "failed"
            self._progress.error_message = str(exc)
            raise

    async def reindex_delta(
        self,
        scrape_run_id: Optional[str] = None,
        page_urls: Optional[List[str]] = None,
    ) -> Tuple[int, int]:
        """Perform delta re-indexing on a specific subset of pages (FR-204).

        Args:
            scrape_run_id: Optional specific scrape run ID to re-index
            page_urls: Optional specific list of page URLs to re-index

        Returns:
            Tuple of (pages_indexed, chunks_indexed)
        """
        raw_pages: List[Dict[str, Any]] = []

        if scrape_run_id:
            raw_pages = run_logger.get_raw_scrape_by_id(scrape_run_id)
        else:
            raw_pages = run_logger.get_latest_raw_scrape()

        if not raw_pages:
            logger.warning("No raw scrape pages found for delta re-indexing")
            return 0, 0

        run_id = scrape_run_id or (run_logger.get_latest_run().id if run_logger.get_latest_run() else "delta_run")
        valid_pages, _ = PageValidator.validate_batch(raw_pages, scrape_run_id=run_id)

        # Filter by URL subset if requested
        if page_urls:
            target_urls = set(u.strip() for u in page_urls)
            valid_pages = [p for p in valid_pages if p.url in target_urls]

        logger.info("Triggering delta re-indexing for %d target pages", len(valid_pages))
        return await self.index_pages(valid_pages, is_delta=True)


# Global document indexer singleton
document_indexer = DocumentIndexer()
