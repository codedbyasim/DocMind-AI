"""Bright Data CLI (`bdata` / `@brightdata/cli`) & Scraper Studio execution client.

Wraps Bright Data CLI commands:
- `bdata scraper create <URL> "<description>"`
- `bdata scraper run <COLLECTOR_ID> <URL>`
- `bdata scraper heal <COLLECTOR_ID> "<description>"`
- `bdata scraper approve <COLLECTOR_ID>` / `--reject`

Supports both live Bright Data CLI execution (default path) and a mock test double
for automated testing in CI/test environments without live credentials.
"""

import asyncio
import json
import logging
import os
import re
import shutil
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from core.config import settings
from core.models import Page
from scraper.logger import run_logger

logger = logging.getLogger("docmind.scraper.client")


class BrightDataClient:
    """Interface for invoking Bright Data Scraper Studio commands."""

    def __init__(self, api_key: Optional[str] = None, mock_mode: bool = False):
        self.api_key = api_key or settings.brightdata_api_key
        # Enable mock double if explicitly requested or configured for testing
        self.mock_mode = (
            mock_mode
            or os.getenv("DOCMIND_MOCK_SCRAPER", "").lower() in ("true", "1", "yes")
            or self.api_key == "mock"
        )
        self._collector_id_cache: Optional[str] = None

    def _find_bdata_command(self) -> Tuple[str, List[str]]:
        """Determine binary and base arguments for invoking Bright Data CLI across platforms.
        
        Returns:
            Tuple of (executable_or_command_string, base_arguments)
        """
        # 1. Global bdata or brightdata on PATH
        for bin_name in ("brightdata", "bdata"):
            path = shutil.which(bin_name)
            if path:
                return path, []

        # 2. npx runner via @brightdata/cli
        npx_path = shutil.which("npx") or shutil.which("npx.cmd") or "npx"
        return npx_path, ["-y", "@brightdata/cli"]

    # =========================================================================
    # REAL CLI INVOCATION PATH
    # =========================================================================
    async def run_cli_command(self, args: List[str]) -> Tuple[int, str, str]:
        """Execute a Bright Data CLI command asynchronously on the host OS.

        Args:
            args: Command arguments (e.g. ["scraper", "run", "c_123", "https://..."])

        Returns:
            Tuple of (returncode, stdout, stderr)
        """
        bin_path, base_args = self._find_bdata_command()
        full_args = base_args + args
        
        # Prepare environment variables
        env = os.environ.copy()
        if self.api_key and self.api_key != "mock":
            env["BRIGHTDATA_API_KEY"] = self.api_key

        cmd_display = f"{bin_path} {' '.join(full_args)}"
        logger.info("[CLI Invocation] Executing: %s", cmd_display)

        def _exec_sync() -> Tuple[int, str, str]:
            import subprocess
            if sys.platform == "win32":
                quoted_args = " ".join(f'"{a}"' if " " in a else a for a in full_args)
                cmd_line = f'"{bin_path}" {quoted_args}'
                proc = subprocess.run(
                    cmd_line,
                    stdin=subprocess.DEVNULL,
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    shell=True,
                    env=env,
                    timeout=settings.scraper_cli_timeout_seconds,
                )
            else:
                proc = subprocess.run(
                    [bin_path] + full_args,
                    stdin=subprocess.DEVNULL,
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    shell=False,
                    env=env,
                    timeout=settings.scraper_cli_timeout_seconds,
                )
            return proc.returncode or 0, proc.stdout or "", proc.stderr or ""


        try:
            returncode, stdout, stderr = await asyncio.to_thread(_exec_sync)

            if returncode != 0:
                logger.warning(
                    "[CLI Failure] Command returned code %d: %s\nSTDERR: %s\nSTDOUT: %s",
                    returncode,
                    cmd_display,
                    stderr[:400],
                    stdout[:400],
                )
            else:
                logger.info("[CLI Success] Command completed with code 0: %s", stdout[:150])

            return returncode, stdout, stderr
        except Exception as exc:
            import subprocess
            if isinstance(exc, subprocess.TimeoutExpired):
                logger.error("[CLI Timeout] Command exceeded %ds timeout: %s", settings.scraper_cli_timeout_seconds, cmd_display)
                return -1, "", f"Command timed out after {settings.scraper_cli_timeout_seconds} seconds: {cmd_display}"

            logger.exception("[CLI Exception] Failed to execute '%s': %s", cmd_display, exc)
            return -1, "", str(exc)


    async def create_scraper(self, target_url: str, description: str) -> Optional[str]:
        """Create a new sitemap scraper for the given documentation URL (FR-101).

        Command: bdata scraper create <URL> "<description>" --json

        Returns:
            Collector ID (e.g. 'c_abc123') if successful, else None.
        """
        # --- TEST DOUBLE FALLBACK (when mock mode is active) ---
        if self.mock_mode:
            mock_id = f"c_mock_{abs(hash(target_url)) % 1000000:06d}"
            logger.info("[Mock Mode] Simulated scraper creation for %s -> %s", target_url, mock_id)
            run_logger.save_scraper_state({
                "target_docs_url": target_url,
                "active_collector_id": mock_id,
            })
            return mock_id

        # --- REAL BRIGHT DATA CLI INVOCATION ---
        code, stdout, stderr = await self.run_cli_command(
            ["scraper", "create", target_url, description, "--json"]
        )

        collector_id = None
        if code == 0 and stdout:
            try:
                # Try parsing structured JSON response envelope
                json_start = stdout.find("{")
                json_end = stdout.rfind("}")
                if json_start != -1 and json_end != -1:
                    data = json.loads(stdout[json_start : json_end + 1])
                    collector_id = data.get("collector_id") or data.get("id")
            except Exception:
                pass

        # Regex fallback for collector IDs matching c_[a-zA-Z0-9_-]+
        if not collector_id:
            match = re.search(r"\b(c_[a-zA-Z0-9_-]{6,32})\b", stdout + " " + stderr)
            if match:
                collector_id = match.group(1)

        if collector_id:
            logger.info("[Scraper Created] Successfully registered Collector ID: %s", collector_id)
            # Persist collector ID to state
            run_logger.save_scraper_state({
                "target_docs_url": target_url,
                "active_collector_id": collector_id,
            })
            self._collector_id_cache = collector_id
            return collector_id

        logger.error("[Scraper Creation Failed] No collector ID found. Output:\n%s", stdout + stderr)
        return None

    async def run_scraper(
        self, collector_id: str, target_url: str
    ) -> Tuple[bool, List[Dict[str, Any]], str]:
        """Run a scraper to collect documentation pages (FR-102).

        Command: bdata scraper run <COLLECTOR_ID> <URL> --json

        Returns:
            Tuple of (success_bool, raw_pages_list, error_summary)
        """
        # --- TEST DOUBLE FALLBACK (when mock mode is active or demo collector) ---
        if self.mock_mode or collector_id.startswith("c_demo_") or collector_id.startswith("c_mock_"):
            logger.info("[Mock/Simulation Mode] Generating simulated documentation pages for %s", target_url)
            mock_pages = self._generate_mock_pages(target_url)
            return True, mock_pages, ""


        # --- REAL BRIGHT DATA CLI INVOCATION ---
        code, stdout, stderr = await self.run_cli_command(
            ["scraper", "run", collector_id, target_url, "--json"]
        )

        valid_data: List[Dict[str, Any]] = []
        if code == 0 and stdout:
            try:
                json_start = stdout.find("[")
                json_end = stdout.rfind("]")
                if json_start != -1 and json_end != -1:
                    parsed = json.loads(stdout[json_start : json_end + 1])
                    if isinstance(parsed, list):
                        # Filter out dead page error objects from Bright Data
                        valid_data = [
                            d for d in parsed
                            if isinstance(d, dict) and not d.get("error_code") and not d.get("error") and (d.get("url") or d.get("title") or d.get("content"))
                        ]
                        if valid_data:
                            return True, valid_data, ""
            except Exception as exc:
                logger.warning("[Bright Data Parse Error] %s", exc)

        # --- UNIVERSAL DIRECT CRAWLER FALLBACK ---
        # Activates in two cases:
        # 1. CLI returned code 0 but only dead/invalid pages (wrong domain bound to collector)
        # 2. CLI returned non-zero code (e.g. missing BRIGHTDATA_API_KEY in CI/CD environments)
        #    In this case we extract documentation pages directly via HTTP sitemap + HTML crawling.
        if code != 0:
            logger.info(
                "[Universal Ingestion] Bright Data CLI unavailable (exit code %d: %s). "
                "Activating Direct Web Documentation Crawler for: %s",
                code, stderr.strip()[:120], target_url,
            )
        else:
            logger.info("[Universal Ingestion] Activating Direct Web Documentation Crawler for: %s", target_url)

        try:
            from scraper.crawler import DirectDocsCrawler
            crawler = DirectDocsCrawler(max_pages=20)
            crawled_pages = await crawler.crawl_site(target_url)
            if crawled_pages:
                logger.info("[Universal Ingestion] Successfully crawled %d pages for %s", len(crawled_pages), target_url)
                return True, crawled_pages, ""
            logger.warning("[Universal Ingestion] Crawler returned 0 pages for %s", target_url)
        except ImportError as exc:
            logger.error(
                "[Universal Ingestion Failed] Missing dependency — ensure 'beautifulsoup4' and 'lxml' "
                "are installed (pip install beautifulsoup4 lxml): %s", exc
            )
        except Exception as exc:
            logger.error("[Universal Ingestion Failed] Error crawling %s: %s", target_url, exc, exc_info=True)

        err_msg = f"CLI error (exit code {code}): {stderr.strip() or stdout.strip() or 'No pages found'}"
        return False, [], err_msg


    async def heal_scraper(self, collector_id: str, description: str) -> Tuple[bool, str]:
        """Trigger an automated fix for a broken scraper (FR-502).

        Command: bdata scraper heal <COLLECTOR_ID> "<description>"
        """
        if self.mock_mode or collector_id.startswith("c_demo_") or collector_id.startswith("c_mock_"):
            return True, f"[Simulated Repair] AI scraper repair proposed for {collector_id}: re-aligned CSS selectors and repaired sitemap navigation."

        code, stdout, stderr = await self.run_cli_command(
            ["scraper", "heal", collector_id, description]
        )
        if code == 0:
            return True, stdout.strip()
        return False, stderr.strip() or stdout.strip()

    async def approve_heal(self, collector_id: str, reject: bool = False) -> Tuple[bool, str]:
        """Approve or reject a proposed heal fix (FR-504 / FR-505).

        Command: bdata scraper approve <COLLECTOR_ID> [--reject]
        """
        if self.mock_mode or collector_id.startswith("c_demo_") or collector_id.startswith("c_mock_"):
            action = "rejected" if reject else "approved"
            return True, f"[Simulated Repair] Heal fix {action} for collector {collector_id}."

        args = ["scraper", "approve", collector_id]
        if reject:
            args.append("--reject")

        code, stdout, stderr = await self.run_cli_command(args)
        if code == 0:
            return True, stdout.strip()
        return False, stderr.strip() or stdout.strip()


    # =========================================================================
    # TEST DOUBLE DATA GENERATOR
    # =========================================================================
    def _generate_mock_pages(self, target_url: str) -> List[Dict[str, Any]]:
        """Generate realistic mock documentation pages for test suites and offline demos."""
        base = target_url.rstrip("/")
        return [
            {
                "url": f"{base}/docs/quickstart",
                "title": "LiteLLM Quick Start Guide",
                "section": "Getting Started",
                "content": (
                    "LiteLLM is a lightweight Python library and proxy that allows developers to call 100+ "
                    "LLM APIs using the standard OpenAI format (OpenAI, Anthropic, Bedrock, VertexAI, Groq, Ollama). "
                    "Install via `pip install litellm`. Call `completion(model='gpt-4o', messages=[...])` "
                    "or `completion(model='claude-3-5-sonnet-20241022', messages=[...])` using a unified interface."
                ),
            },
            {
                "url": f"{base}/docs/providers",
                "title": "Supported Providers & Model Mapping",
                "section": "Providers",
                "content": (
                    "LiteLLM supports OpenAI, Azure OpenAI, Anthropic Claude, Google Gemini / VertexAI, AWS Bedrock, "
                    "Mistral AI, Cohere, Groq, DeepSeek, and Ollama. Set your provider API keys in environment variables "
                    "(e.g. `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`) and LiteLLM routes requests automatically."
                ),
            },
            {
                "url": f"{base}/docs/proxy/reliability",
                "title": "Load Balancing, Retries & Fallbacks",
                "section": "Proxy & Reliability",
                "content": (
                    "LiteLLM Proxy supports exponential backoff retries, cooldowns, and multi-provider fallbacks. "
                    "If OpenAI returns rate limit 429 or 500 error, LiteLLM can automatically fallback to Anthropic or Azure. "
                    "Configure `fallbacks: [{'gpt-4': ['claude-3-5-sonnet']}]` in your `config.yaml` router definition."
                ),
            },
            {
                "url": f"{base}/docs/proxy/spend_tracking",
                "title": "Spend Tracking, Budgets & Rate Limits",
                "section": "Budgeting",
                "content": (
                    "Track real-time token spend per team, key, or model with LiteLLM proxy. "
                    "Enforce max daily budgets (e.g. `max_budget: 50.0`) and rate limits (RPM and TPM). "
                    "Historical usage and spend metrics are stored in PostgreSQL and accessible via REST API."
                ),
            },
            {
                "url": f"{base}/docs/embedding",
                "title": "Text Embeddings with LiteLLM",
                "section": "Embeddings",
                "content": (
                    "Call `embedding(model='text-embedding-3-small', input=['text'])` across providers including "
                    "OpenAI, Cohere, Voyage AI, and HuggingFace with automatic batching and dimension normalization."
                ),
            },
            # Intentionally included invalid record to test validator flagging
            {
                "url": f"{base}/docs/broken-page",
                "title": "",
                "section": "Testing",
                "content": "",
            },
        ]

