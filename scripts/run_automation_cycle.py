#!/usr/bin/env python
"""DocMind Unattended Automation & Scheduling Cycle (FR-601 to FR-602, SRS §3.5).

Entrypoint for scheduled CI/CD runs (e.g. GitHub Actions cron) and local automated runs.
Performs: Scrape -> Health Validation -> Autonomous Heal (Auto-Approve in CI) -> Delta Re-Index.

Exit Codes:
- 0: Successful scrape and health check, or successfully healed and restored.
- 1: Unrecoverable failure or degraded state after heal attempt.
"""

import argparse
import asyncio
import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

# Ensure repository root is on sys.path
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from admin.monitor import HealthMonitor
from admin.service import admin_service
from core.config import settings
from core.models import SystemHealthState
from core.security import audit_log
from scraper.logger import run_logger


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("docmind.automation")


async def run_automation_cycle(
    collector_id: Optional[str] = None,
    target_url: Optional[str] = None,
    auto_approve: bool = True,
    is_mock: bool = False,
    output_dir: Path = Path("./data/logs"),
) -> Dict[str, Any]:
    """Execute the unattended scrape -> validate -> heal -> re-index lifecycle."""
    output_dir.mkdir(parents=True, exist_ok=True)
    report_file = output_dir / "automation_report.json"
    summary_file = output_dir / "automation_summary.md"

    if is_mock:
        admin_service.bdata_client.is_mock = True

    cid = collector_id or admin_service.get_active_collector_id() or settings.brightdata_collector_id
    if not cid:
        cid = "c_msyg7ceoo6la3ofn6"


    start_time = datetime.now(timezone.utc)
    report: Dict[str, Any] = {
        "timestamp": start_time.isoformat(),
        "collector_id": cid,
        "target_url": target_url or settings.target_docs_url,
        "mode": "unattended_ci_automation",
        "initial_health": None,
        "final_health": None,
        "outcome": "FAILED",
        "scrape_run_id": None,
        "pages_scraped": 0,
        "valid_pages": 0,
        "chunks_indexed": 0,
        "heal_applied": False,
        "heal_event_id": None,
        "details": "",
    }

    logger.info("=" * 70)
    logger.info("STARTING DOCMIND AUTOMATION CYCLE (FR-601/FR-602)")
    logger.info("Target Collector ID : %s", cid)
    logger.info("Target Docs URL      : %s", report["target_url"])
    logger.info("Auto-Approve Heals   : %s (Unattended Mode)", auto_approve)
    logger.info("=" * 70)

    try:
        # Step 1: Execute Scrape Run & Ingestion
        logger.info("[Step 1/4] Triggering automated scrape run...")
        success, scrape_run, pages = await admin_service.run_and_index(
            collector_id=cid,
            target_url=target_url or settings.target_docs_url,
            actor="github-actions-automation",
        )
        report["scrape_run_id"] = scrape_run.id
        report["pages_scraped"] = scrape_run.page_count
        report["valid_pages"] = len([p for p in pages if p.is_valid]) if pages else scrape_run.page_count
        logger.info("Scrape completed: %d pages scraped (%d valid)", scrape_run.page_count, report["valid_pages"])




        # Step 2: Evaluate System Health (FR-501)
        logger.info("[Step 2/4] Validating scrape health & structural completeness...")
        health_state, reason, diag = HealthMonitor.evaluate_system_health()
        report["initial_health"] = health_state.value
        logger.info("System Health Assessment: %s (%s)", health_state.value, reason)

        # Step 3: Handle Healthy vs Degraded States
        if health_state == SystemHealthState.HEALTHY:
            logger.info("System is HEALTHY. No healing required.")
            report["final_health"] = SystemHealthState.HEALTHY.value
            report["outcome"] = "SUCCESS"
            report["details"] = f"Scrape run {scrape_run.id} verified healthy with {report['valid_pages']} valid pages."
        elif health_state in (SystemHealthState.DEGRADED, SystemHealthState.HEALING):

            logger.warning("[Step 3/4] Degradation detected: %s. Initiating autonomous healing...", diag)
            report["heal_applied"] = True

            # Trigger Heal Cycle (FR-502)
            heal_success, heal_event = await admin_service.trigger_heal(
                collector_id=cid,
                break_description=diag or "Automated scrape detected page-count drop or structural validation failures.",
            )

            if heal_event:
                report["heal_event_id"] = heal_event.id

            if not heal_success or not heal_event:
                logger.error("Healing trigger failed. Collector: %s", cid)
                report["final_health"] = SystemHealthState.ERROR.value
                report["outcome"] = "FAILED"
                report["details"] = "Autonomous heal trigger failed to generate a repair proposal."
            else:
                logger.info("Heal proposed: %s", heal_event.fix_summary)
                if auto_approve:
                    logger.info("[Step 4/4] Auto-approving repair and triggering delta re-index (FR-504)...")
                    approve_success, approve_msg = await admin_service.approve_heal_and_reindex(
                        heal_event_id=heal_event.id,
                        approve=True,
                    )
                    logger.info("Approve and re-index result: %s (%s)", approve_success, approve_msg)

                    # Re-evaluate final health post-heal
                    final_state, final_reason, _ = HealthMonitor.evaluate_system_health()
                    report["final_health"] = final_state.value
                    if final_state == SystemHealthState.HEALTHY or approve_success:
                        report["outcome"] = "HEALED"
                        report["details"] = f"Scraper self-healed and re-indexed. {approve_msg}"
                    else:
                        report["outcome"] = "FAILED"
                        report["details"] = f"Heal applied but health remained {final_state.value}: {final_reason}"
                else:
                    report["final_health"] = SystemHealthState.HEALING.value
                    report["outcome"] = "PENDING_APPROVAL"
                    report["details"] = f"Heal event {heal_event.id} generated awaiting manual admin approval."
        else:
            logger.error("Scrape run resulted in ERROR state: %s", reason)
            report["final_health"] = SystemHealthState.ERROR.value
            report["outcome"] = "FAILED"
            report["details"] = f"Scrape failed: {reason}"

    except Exception as exc:
        logger.exception("Fatal unhandled exception in automation cycle: %s", exc)
        report["final_health"] = SystemHealthState.ERROR.value
        report["outcome"] = "FAILED"
        report["details"] = f"Exception: {str(exc)}"


    # Audit Logging & Persistence (FR-602)
    audit_log(
        action=f"AUTOMATION_CYCLE_{report['outcome']}",
        actor="github-actions-automation",
        details=report,
    )

    # Save JSON report
    with open(report_file, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    # Generate Markdown Summary (compatible with GitHub Actions Step Summary)
    summary_md = f"""# 🤖 DocMind Autonomous Scrape & Heal Report

| Parameter | Value |
| :--- | :--- |
| **Outcome** | `{"✅ " + report["outcome"] if report["outcome"] in ("SUCCESS", "HEALED") else "❌ " + report["outcome"]}` |
| **Timestamp** | `{report["timestamp"]}` |
| **Target URL** | [{report["target_url"]}]({report["target_url"]}) |
| **Collector ID** | `{report["collector_id"]}` |
| **Initial Health** | `{report["initial_health"]}` |
| **Final Health** | `{report["final_health"]}` |
| **Scrape Run ID** | `{report["scrape_run_id"] or "N/A"}` |
| **Pages Processed** | `{report["valid_pages"]} valid / {report["pages_scraped"]} total` |
| **Self-Heal Triggered** | `{"Yes (Heal Event: " + str(report["heal_event_id"]) + ")" if report["heal_applied"] else "No (Healthy)"}` |

### Details
> {report["details"]}
"""
    with open(summary_file, "w", encoding="utf-8") as f:
        f.write(summary_md)

    # Write to GitHub Step Summary if available in CI environment
    github_step_summary = os.getenv("GITHUB_STEP_SUMMARY")
    if github_step_summary:
        try:
            with open(github_step_summary, "a", encoding="utf-8") as f:
                f.write(summary_md + "\n")
        except Exception as exc:
            logger.warning("Could not write to GITHUB_STEP_SUMMARY: %s", exc)

    logger.info("=" * 70)
    logger.info("AUTOMATION CYCLE COMPLETE: Outcome=%s | Final Health=%s", report["outcome"], report["final_health"])
    logger.info("Report JSON: %s", report_file)
    logger.info("Report MD  : %s", summary_file)
    logger.info("=" * 70)

    return report


def parse_args():
    parser = argparse.ArgumentParser(description="DocMind Autonomous Scrape & Heal Automation Cycle")
    parser.add_argument("--collector-id", type=str, default=None, help="Bright Data Collector ID")
    parser.add_argument("--url", type=str, default=None, help="Target documentation site URL")
    parser.add_argument("--auto-approve", action="store_true", default=True, help="Auto-approve heals in unattended mode")
    parser.add_argument("--no-auto-approve", action="store_false", dest="auto_approve", help="Do not auto-approve heals")
    parser.add_argument("--mock", action="store_true", help="Run with mock scraper client and embeddings")
    parser.add_argument("--output-dir", type=str, default="./data/logs", help="Directory for output report files")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    if args.mock:
        os.environ["DOCMIND_MOCK_SCRAPER"] = "true"
        os.environ["DOCMIND_MOCK_EMBEDDINGS"] = "true"
        os.environ["DOCMIND_MOCK_LLM"] = "true"

    result = asyncio.run(
        run_automation_cycle(
            collector_id=args.collector_id,
            target_url=args.url,
            auto_approve=args.auto_approve,
            is_mock=args.mock,
            output_dir=Path(args.output_dir),
        )
    )

    if result["outcome"] in ("SUCCESS", "HEALED"):
        sys.exit(0)
    else:
        logger.error("Automation cycle failed with outcome: %s", result["outcome"])
        sys.exit(1)
