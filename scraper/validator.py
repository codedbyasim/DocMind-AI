"""Scraped page validation logic per FR-103 and Section 3.1.

Validates that each scraped page record has:
1. Non-empty title
2. Non-empty content (minimum length)
3. Valid source URL
Flags validation failures rather than silently dropping them.
"""

import logging
import re
from typing import Any, Dict, List, Optional, Tuple
from core.models import Page, ScrapedPageSummary

logger = logging.getLogger("docmind.scraper.validator")


def strip_html_tags(text: str) -> str:
    """Strip HTML markup and collapse whitespace for clean text indexing."""
    if not text:
        return ""
    # Remove script and style elements
    cleaned = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", text, flags=re.DOTALL | re.IGNORECASE)
    # Replace HTML tags with space
    cleaned = re.sub(r"<[^>]+>", " ", cleaned)
    # Unescape common entities
    cleaned = (
        cleaned.replace("&nbsp;", " ")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
        .replace("&quot;", '"')
    )
    # Collapse multiple whitespace/newlines
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


class PageValidator:
    """Validates raw scraped records into typed Page entities."""

    MIN_CONTENT_LENGTH = 20

    @classmethod
    def validate_raw_page(cls, raw: Dict[str, Any], scrape_run_id: str) -> Tuple[bool, Optional[Page], str]:
        """Validate a single raw page dictionary.

        Args:
            raw: Dictionary containing scraped fields (url, title, content, section, etc.)
            scrape_run_id: Linked ScrapeRun ID

        Returns:
            Tuple of (is_valid, Page_instance_or_None, error_reason)
        """
        # Resolve URL across Bright Data Scraper Studio field variations
        url = str(
            raw.get("url")
            or raw.get("product_page_url")
            or raw.get("page_url")
            or raw.get("link")
            or raw.get("source_url")
            or raw.get("href")
            or ""
        ).strip()

        # Resolve Title
        title = str(
            raw.get("title")
            or raw.get("page_title")
            or raw.get("name")
            or (raw.get("section_headings")[0] if isinstance(raw.get("section_headings"), list) and raw.get("section_headings") else "")
            or ""
        ).strip()

        # Resolve Content (clean HTML tags if present)
        raw_content = str(
            raw.get("content")
            or raw.get("text")
            or raw.get("body")
            or raw.get("description")
            or ""
        ).strip()

        # Clean HTML to plain text if HTML tags detected
        if "<" in raw_content and ">" in raw_content:
            clean_content = strip_html_tags(raw_content)
        else:
            clean_content = raw_content

        # Resolve Section / Category
        section = raw.get("section") or raw.get("category")
        if not section and isinstance(raw.get("section_headings"), list) and raw.get("section_headings"):
            section = str(raw["section_headings"][0]).replace("\u200b", "").strip()

        if not url:
            return False, None, "Missing URL"

        if not title:
            return False, None, f"Empty title for URL: {url}"

        if not clean_content or len(clean_content) < cls.MIN_CONTENT_LENGTH:
            return False, None, f"Insufficient or empty content ({len(clean_content)} chars) for URL: {url}"

        page = Page(
            url=url,
            title=title,
            section=str(section) if section else None,
            content=clean_content,
            scrape_run_id=scrape_run_id,
        )
        return True, page, ""

    @classmethod
    def validate_batch(
        cls, raw_pages: List[Dict[str, Any]], scrape_run_id: str
    ) -> Tuple[List[Page], List[Dict[str, Any]]]:
        """Validate a batch of scraped records.

        Returns:
            Tuple of (valid_pages_list, failed_records_list)
        """
        valid_pages: List[Page] = []
        failures: List[Dict[str, Any]] = []

        for idx, raw in enumerate(raw_pages):
            is_valid, page, reason = cls.validate_raw_page(raw, scrape_run_id)
            if is_valid and page:
                valid_pages.append(page)
            else:
                logger.warning("Scraped record #%d failed validation: %s", idx, reason)
                failures.append({"index": idx, "raw": raw, "reason": reason})

        logger.info(
            "Validation summary: %d valid pages, %d failed records",
            len(valid_pages),
            len(failures),
        )
        return valid_pages, failures

    @classmethod
    def summarize_batch(cls, raw_pages: List[Dict[str, Any]], scrape_run_id: str) -> List[ScrapedPageSummary]:
        """Produce a list of ScrapedPageSummary objects for UI table rendering."""
        summaries: List[ScrapedPageSummary] = []
        for raw in raw_pages:
            url = str(
                raw.get("url")
                or raw.get("product_page_url")
                or raw.get("page_url")
                or raw.get("link")
                or raw.get("source_url")
                or ""
            ).strip()

            title = str(
                raw.get("title")
                or raw.get("page_title")
                or raw.get("name")
                or ""
            ).strip()

            raw_content = str(
                raw.get("content")
                or raw.get("text")
                or raw.get("body")
                or raw.get("description")
                or ""
            ).strip()

            clean_content = strip_html_tags(raw_content) if "<" in raw_content else raw_content
            section = raw.get("section") or raw.get("category")
            if not section and isinstance(raw.get("section_headings"), list) and raw.get("section_headings"):
                section = str(raw["section_headings"][0]).replace("\u200b", "").strip()

            is_valid, _, reason = cls.validate_raw_page(raw, scrape_run_id)
            snippet = clean_content[:150] + "..." if len(clean_content) > 150 else clean_content

            summaries.append(
                ScrapedPageSummary(
                    url=url or "(missing URL)",
                    title=title or "(untitled page)",
                    section=str(section) if section else None,
                    content_snippet=snippet,
                    content_length=len(clean_content),
                    is_valid=is_valid,
                    error_reason=reason if not is_valid else None,
                )
            )
        return summaries


