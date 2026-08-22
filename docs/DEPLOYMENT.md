# Production Deployment & Docker Guide

This document details containerized deployment using Docker Compose, production security hardening, and scaling considerations.

---

## 1. Docker Compose Deployment

DocMind includes a production-ready `Dockerfile` and `docker-compose.yml` for zero-configuration containerization.

### Launching the Stack

```bash
# Ensure .env is populated with production keys
docker compose up -d --build
```

### Stack Components

```yaml
services:
  app:
    build: .
    ports:
      - "8000:8000"
    volumes:
      - docmind_data:/app/data
    env_file:
      - .env
    restart: unless-stopped
```

The unified container runs the FastAPI backend and serves the compiled React single-page application under Nginx or static file mount.

---

## 2. Production Security Hardening

- **Session Secrets**: Always generate a cryptographically strong 32-byte string for `SESSION_SECRET_KEY` using `openssl rand -hex 32`.
- **CORS Configuration**: Restrict `CORS_ORIGINS` in `.env` to your exact production domain.
- **Rate Limiting**: The chat endpoint enforces IP-based rate limiting via SlowAPI (default: 20 requests/minute).
- **Prompt Injection Defense**: Input queries are sanitized against delimiter injection and prompt leaks before embedding generation.
- **Immutable Audit Trail**: Administrative operations (`ADMIN_LOGIN`, `SCRAPER_RUN`, `HEAL_APPROVED`, `DELTA_REINDEX`) are recorded atomically to `data/logs/audit.jsonl`.

---

## 3. Persistent Volumes

| Volume Path | Purpose |
| :--- | :--- |
| `/app/data/chroma` | Persistent ChromaDB vector database embeddings |
| `/app/data/logs` | Scrape run logs, heal events, and audit trail records |
| `/app/data/raw_scrapes` | Raw JSON scrape snapshots for delta comparison |

---

## 4. Known Limitations & Recommendations

- **External Embedding Rate Limits**: Third-party embedding APIs (e.g. AI/ML API, OpenAI) may experience transient HTTP 429/529 during peak bursts. The engine includes exponential backoff retry up to 4 attempts.
- **Single-Host ChromaDB**: Chroma in local mode uses SQLite/DuckDB on a single volume. For distributed high-throughput clustering, swap `VECTOR_DB_PROVIDER=pinecone` in `.env`.
