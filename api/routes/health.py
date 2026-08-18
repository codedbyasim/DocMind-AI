"""Health and status endpoint (/api/health)."""

from fastapi import APIRouter
from core.config import settings
from core.models import HealthStatusResponse
from admin.monitor import HealthMonitor
from retrieval.factory import get_vector_store
from scraper.logger import run_logger

router = APIRouter(prefix="/health", tags=["Health"])


@router.get("", response_model=HealthStatusResponse)
async def get_health_status() -> HealthStatusResponse:
    """Retrieve the overall system health, active provider configuration, and indexing metrics."""
    health_state, _, _ = HealthMonitor.evaluate_system_health()
    vector_store = get_vector_store()

    chunk_count = await vector_store.count()

    latest_run = run_logger.get_latest_run()
    latest_heal = run_logger.get_latest_heal()

    return HealthStatusResponse(
        status=health_state,
        active_collector_id=settings.brightdata_collector_id,
        target_docs_url=settings.target_docs_url,
        total_indexed_pages=latest_run.page_count if latest_run else 0,
        total_indexed_chunks=chunk_count,
        last_scrape_run=latest_run,
        last_heal_event=latest_heal,
        embedding_provider=settings.embedding_provider,
        llm_provider=settings.llm_provider,
        vector_db_provider=settings.vector_db_provider,
    )
