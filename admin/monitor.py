"""Health Check & Scraper Output Monitoring (FR-501 to FR-503, System Health).

Evaluates:
1. Output completeness (non-empty required fields across scraped pages via PageValidator)
2. Page count thresholds & drop percentage compared to historical baseline (FR-501)
3. Recent scraper execution status and errors
4. Automatic heal invocation on degradation (FR-502)
"""

import logging
from typing import Optional, Tuple
from core.config import settings
from core.models import HealEvent, ScrapeRun, ScrapeRunStatus, SystemHealthState
from scraper.logger import run_logger

logger = logging.getLogger("docmind.admin.monitor")


class HealthMonitor:
    """Monitors scraper performance, detects degradation, and coordinates auto-healing."""

    @classmethod
    def evaluate_system_health(cls) -> Tuple[SystemHealthState, str, Optional[str]]:
        """Assess current health based on recent runs, historical page counts, and heal events.

        Returns:
            Tuple of (health_state, description_message, break_diagnostic_if_degraded)
        """
        latest_heal = run_logger.get_latest_heal()
        latest_run = run_logger.get_latest_run()

        # 1. Check for active pending heal review (FR-503)
        if latest_heal and latest_heal.approved is None:
            return (
                SystemHealthState.HEALING,
                f"Pending heal review for Collector '{latest_heal.collector_id}': {latest_heal.break_description}",
                None,
            )

        # 2. Check for fresh system without any runs
        if not latest_run:
            return (
                SystemHealthState.HEALTHY,
                "System initialized; awaiting first scrape run.",
                None,
            )

        # 3. Check for direct run failures
        if latest_run.status == ScrapeRunStatus.FAILED:
            return (
                SystemHealthState.ERROR,
                f"Latest scrape run failed: {latest_run.error_summary or 'Unknown error'}",
                latest_run.error_summary or "Scraper execution failed",
            )

        if latest_run.status == ScrapeRunStatus.HEALING_REQUIRED:
            diag = latest_run.error_summary or "Scraper output failed structural validation (empty titles or content)."
            return (
                SystemHealthState.DEGRADED,
                f"Scraper output structure degraded: {diag}",
                diag,
            )

        # 4. Check historical page count drop percentage (FR-501)
        runs = run_logger.list_runs(limit=10)
        successful_previous_runs = [
            r for r in runs
            if r.id != latest_run.id and r.status == ScrapeRunStatus.COMPLETED and r.page_count > 0
        ]

        if successful_previous_runs:
            prev_run = successful_previous_runs[0]
            if prev_run.page_count > 0:
                drop_pct = ((prev_run.page_count - latest_run.page_count) / prev_run.page_count) * 100.0
                if drop_pct >= settings.page_count_drop_threshold_pct:
                    diag = (
                        f"Page count dropped by {drop_pct:.1f}% (from {prev_run.page_count} to {latest_run.page_count} pages). "
                        f"Possible sitemap change, paywall, or broken CSS selectors."
                    )
                    return (
                        SystemHealthState.DEGRADED,
                        diag,
                        diag,
                    )

        # 5. Check absolute page count minimum threshold
        if latest_run.page_count < settings.min_expected_pages:
            diag = (
                f"Critically low page count ({latest_run.page_count} pages) detected in recent scrape "
                f"(minimum expected: {settings.min_expected_pages})."
            )
            return (
                SystemHealthState.DEGRADED,
                diag,
                diag,
            )

        return (
            SystemHealthState.HEALTHY,
            f"All systems operational. {latest_run.page_count} pages indexed in knowledge base.",
            None,
        )

    @classmethod
    async def check_and_auto_heal(cls, service) -> Tuple[SystemHealthState, str, Optional[HealEvent]]:
        """Evaluate health and automatically trigger bdata heal if degraded (FR-502).

        Args:
            service: AdminScraperService instance

        Returns:
            Tuple of (health_state, message, created_heal_event_if_any)
        """
        health_state, reason, diagnostic = cls.evaluate_system_health()

        if health_state == SystemHealthState.DEGRADED and diagnostic:
            latest_run = run_logger.get_latest_run()
            collector_id = (latest_run.collector_id if latest_run and latest_run.collector_id else None) or service.get_active_collector_id()
            if not collector_id:
                return health_state, f"Degraded state detected, but no Collector ID configured: {reason}", None

            latest_heal = run_logger.get_latest_heal()
            # Do not re-trigger if already pending
            if latest_heal and latest_heal.approved is None and latest_heal.collector_id == collector_id:
                return SystemHealthState.HEALING, f"Auto-heal already pending review: {latest_heal.break_description}", latest_heal

            logger.warning("Degraded health detected! Auto-triggering Bright Data heal: %s", diagnostic)
            success, heal_event = await service.trigger_heal(
                collector_id=collector_id,
                break_description=diagnostic,
                actor="auto-monitor",
            )
            return SystemHealthState.HEALING, f"Auto-heal triggered: {heal_event.break_description}", heal_event

        return health_state, reason, None

