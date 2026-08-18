"""Admin Scraper Lifecycle & Self-Healing Service (Features 3.1 & 3.5).

Coordinates:
- Scraper creation (FR-101)
- Scraper execution & data ingestion (FR-102)
- Auto-healing detection & invocation (FR-502)
- Heal approval / rejection & automatic re-indexing (FR-504, FR-505)
"""

import logging
from typing import Any, Dict, List, Optional, Tuple

from core.config import settings
from core.models import HealEvent, IndexingProgress, Page, ScrapeRun, ScrapeRunStatus, ScrapedPageSummary
from core.security import audit_log
from pipeline.chunker import DocumentChunker
from pipeline.embeddings.factory import get_embedding_provider
from pipeline.indexer import DocumentIndexer
from retrieval.factory import get_vector_store
from scraper.client import BrightDataClient
from scraper.logger import run_logger
from scraper.validator import PageValidator

logger = logging.getLogger("docmind.admin.service")


class AdminScraperService:
    """Orchestrates administrative tasks, scraping runs, indexing, and healing cycles."""

    def __init__(
        self,
        bdata_client: Optional[BrightDataClient] = None,
        chunker: Optional[DocumentChunker] = None,
        embedding_provider=None,
        vector_store=None,
        indexer: Optional[DocumentIndexer] = None,
    ):
        self.bdata_client = bdata_client or BrightDataClient()
        self.chunker = chunker or DocumentChunker()
        self.embedding_provider = embedding_provider or get_embedding_provider()
        self.vector_store = vector_store or get_vector_store()
        self.indexer = indexer or DocumentIndexer(
            chunker=self.chunker,
            embedding_provider=self.embedding_provider,
            vector_store=self.vector_store,
        )

    def get_active_collector_id(self) -> Optional[str]:
        """Resolve active collector ID from settings or persisted state."""
        if settings.brightdata_collector_id:
            return settings.brightdata_collector_id
        state = run_logger.load_scraper_state()
        return state.get("active_collector_id")

    def get_indexing_progress(self) -> IndexingProgress:
        """Return real-time indexing progress for Admin UI."""
        return self.indexer.get_progress()

    async def reindex_delta(
        self,
        scrape_run_id: Optional[str] = None,
        page_urls: Optional[List[str]] = None,
        actor: str = "admin",
    ) -> Tuple[int, int]:
        """Trigger delta re-indexing for a subset of pages (FR-204)."""
        pages_cnt, chunks_cnt = await self.indexer.reindex_delta(
            scrape_run_id=scrape_run_id,
            page_urls=page_urls,
        )
        audit_log(
            "DELTA_REINDEX",
            actor,
            {"scrape_run_id": scrape_run_id, "pages_count": pages_cnt, "chunks_count": chunks_cnt},
        )
        return pages_cnt, chunks_cnt

    async def create_scraper(
        self, target_url: str, description: Optional[str] = None, actor: str = "admin"
    ) -> Optional[str]:
        """Create a new Sitemap scraper on Bright Data Scraper Studio (FR-101)."""
        desc = description or f"DocMind sitemap scraper for {target_url}"
        collector_id = await self.bdata_client.create_scraper(target_url, desc)

        if collector_id:
            # Update settings and persist state
            settings.brightdata_collector_id = collector_id
            settings.target_docs_url = target_url
            run_logger.save_scraper_state({
                "target_docs_url": target_url,
                "active_collector_id": collector_id,
            })
            audit_log(
                "SCRAPER_CREATE",
                actor,
                {"collector_id": collector_id, "target_url": target_url},
            )
        return collector_id

    async def run_and_index(
        self,
        collector_id: Optional[str] = None,
        target_url: Optional[str] = None,
        actor: str = "admin",
    ) -> Tuple[bool, ScrapeRun, List[ScrapedPageSummary]]:
        """Execute scraper run, validate, persist raw data, and index valid pages (FR-102 to FR-204)."""
        cid = collector_id or self.get_active_collector_id()
        if cid and cid.startswith("c_demo_"):
            active_real = self.get_active_collector_id()
            if active_real and not active_real.startswith("c_demo_"):
                cid = active_real

        url = target_url or settings.target_docs_url


        if not cid:
            raise ValueError(
                "Collector ID not configured. Please create a scraper first or provide a collector_id."
            )

        run = ScrapeRun(
            collector_id=cid,
            target_url=url,
            status=ScrapeRunStatus.RUNNING,
        )
        run_logger.record_run(run)
        audit_log("SCRAPER_RUN_START", actor, {"scrape_run_id": run.id, "collector_id": cid, "url": url})

        success, raw_pages, error = await self.bdata_client.run_scraper(cid, url)

        # 1. Persist raw JSON output immediately (FR-102)
        if raw_pages:
            run_logger.save_raw_scrape(run.id, raw_pages)

        if not success:
            run.status = ScrapeRunStatus.FAILED
            run.error_summary = error
            run_logger.record_run(run)
            audit_log("SCRAPER_RUN_FAILED", actor, {"scrape_run_id": run.id, "error": error})
            return False, run, []

        # 2. Strict validation (FR-103)
        valid_pages, failures = PageValidator.validate_batch(raw_pages, scrape_run_id=run.id)
        page_summaries = PageValidator.summarize_batch(raw_pages, scrape_run_id=run.id)
        run.page_count = len(valid_pages)

        if not valid_pages:
            run.status = ScrapeRunStatus.HEALING_REQUIRED
            run.error_summary = (
                f"All {len(raw_pages)} scraped pages failed validation (empty title or content)"
            )
            run_logger.record_run(run)
            return False, run, page_summaries

        # 3. Indexing Pipeline: automatic async indexing after successful scrape (FR-201 - FR-204)
        try:
            pages_indexed, chunks_indexed = await self.indexer.index_pages(valid_pages)

            run.status = ScrapeRunStatus.COMPLETED
            run_logger.record_run(run)
            audit_log(
                "SCRAPER_RUN_SUCCESS",
                actor,
                {
                    "scrape_run_id": run.id,
                    "valid_pages": len(valid_pages),
                    "chunks_indexed": chunks_indexed,
                    "failed_records": len(failures),
                },
            )
            return True, run, page_summaries
        except Exception as exc:
            logger.exception("Failed during chunking/indexing pipeline: %s", exc)
            run.status = ScrapeRunStatus.FAILED
            run.error_summary = f"Indexing failure: {exc}"
            run_logger.record_run(run)
            return False, run, page_summaries


    def get_latest_scraped_pages(self) -> List[ScrapedPageSummary]:
        """Retrieve summaries of the most recently scraped pages."""
        raw_pages = run_logger.get_latest_raw_scrape()
        latest_run = run_logger.get_latest_run()
        run_id = latest_run.id if latest_run else "unknown"
        return PageValidator.summarize_batch(raw_pages, scrape_run_id=run_id)

    def get_run_pages(self, run_id: str) -> List[ScrapedPageSummary]:
        """Retrieve summaries of scraped pages for a specific run ID."""
        raw_pages = run_logger.get_raw_scrape_by_id(run_id)
        return PageValidator.summarize_batch(raw_pages, scrape_run_id=run_id)

    async def trigger_heal(
        self,
        collector_id: str,
        break_description: str,
        actor: str = "admin",
    ) -> Tuple[bool, HealEvent]:
        """Invoke `bdata scraper heal` for broken scraper (FR-502, FR-503)."""
        heal_event = HealEvent(
            collector_id=collector_id,
            break_description=break_description,
        )
        run_logger.record_heal(heal_event)

        success, fix_summary = await self.bdata_client.heal_scraper(
            collector_id, break_description
        )
        heal_event.fix_summary = fix_summary
        run_logger.record_heal(heal_event)

        audit_log("HEAL_TRIGGERED", actor, {"heal_event_id": heal_event.id, "collector_id": collector_id})

        # Check auto-approve gate (FR-503)
        if settings.docmind_auto_approve_heals and success:
            logger.info("DOCMIND_AUTO_APPROVE_HEALS enabled; auto-approving heal %s", heal_event.id)
            await self.approve_heal_and_reindex(
                heal_event_id=heal_event.id,
                approve=True,
                actor="auto-heal-daemon",
            )

        return success, heal_event

    async def approve_heal_and_reindex(
        self,
        heal_event_id: str,
        approve: bool = True,
        feedback: Optional[str] = None,
        actor: str = "admin",
    ) -> Tuple[bool, str]:
        """Approve/reject heal fix and trigger re-index upon approval (FR-504, FR-505)."""
        heals = run_logger.list_heals(limit=100)
        heal_event = next((h for h in heals if h.id == heal_event_id), None)

        if not heal_event:
            return False, "Heal event not found"

        collector_id = heal_event.collector_id
        success, status_msg = await self.bdata_client.approve_heal(
            collector_id, reject=(not approve)
        )

        heal_event.approved = approve
        run_logger.record_heal(heal_event)

        audit_log(
            "HEAL_APPROVAL_DECISION",
            actor,
            {"heal_event_id": heal_event.id, "approved": approve, "status": status_msg},
        )

        if approve and success:
            # Re-run scraper and auto re-index (FR-504)
            _, new_run, _ = await self.run_and_index(collector_id=collector_id, actor=actor)
            heal_event.resulting_scrape_run_id = new_run.id
            run_logger.record_heal(heal_event)
            return True, f"Heal approved and re-indexing completed (ScrapeRun {new_run.id})"

        return success, status_msg

    async def simulate_degraded_scrape(
        self,
        collector_id: Optional[str] = None,
        actor: str = "admin-demo",
    ) -> Tuple[ScrapeRun, Optional[HealEvent]]:
        """Simulate an artificial degraded scrape run for demo and testing purposes (FR-501, FR-502).

        Injects a run with critically reduced page count (1 page) and broken structural content,
        causing HealthMonitor to flip to DEGRADED and auto-trigger the heal cycle.
        """
        cid = collector_id or "c_demo_healing"
        url = settings.target_docs_url

        # Artificial degraded payload (1 valid page, 1 broken page)
        degraded_raw_pages = [
            {
                "url": f"{url}/docs/intro",
                "title": "LiteLLM Overview",
                "content": "Short intro snippet with missing sections...",
            },
            {
                "url": f"{url}/docs/broken",
                "title": "",  # Empty title -> will fail validation
                "content": "",
            },
        ]


        run = ScrapeRun(
            collector_id=cid,
            target_url=url,
            status=ScrapeRunStatus.COMPLETED,
            page_count=1,  # Only 1 valid page, down from baseline
        )
        run_logger.save_raw_scrape(run.id, degraded_raw_pages)
        run_logger.record_run(run)

        audit_log("SIMULATE_DEGRADED_RUN", actor, {"scrape_run_id": run.id, "collector_id": cid})

        from admin.monitor import HealthMonitor
        _, _, heal_event = await HealthMonitor.check_and_auto_heal(self)

        return run, heal_event


# Global service instance
admin_service = AdminScraperService()


