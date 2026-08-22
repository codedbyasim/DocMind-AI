# DocMind REST API Reference

The DocMind backend provides public chat retrieval endpoints and protected administrative endpoints.

---

## 1. Public Endpoints

### Health Check
`GET /api/health`

Returns live system health, total indexed documents, and active collector metadata.

#### Response Example (`200 OK`):
```json
{
  "status": "healthy",
  "active_collector_id": "c_msyg7ceoo6la3ofn6",
  "target_docs_url": "https://docs.litellm.ai",
  "total_indexed_pages": 13,
  "total_indexed_chunks": 88,
  "last_scrape_run": {
    "id": "faaab1f7-e877-41d5-a8e4-91ee97629b38",
    "status": "completed",
    "page_count": 13
  },
  "vector_db_provider": "chroma"
}
```

---

### Real-Time Streaming Chat
`POST /api/chat/stream`

Streams grounded answers using Server-Sent Events (SSE). Applies rate-limiting (20 req/min per IP) and prompt-injection sanitization.

#### Request Body:
```json
{
  "query": "How do I run LiteLLM with Docker?",
  "session_id": "optional-uuid-string"
}
```

#### SSE Events Stream:
```text
data: {"type": "token", "content": "To run "}
data: {"type": "token", "content": "LiteLLM with Docker..."}
data: {"type": "metadata", "grounded": true, "confidence_score": 0.82, "citations": [{"title": "Quickstart", "url": "https://docs.litellm.ai/docs/proxy/docker_quick_start", "snippet": "..."}]}
data: {"type": "done", "generation_time_ms": 1420}
```

---

## 2. Administrative Endpoints (Protected)

Admin endpoints require authentication via `Authorization: Bearer <ADMIN_SESSION_TOKEN>` or `X-Admin-Api-Key: <KEY>`.

### Admin Login
`POST /api/admin/login`

Authenticates administrative credentials and returns a cryptographically signed HMAC session token.

#### Request Body:
```json
{
  "username": "admin",
  "password": "your-secure-password"
}
```

#### Response Example (`200 OK`):
```json
{
  "token": "eyJhbGciOi...",
  "actor": "admin",
  "expires_in_minutes": 30
}
```

---

### Trigger Scraper Run
`POST /api/admin/scraper/run`

Triggers live scraping of the target documentation site, page validation, chunking, and ChromaDB vector indexing.

#### Request Body:
```json
{
  "collector_id": "c_msyg7ceoo6la3ofn6",
  "url": "https://docs.litellm.ai"
}
```

#### Response Example (`200 OK`):
```json
{
  "success": true,
  "scrape_run": {
    "id": "faaab1f7-e877-41d5-a8e4-91ee97629b38",
    "status": "completed",
    "page_count": 13
  },
  "valid_count": 13,
  "failed_count": 0
}
```

---

### Delta Re-Indexing
`POST /api/admin/reindex/delta`

Re-chunks and re-embeds a subset of modified or updated documentation pages without dropping the entire index.

#### Request Body:
```json
{
  "page_urls": ["https://docs.litellm.ai/docs/proxy/virtual_keys"]
}
```

---

### Self-Healing Trigger & Approval
`POST /api/admin/heal/trigger`

Initiates an AI scraper repair request on Bright Data for a broken collector.

`POST /api/admin/heal/{heal_event_id}/approve`

Approves or rejects a proposed heal repair proposal and triggers automatic delta re-indexing.

---

### Audit Logs
`GET /api/admin/audit-logs?limit=50`

Returns immutable audit event records capturing timestamps, actor IDs, actions, and metadata.
