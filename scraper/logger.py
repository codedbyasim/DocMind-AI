"""Scrape Run & Heal Event logger per FR-104 and SRS Section 6.1.

Maintains an in-memory and persistent JSON log of scrape executions and healing
events to feed pipeline health checks.
"""

import json
import logging
import os
from pathlib import Path
from typing import List, Optional
from core.models import HealEvent, ScrapeRun, ScrapeRunStatus

logger = logging.getLogger("docmind.scraper.logger")


class ScrapeRunLogger:
    """Manages recording and retrieval of ScrapeRuns and HealEvents."""

    def __init__(self, storage_dir: str = "./data/logs"):
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.runs_file = self.storage_dir / "scrape_runs.json"
        self.heals_file = self.storage_dir / "heal_events.json"
        self._scrape_runs: List[ScrapeRun] = self._load_runs()
        self._heal_events: List[HealEvent] = self._load_heals()

    def _load_runs(self) -> List[ScrapeRun]:
        if not self.runs_file.exists():
            return []
        try:
            with open(self.runs_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                return [ScrapeRun.model_validate(item) for item in data]
        except Exception as exc:
            logger.error("Failed to load scrape runs from %s: %s", self.runs_file, exc)
            return []

    def _save_runs(self) -> None:
        try:
            with open(self.runs_file, "w", encoding="utf-8") as f:
                data = [run.model_dump(mode="json") for run in self._scrape_runs]
                json.dump(data, f, indent=2)
        except Exception as exc:
            logger.error("Failed to persist scrape runs: %s", exc)

    def _load_heals(self) -> List[HealEvent]:
        if not self.heals_file.exists():
            return []
        try:
            with open(self.heals_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                return [HealEvent.model_validate(item) for item in data]
        except Exception as exc:
            logger.error("Failed to load heal events from %s: %s", self.heals_file, exc)
            return []

    def _save_heals(self) -> None:
        try:
            with open(self.heals_file, "w", encoding="utf-8") as f:
                data = [heal.model_dump(mode="json") for heal in self._heal_events]
                json.dump(data, f, indent=2)
        except Exception as exc:
            logger.error("Failed to persist heal events: %s", exc)

    def record_run(self, run: ScrapeRun) -> ScrapeRun:
        """Add or update a ScrapeRun record."""
        existing_idx = next((i for i, r in enumerate(self._scrape_runs) if r.id == run.id), None)
        if existing_idx is not None:
            self._scrape_runs[existing_idx] = run
        else:
            self._scrape_runs.append(run)
        self._save_runs()
        return run

    def record_heal(self, heal: HealEvent) -> HealEvent:
        """Add or update a HealEvent record."""
        existing_idx = next((i for i, h in enumerate(self._heal_events) if h.id == heal.id), None)
        if existing_idx is not None:
            self._heal_events[existing_idx] = heal
        else:
            self._heal_events.append(heal)
        self._save_heals()
        return heal

    def get_latest_run(self) -> Optional[ScrapeRun]:
        """Get the most recent scrape run."""
        return self._scrape_runs[-1] if self._scrape_runs else None

    def get_latest_heal(self) -> Optional[HealEvent]:
        """Get the most recent heal event."""
        return self._heal_events[-1] if self._heal_events else None

    def list_runs(self, limit: int = 50) -> List[ScrapeRun]:
        """Return list of recent scrape runs."""
        return list(reversed(self._scrape_runs))[:limit]

    def list_heals(self, limit: int = 50) -> List[HealEvent]:
        """Return list of recent heal events."""
        return list(reversed(self._heal_events))[:limit]

    def save_raw_scrape(self, run_id: str, raw_pages: List[dict]) -> Path:
        """Persist raw scraped JSON payload before transformation (FR-102)."""
        raw_dir = Path("./data/raw_scrapes")
        raw_dir.mkdir(parents=True, exist_ok=True)
        run_file = raw_dir / f"{run_id}.json"
        latest_file = raw_dir / "latest.json"

        with open(run_file, "w", encoding="utf-8") as f:
            json.dump(raw_pages, f, indent=2)
        with open(latest_file, "w", encoding="utf-8") as f:
            json.dump(raw_pages, f, indent=2)

        logger.info("Persisted %d raw pages to %s and %s", len(raw_pages), run_file, latest_file)
        return run_file

    def get_latest_raw_scrape(self) -> List[dict]:
        """Retrieve most recent raw scraped payload."""
        latest_file = Path("./data/raw_scrapes/latest.json")
        if not latest_file.exists():
            return []
        try:
            with open(latest_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as exc:
            logger.error("Failed to load latest raw scrape: %s", exc)
            return []

    def get_raw_scrape_by_id(self, run_id: str) -> List[dict]:
        """Retrieve raw scraped payload for a specific scrape run."""
        run_file = Path(f"./data/raw_scrapes/{run_id}.json")
        if not run_file.exists():
            return []
        try:
            with open(run_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as exc:
            logger.error("Failed to load raw scrape for %s: %s", run_id, exc)
            return []

    def save_scraper_state(self, state: dict) -> None:
        """Persist active scraper state (collector_id, target_url, etc)."""
        state_file = Path("./data/scraper_state.json")
        state_file.parent.mkdir(parents=True, exist_ok=True)
        try:
            existing = self.load_scraper_state()
            existing.update(state)
            with open(state_file, "w", encoding="utf-8") as f:
                json.dump(existing, f, indent=2)
        except Exception as exc:
            logger.error("Failed to save scraper state: %s", exc)

    def load_scraper_state(self) -> dict:
        """Load active scraper state."""
        state_file = Path("./data/scraper_state.json")
        if not state_file.exists():
            return {}
        try:
            with open(state_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as exc:
            logger.error("Failed to load scraper state: %s", exc)
            return {}


# Global singleton instance
run_logger = ScrapeRunLogger()

