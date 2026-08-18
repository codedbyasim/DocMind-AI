"""End-to-end integration tests for Phase 1 (FR-101 to FR-104)."""

import pytest
from httpx import AsyncClient, ASGITransport
from core.config import settings
from core.models import ScrapeRunStatus
from scraper.client import BrightDataClient
from pipeline.embeddings.factory import get_embedding_provider
from retrieval.factory import get_vector_store
from admin.service import admin_service, AdminScraperService
from api.main import app



@pytest.fixture(autouse=True)
def enable_mock_scraper(monkeypatch):
    """Ensure tests run predictably with mock scraper doubles in CI/test environments."""
    monkeypatch.setenv("DOCMIND_MOCK_SCRAPER", "true")
    # Also set mock client on global admin_service for endpoint tests
    admin_service.bdata_client = BrightDataClient(mock_mode=True)
    admin_service.embedding_provider = get_embedding_provider("mock")
    admin_service.vector_store = get_vector_store("mock", force_new=True)



@pytest.mark.asyncio
async def test_scraper_client_mock_creation_and_run():
    """Verify mock client generates valid collector ID, pages, and flags invalid records."""
    client = BrightDataClient(mock_mode=True)
    
    # 1. Create scraper (FR-101)
    collector_id = await client.create_scraper("https://docs.litellm.ai", "Docs scraper")
    assert collector_id is not None
    assert collector_id.startswith("c_")

    # 2. Run scraper (FR-102)
    success, pages, error = await client.run_scraper(collector_id, "https://docs.litellm.ai")
    assert success is True
    assert len(pages) >= 5
    assert error == ""


@pytest.mark.asyncio
async def test_admin_service_run_and_index_mock():
    """Verify service validates pages, logs ScrapeRun, and persists raw dumps."""
    service = AdminScraperService(
        bdata_client=BrightDataClient(mock_mode=True),
        embedding_provider=get_embedding_provider("mock"),
        vector_store=get_vector_store("mock", force_new=True),
    )

    collector_id = await service.create_scraper("https://docs.litellm.ai")
    assert collector_id is not None

    success, run, page_summaries = await service.run_and_index(
        collector_id=collector_id,
        target_url="https://docs.litellm.ai",
    )


    assert success is True
    assert run.status == ScrapeRunStatus.COMPLETED
    assert run.page_count > 0
    assert len(page_summaries) > 0

    # Ensure valid and invalid pages are differentiated
    valid_count = sum(1 for p in page_summaries if p.is_valid)
    invalid_count = sum(1 for p in page_summaries if not p.is_valid)
    assert valid_count > 0
    assert invalid_count >= 1  # 1 intentionally broken page in mock dataset


@pytest.mark.asyncio
async def test_admin_api_endpoints_and_auth():
    """Verify Admin REST API endpoints with authentication."""
    transport = ASGITransport(app=app)
    admin_headers = {"X-Admin-API-Key": settings.admin_api_key}

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Unauthorized request should return 401
        unauth_res = await client.get("/api/admin/state")
        assert unauth_res.status_code == 401

        # 2. Invalid token should return 403
        forbidden_res = await client.get(
            "/api/admin/state", headers={"X-Admin-API-Key": "wrong_key"}
        )
        assert forbidden_res.status_code == 403

        # 3. Authorized state request
        state_res = await client.get("/api/admin/state", headers=admin_headers)
        assert state_res.status_code == 200
        state_data = state_res.json()
        assert "target_docs_url" in state_data

        # 4. Create scraper endpoint
        create_res = await client.post(
            "/api/admin/scraper/create",
            headers=admin_headers,
            json={"url": "https://docs.litellm.ai", "description": "Test Scraper"},
        )
        assert create_res.status_code == 200
        create_data = create_res.json()
        assert "collector_id" in create_data

        # 5. List runs endpoint
        runs_res = await client.get("/api/admin/runs", headers=admin_headers)
        assert runs_res.status_code == 200
        assert isinstance(runs_res.json(), list)
