"""Unit tests for ScrapeRunLogger per FR-104 and SRS Section 6.1."""

import os
import shutil
import tempfile
import pytest
from core.models import ScrapeRun, ScrapeRunStatus, HealEvent
from scraper.logger import ScrapeRunLogger


@pytest.fixture
def temp_logger():
    temp_dir = tempfile.mkdtemp()
    logger = ScrapeRunLogger(storage_dir=temp_dir)
    yield logger
    shutil.rmtree(temp_dir, ignore_errors=True)


def test_logger_record_and_list_runs(temp_logger):
    """Verify recording, updating, and listing scrape runs."""
    run1 = ScrapeRun(
        collector_id="c_test_001",
        target_url="https://docs.litellm.ai",
        status=ScrapeRunStatus.RUNNING,
        page_count=0,
    )
    temp_logger.record_run(run1)

    assert temp_logger.get_latest_run().id == run1.id
    assert temp_logger.get_latest_run().status == ScrapeRunStatus.RUNNING

    # Update run status
    run1.status = ScrapeRunStatus.COMPLETED
    run1.page_count = 42
    temp_logger.record_run(run1)

    assert temp_logger.get_latest_run().status == ScrapeRunStatus.COMPLETED
    assert temp_logger.get_latest_run().page_count == 42
    assert len(temp_logger.list_runs()) == 1


def test_logger_record_heal_events(temp_logger):
    """Verify recording and listing heal events."""
    heal = HealEvent(
        collector_id="c_test_001",
        break_description="Selector #doc-content missing due to redesign",
        fix_summary="Updated main content selector to article.doc-page",
    )
    temp_logger.record_heal(heal)

    assert temp_logger.get_latest_heal().id == heal.id
    assert len(temp_logger.list_heals()) == 1


def test_logger_save_and_load_state(temp_logger):
    """Verify state persistence for active collector ID and target docs URL."""
    state = {
        "target_docs_url": "https://docs.litellm.ai",
        "active_collector_id": "c_persisted_123",
    }
    temp_logger.save_scraper_state(state)
    loaded = temp_logger.load_scraper_state()
    assert loaded.get("active_collector_id") == "c_persisted_123"
    assert loaded.get("target_docs_url") == "https://docs.litellm.ai"
