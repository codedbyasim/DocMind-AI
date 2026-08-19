"""Pytest configuration and test environment isolation."""

import os
import pytest


@pytest.fixture(autouse=True)
def setup_test_environment(monkeypatch):
    """Set mock providers for test isolation so tests don't fail when remote third-party APIs are overloaded."""
    monkeypatch.setenv("DOCMIND_MOCK_EMBEDDINGS", "true")
    monkeypatch.setenv("DOCMIND_MOCK_LLM", "true")
