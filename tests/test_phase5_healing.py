"""Phase 5 Verification Tests: Self-Healing Monitor & Recovery (FR-501 to FR-505)."""

import pytest
from unittest.mock import AsyncMock
from core.models import HealEvent, ScrapeRun, ScrapeRunStatus, SystemHealthState
from core.config import settings
from admin.monitor import HealthMonitor
from admin.service import AdminScraperService
from scraper.client import BrightDataClient
from scraper.logger import ScrapeRunLogger


@pytest.fixture(autouse=True)
def setup_test_environment(tmp_path, monkeypatch):
    """Ensure tests run cleanly with isolated test log files and mock providers."""
    monkeypatch.setenv("DOCMIND_MOCK_EMBEDDINGS", "true")
    monkeypatch.setenv("DOCMIND_MOCK_LLM", "true")
    monkeypatch.setenv("DOCMIND_AUTO_APPROVE_HEALS", "false")
    monkeypatch.setattr(settings, "min_expected_pages", 2)
    monkeypatch.setattr(settings, "page_count_drop_threshold_pct", 50.0)

    # Isolated test logger in tmp directory
    test_logger = ScrapeRunLogger(storage_dir=str(tmp_path / "logs"))
    monkeypatch.setattr("scraper.logger.run_logger", test_logger)
    monkeypatch.setattr("admin.monitor.run_logger", test_logger)
    monkeypatch.setattr("admin.service.run_logger", test_logger)


@pytest.mark.asyncio
async def test_health_monitor_evaluates_degraded_page_count_drop():
    """Verify FR-501: Monitor detects significant page count drop and marks DEGRADED with diagnostic."""
    from scraper.logger import run_logger

    # 1. Baseline run with 13 pages
    run_baseline = ScrapeRun(
        collector_id="c_test_123",
        target_url="https://docs.litellm.ai",
        status=ScrapeRunStatus.COMPLETED,
        page_count=13,
    )
    run_logger.record_run(run_baseline)

    health, msg, diag = HealthMonitor.evaluate_system_health()
    assert health == SystemHealthState.HEALTHY

    # 2. Degraded run with only 2 pages (84.6% drop)
    run_degraded = ScrapeRun(
        collector_id="c_test_123",
        target_url="https://docs.litellm.ai",
        status=ScrapeRunStatus.COMPLETED,
        page_count=2,
    )
    run_logger.record_run(run_degraded)

    health, msg, diag = HealthMonitor.evaluate_system_health()
    assert health == SystemHealthState.DEGRADED
    assert "dropped by" in diag or "low page count" in diag.lower()


@pytest.mark.asyncio
async def test_auto_heal_trigger_and_approval_gate():
    """Verify FR-502 & FR-503: Degraded state triggers heal; approval gate leaves status pending."""
    from scraper.logger import run_logger
    mock_bdata = BrightDataClient(mock_mode=True)
    service = AdminScraperService(bdata_client=mock_bdata)

    # Trigger degraded condition
    run = ScrapeRun(
        collector_id="c_test_gate",
        target_url="https://docs.litellm.ai",
        status=ScrapeRunStatus.HEALING_REQUIRED,
        error_summary="All 10 pages returned empty HTML content",
    )
    run_logger.record_run(run)

    # Check and auto-heal
    health, msg, heal_event = await HealthMonitor.check_and_auto_heal(service)

    assert health == SystemHealthState.HEALING
    assert heal_event is not None
    assert heal_event.collector_id == "c_test_gate"
    assert heal_event.approved is None, "Heal must remain in pending_review state by default"
    assert heal_event.fix_summary is not None


@pytest.mark.asyncio
async def test_approve_heal_and_reindex_flow():
    """Verify FR-504: Approve action invokes bdata approve, triggers re-scrape, and auto re-indexes."""
    from scraper.logger import run_logger
    mock_bdata = BrightDataClient(mock_mode=True)
    service = AdminScraperService(bdata_client=mock_bdata)

    # Create a pending heal event
    heal_event = HealEvent(
        collector_id="c_test_approve",
        break_description="Selectors broken",
        fix_summary="Updated CSS selectors for main article container",
        approved=None,
    )
    run_logger.record_heal(heal_event)

    # Execute approve
    success, message = await service.approve_heal_and_reindex(
        heal_event_id=heal_event.id,
        approve=True,
    )

    assert success is True
    assert "Heal approved and re-indexing completed" in message

    # Verify HealEvent was updated
    updated_heal = next(h for h in run_logger.list_heals() if h.id == heal_event.id)
    assert updated_heal.approved is True
    assert updated_heal.resulting_scrape_run_id is not None

    # Verify system health returned to HEALTHY
    health, msg, _ = HealthMonitor.evaluate_system_health()
    assert health == SystemHealthState.HEALTHY


@pytest.mark.asyncio
async def test_reject_heal_flow():
    """Verify FR-505: Reject action updates HealEvent to rejected and does not re-index."""
    from scraper.logger import run_logger
    mock_bdata = BrightDataClient(mock_mode=True)
    service = AdminScraperService(bdata_client=mock_bdata)

    heal_event = HealEvent(
        collector_id="c_test_reject",
        break_description="Missing section titles",
        fix_summary="Suggested header tag fix",
        approved=None,
    )
    run_logger.record_heal(heal_event)

    success, message = await service.approve_heal_and_reindex(
        heal_event_id=heal_event.id,
        approve=False,
        feedback="Fix did not cover nested subheadings",
    )

    assert success is True
    updated_heal = next(h for h in run_logger.list_heals() if h.id == heal_event.id)
    assert updated_heal.approved is False
    assert updated_heal.resulting_scrape_run_id is None


@pytest.mark.asyncio
async def test_simulate_degraded_scrape_utility():
    """Verify demo simulation utility triggers full detect -> auto-heal flow."""
    mock_bdata = BrightDataClient(mock_mode=True)
    service = AdminScraperService(bdata_client=mock_bdata)

    run, heal_event = await service.simulate_degraded_scrape()

    assert run.status == ScrapeRunStatus.COMPLETED
    assert run.page_count == 1
    assert heal_event is not None
    assert heal_event.approved is None

    # Health monitor must report HEALING due to pending review
    health, _, _ = HealthMonitor.evaluate_system_health()
    assert health == SystemHealthState.HEALING
