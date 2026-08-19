"""Admin Management Routes (/api/admin/*) protected via admin auth."""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from core.models import (
    DeltaReindexRequest,
    DeltaReindexResponse,
    HealActionRequest,
    HealEvent,
    IndexingProgress,
    ScrapeResultResponse,
    ScrapedPageSummary,
    ScrapeRun,
    TriggerScrapeRequest,
)
from core.security import (
    audit_log,
    create_session_token,
    get_audit_logs,
    sanitize_admin_input,
    sanitize_target_url,
    verify_admin_auth,
)
from core.config import settings
from admin.service import admin_service
from scraper.logger import run_logger

# Unauthenticated authentication router
auth_router = APIRouter(prefix="/admin", tags=["Admin Auth"])

# Protected admin operational router
router = APIRouter(
    prefix="/admin",
    tags=["Admin"],
    dependencies=[Depends(verify_admin_auth)],
)


class AdminLoginRequest(BaseModel):
    username: str = Field(..., description="Admin username")
    password: str = Field(..., description="Admin password")


class AdminLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    username: str


@auth_router.post("/login", response_model=AdminLoginResponse)
async def admin_login(payload: AdminLoginRequest):
    """Authenticate admin credentials and issue a signed session token (SRS §5.1, §2.2)."""
    username = payload.username.strip()
    password = payload.password.strip()

    expected_username = settings.admin_username.strip()
    expected_password = settings.admin_password.strip()

    if username == expected_username and password == expected_password:
        token = create_session_token(subject=username)
        audit_log("ADMIN_LOGIN_SUCCESS", actor=username)
        return AdminLoginResponse(
            access_token=token,
            token_type="bearer",
            expires_in=settings.session_timeout_minutes * 60,
            username=username,
        )

    audit_log("ADMIN_LOGIN_FAILED", actor=username or "unknown")
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid admin username or password.",
        headers={"WWW-Authenticate": "Bearer"},
    )


class CreateScraperRequest(BaseModel):
    url: str = Field(..., description="Target documentation site URL")
    description: Optional[str] = Field(None, description="Custom description for the scraper")



@router.get("/state")
async def get_admin_state():
    """Retrieve current scraper configuration state and active collector ID."""
    state = run_logger.load_scraper_state()
    active_cid = admin_service.get_active_collector_id()
    latest_run = run_logger.get_latest_run()
    return {
        "target_docs_url": state.get("target_docs_url") or settings.target_docs_url,
        "active_collector_id": active_cid,
        "last_run": latest_run,
    }


@router.get("/indexing/progress", response_model=IndexingProgress)
async def get_indexing_progress():
    """Retrieve real-time indexing progress and last indexed timestamp (SRS §3.2)."""
    return admin_service.get_indexing_progress()


@router.post("/indexing/reindex", response_model=DeltaReindexResponse)
async def reindex_delta(payload: Optional[DeltaReindexRequest] = None):
    """Trigger delta re-indexing on a specific subset of pages or run (FR-204)."""
    try:
        scrape_run_id = payload.scrape_run_id if payload else None
        page_urls = payload.page_urls if payload else None
        pages_cnt, chunks_cnt = await admin_service.reindex_delta(
            scrape_run_id=scrape_run_id,
            page_urls=page_urls,
        )

        return DeltaReindexResponse(
            success=True,
            indexed_pages=pages_cnt,
            indexed_chunks=chunks_cnt,
            message=f"Successfully re-indexed {pages_cnt} pages into {chunks_cnt} chunks",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Delta re-indexing failed: {exc}",
        )



@router.post("/scraper/create")
async def create_scraper(payload: CreateScraperRequest):
    """Create a new sitemap scraper using Bright Data Scraper Studio (FR-101)."""
    collector_id = await admin_service.create_scraper(
        target_url=payload.url,
        description=payload.description,
    )
    if not collector_id:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create scraper via Bright Data CLI. Check credentials or site accessibility.",
        )
    return {
        "collector_id": collector_id,
        "url": payload.url,
        "message": f"Successfully created scraper on Bright Data Scraper Studio with Collector ID {collector_id}",
    }


@router.post("/scraper/run", response_model=ScrapeResultResponse)
async def run_scraper(payload: TriggerScrapeRequest):
    """Trigger a scraping run, validate pages, persist raw data, and index results (FR-102 to FR-104)."""
    try:
        success, run, pages = await admin_service.run_and_index(
            collector_id=payload.collector_id,
            target_url=payload.url,
        )
        valid_cnt = sum(1 for p in pages if p.is_valid)
        failed_cnt = len(pages) - valid_cnt
        return ScrapeResultResponse(
            success=success,
            scrape_run=run,
            pages=pages,
            valid_count=valid_cnt,
            failed_count=failed_cnt,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Scraper execution error: {exc}",
        )


@router.get("/pages/latest", response_model=List[ScrapedPageSummary])
async def get_latest_scraped_pages():
    """Retrieve summary of the most recently scraped pages for table view."""
    return admin_service.get_latest_scraped_pages()


@router.get("/runs/{run_id}/pages", response_model=List[ScrapedPageSummary])
async def get_run_pages(run_id: str):
    """Retrieve summary of scraped pages for a specific run ID."""
    return admin_service.get_run_pages(run_id)


class TriggerHealRequest(BaseModel):
    collector_id: Optional[str] = Field(None, description="Collector ID to heal")
    description: str = Field(..., description="Description of the detected failure or breakage")


class RejectHealRequest(BaseModel):
    feedback: Optional[str] = Field(None, description="Reason for rejection or adjusted instruction")


@router.get("/health")
async def get_admin_health():
    """Retrieve detailed system health state, degradation diagnostic, and pending heal status (FR-501)."""
    from admin.monitor import HealthMonitor
    health_state, reason, diag = HealthMonitor.evaluate_system_health()
    active_cid = admin_service.get_active_collector_id()
    latest_run = run_logger.get_latest_run()
    latest_heal = run_logger.get_latest_heal()
    heals = run_logger.list_heals(limit=5)
    pending_heal = next((h for h in heals if h.approved is None), None)

    return {
        "status": health_state.value,
        "reason": reason,
        "diagnostic": diag,
        "active_collector_id": active_cid,
        "target_docs_url": settings.target_docs_url,
        "latest_run": latest_run,
        "latest_heal": latest_heal,
        "pending_heal": pending_heal,
    }


@router.post("/heal/trigger")
async def trigger_heal_manual(payload: TriggerHealRequest):
    """Manually trigger Bright Data scraper healing (FR-502)."""
    cid = payload.collector_id or admin_service.get_active_collector_id()
    if not cid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Collector ID is required to trigger healing.",
        )
    success, heal_event = await admin_service.trigger_heal(
        collector_id=cid,
        break_description=payload.description,
    )
    return {
        "success": success,
        "heal_event": heal_event,
        "message": f"Heal cycle triggered for {cid}. Fix summary: {heal_event.fix_summary}",
    }


@router.post("/heal/{heal_id}/approve")
async def approve_heal_endpoint(heal_id: str):
    """Approve proposed heal fix and trigger re-scrape + re-indexing (FR-504)."""
    success, message = await admin_service.approve_heal_and_reindex(
        heal_event_id=heal_id,
        approve=True,
    )
    if not success and "not found" in message.lower():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message)
    return {"success": success, "message": message}


@router.post("/heal/{heal_id}/reject")
async def reject_heal_endpoint(heal_id: str, payload: Optional[RejectHealRequest] = None):
    """Reject proposed heal fix and allow retry (FR-505)."""
    feedback = payload.feedback if payload else None
    success, message = await admin_service.approve_heal_and_reindex(
        heal_event_id=heal_id,
        approve=False,
        feedback=feedback,
    )
    if not success and "not found" in message.lower():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message)
    return {"success": success, "message": message}


@router.post("/heal/simulate-degraded")
async def simulate_degraded_scrape_endpoint():
    """Demo & Testing Utility: Ingest degraded data to demonstrate detect -> heal -> approve -> reindex cycle."""
    run, heal_event = await admin_service.simulate_degraded_scrape()
    return {
        "success": True,
        "simulated_run": run,
        "heal_event": heal_event,
        "message": (
            f"Simulated degraded run {run.id} created! Health status flipped to 'DEGRADED', "
            f"and auto-heal triggered (HealEvent: {heal_event.id if heal_event else 'None'})."
        ),
    }


@router.get("/heal/history", response_model=List[HealEvent])
@router.get("/heals", response_model=List[HealEvent])
async def list_heal_events(limit: int = Query(20, ge=1, le=100)):
    """List historical heal events (FR-501 to FR-505)."""
    return run_logger.list_heals(limit=limit)


@router.get("/runs", response_model=List[ScrapeRun])
async def list_scrape_runs(limit: int = Query(20, ge=1, le=100)):
    """List historical scrape runs."""
    return run_logger.list_runs(limit=limit)


@router.get("/audit-logs")
async def list_audit_logs(limit: int = Query(50, ge=1, le=200)):
    """Retrieve structured audit log trail of administrative and recovery actions (SRS §5.1)."""
    return get_audit_logs(limit=limit)


@router.post("/logout")
async def admin_logout(actor: str = Depends(verify_admin_auth)):
    """Log out current admin session and record audit event."""
    audit_log("ADMIN_LOGOUT", actor=actor)
    return {"success": True, "message": "Successfully logged out."}



