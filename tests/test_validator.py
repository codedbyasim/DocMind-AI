"""Unit tests for PageValidator per FR-103."""

import pytest
from core.models import Page, ScrapedPageSummary
from scraper.validator import PageValidator


def test_validator_valid_page():
    """Verify that a valid page with URL, title, and adequate content passes validation."""
    raw = {
        "url": "https://docs.litellm.ai/docs/quickstart",
        "title": "LiteLLM Quickstart",
        "section": "Getting Started",
        "content": "LiteLLM allows calling 100+ LLM APIs using the standard OpenAI format with full proxy support.",
    }
    is_valid, page, reason = PageValidator.validate_raw_page(raw, scrape_run_id="run_123")
    assert is_valid is True
    assert page is not None
    assert isinstance(page, Page)
    assert page.title == "LiteLLM Quickstart"
    assert page.section == "Getting Started"
    assert page.scrape_run_id == "run_123"
    assert reason == ""


def test_validator_missing_url():
    """Verify rejection when URL is missing."""
    raw = {
        "url": "",
        "title": "Some Title",
        "content": "This is content that is longer than twenty characters.",
    }
    is_valid, page, reason = PageValidator.validate_raw_page(raw, scrape_run_id="run_123")
    assert is_valid is False
    assert page is None
    assert "Missing URL" in reason


def test_validator_empty_title():
    """Verify rejection per FR-103 when title is empty or whitespace."""
    raw = {
        "url": "https://docs.litellm.ai/docs/empty_title",
        "title": "   ",
        "content": "This is valid content that is longer than twenty characters.",
    }
    is_valid, page, reason = PageValidator.validate_raw_page(raw, scrape_run_id="run_123")
    assert is_valid is False
    assert page is None
    assert "Empty title" in reason


def test_validator_insufficient_content():
    """Verify rejection per FR-103 when content is empty or below minimum threshold."""
    raw = {
        "url": "https://docs.litellm.ai/docs/short",
        "title": "Short Page",
        "content": "Too short",  # < 20 chars
    }
    is_valid, page, reason = PageValidator.validate_raw_page(raw, scrape_run_id="run_123")
    assert is_valid is False
    assert page is None
    assert "Insufficient or empty content" in reason


def test_validator_batch_summary():
    """Verify batch validation separates valid pages from failed records without dropping them."""
    batch = [
        {
            "url": "https://docs.litellm.ai/docs/1",
            "title": "Valid Page 1",
            "content": "Content for page 1 that is adequately long and descriptive.",
        },
        {
            "url": "https://docs.litellm.ai/docs/2",
            "title": "",
            "content": "Content with empty title that should fail validation.",
        },
        {
            "url": "https://docs.litellm.ai/docs/3",
            "title": "Valid Page 3",
            "content": "Content for page 3 that is also sufficiently long for testing.",
        },
    ]

    valid_pages, failures = PageValidator.validate_batch(batch, scrape_run_id="run_batch")
    assert len(valid_pages) == 2
    assert len(failures) == 1
    assert failures[0]["index"] == 1
    assert "Empty title" in failures[0]["reason"]

    summaries = PageValidator.summarize_batch(batch, scrape_run_id="run_batch")
    assert len(summaries) == 3
    assert summaries[0].is_valid is True
    assert summaries[1].is_valid is False
    assert summaries[2].is_valid is True
