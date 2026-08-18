# ==============================================================================
# DocMind Backend Multi-Stage Production Dockerfile
# Python 3.12 + Node.js (for @brightdata/cli runtime) + FastAPI
# ==============================================================================

FROM python:3.12-slim AS builder

WORKDIR /app

# Install system build dependencies and Node.js for Bright Data CLI execution
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    build-essential \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ------------------------------------------------------------------------------
# Final Production Runtime Stage
# ------------------------------------------------------------------------------
FROM python:3.12-slim AS runtime

WORKDIR /app

# Install Node.js runtime and npm in production stage for Bright Data CLI
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Copy installed Python packages from builder
COPY --from=builder /install /usr/local

# Copy application source code
COPY core/ /app/core/
COPY scraper/ /app/scraper/
COPY pipeline/ /app/pipeline/
COPY retrieval/ /app/retrieval/
COPY chat/ /app/chat/
COPY admin/ /app/admin/
COPY api/ /app/api/
COPY scripts/ /app/scripts/
COPY pyproject.toml /app/pyproject.toml

# Create required persistent data directories
RUN mkdir -p /app/data/chroma /app/data/raw_scrapes /app/data/logs /app/data/indexed_chunks

# Expose backend API port
EXPOSE 8000

# Environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    CHROMA_PERSIST_DIR=/app/data/chroma

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Launch production server
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
