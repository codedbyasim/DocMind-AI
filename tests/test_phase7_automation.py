"""Phase 7 Verification Tests: Automation, Scheduling & CI Cycle (FR-601 to FR-602, SRS §3.5)."""

import json
import pytest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from core.models import HealEvent, ScrapeRun, ScrapeRunStatus, ScrapedPageSummary, SystemHealthState
from scripts.run_automation_cycle import run_automation_cycle


@pytest.fixture
def temp_output_dir(tmp_path):
    return tmp_path / "automation_logs"


@pytest.fixture
def sample_pages():
    return [
        ScrapedPageSummary(
            url="https://docs.litellm.ai/docs/intro",
            title="Introduction",
            section="Getting Started",
            content_snippet="LiteLLM is a lightweight SDK to call OpenAI, Anthropic...",
            content_length=240,
            is_valid=True,
        )
    ]


@pytest.mark.asyncio
async def test_automation_cycle_healthy_branch(temp_output_dir, sample_pages):
    """Verify automation cycle completes with SUCCESS when system health is healthy."""
    mock_run = ScrapeRun(
        id="run_healthy_123",
        collector_id="c_test_cid",
        target_url="https://docs.litellm.ai",
        status=ScrapeRunStatus.COMPLETED,
        page_count=10,
    )

    with patch("admin.service.admin_service.run_and_index", new=AsyncMock(return_value=(True, mock_run, sample_pages))), patch("admin.monitor.HealthMonitor.evaluate_system_health", return_value=(SystemHealthState.HEALTHY, "All good", None)):
        report = await run_automation_cycle(
            collector_id="c_test_cid",
            auto_approve=True,
            output_dir=temp_output_dir,
        )

        assert report["outcome"] == "SUCCESS"
        assert report["final_health"] == "healthy"
        assert report["heal_applied"] is False
        assert (temp_output_dir / "automation_report.json").exists()
        assert (temp_output_dir / "automation_summary.md").exists()


@pytest.mark.asyncio
async def test_automation_cycle_degraded_and_auto_heal_branch(temp_output_dir, sample_pages):
    """Verify automation cycle triggers auto-heal and delta re-index upon detecting degraded state."""
    mock_run = ScrapeRun(
        id="run_degraded_456",
        collector_id="c_test_cid",
        target_url="https://docs.litellm.ai",
        status=ScrapeRunStatus.COMPLETED,
        page_count=1,
    )
    mock_heal_event = HealEvent(
        id="heal_auto_789",
        collector_id="c_test_cid",
        break_description="Page count dropped by 90%",
        fix_summary="Repaired CSS selectors for navigation tree",
        status="pending_review",
    )

    with patch("admin.service.admin_service.run_and_index", new=AsyncMock(return_value=(True, mock_run, sample_pages))), patch("admin.monitor.HealthMonitor.evaluate_system_health", side_effect=[
        (SystemHealthState.DEGRADED, "Page count drop", "Page count dropped from 10 to 1"),
        (SystemHealthState.HEALTHY, "Restored healthy", None),
    ]), patch("admin.service.admin_service.trigger_heal", new=AsyncMock(return_value=(True, mock_heal_event))), patch("admin.service.admin_service.approve_heal_and_reindex", new=AsyncMock(return_value=(True, "Re-indexed 10 pages successfully"))):
        report = await run_automation_cycle(
            collector_id="c_test_cid",
            auto_approve=True,
            output_dir=temp_output_dir,
        )

        assert report["outcome"] == "HEALED"
        assert report["heal_applied"] is True
        assert report["heal_event_id"] == "heal_auto_789"
        assert report["final_health"] == "healthy"


@pytest.mark.asyncio
async def test_automation_cycle_unrecoverable_failure_branch(temp_output_dir):
    """Verify automation cycle handles unrecoverable scrape or service errors with FAILED outcome."""
    with patch("admin.service.admin_service.run_and_index", new=AsyncMock(side_effect=RuntimeError("Scraper CLI timed out"))):
        report = await run_automation_cycle(
            collector_id="c_test_cid",
            auto_approve=True,
            output_dir=temp_output_dir,
        )

        assert report["outcome"] == "FAILED"
        assert report["final_health"] == "error"
        assert "Scraper CLI timed out" in report["details"]


@pytest.mark.asyncio
async def test_automation_report_json_and_markdown_generation(temp_output_dir, sample_pages):
    """Verify structured report contains all required fields per FR-602."""
    mock_run = ScrapeRun(
        id="run_report_test",
        collector_id="c_test_cid",
        target_url="https://docs.litellm.ai",
        status=ScrapeRunStatus.COMPLETED,
        page_count=5,
    )

    with patch("admin.service.admin_service.run_and_index", new=AsyncMock(return_value=(True, mock_run, sample_pages))), patch("admin.monitor.HealthMonitor.evaluate_system_health", return_value=(SystemHealthState.HEALTHY, "OK", None)):
        await run_automation_cycle(
            collector_id="c_test_cid",
            target_url="https://docs.litellm.ai",
            auto_approve=True,
            output_dir=temp_output_dir,
        )

        # 1. Check JSON report
        json_file = temp_output_dir / "automation_report.json"
        with open(json_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            assert data["outcome"] == "SUCCESS"
            assert data["target_url"] == "https://docs.litellm.ai"
            assert data["pages_scraped"] == 5

        # 2. Check Markdown summary
        md_file = temp_output_dir / "automation_summary.md"
        with open(md_file, "r", encoding="utf-8") as f:
            md_content = f.read()
            assert "# 🤖 DocMind Autonomous Scrape & Heal Report" in md_content
            assert "https://docs.litellm.ai" in md_content
            assert "c_test_cid" in md_content
