"""FastAPI Application Entrypoint for DocMind.

Runs the REST API backend exposing:
- /api/health  - Health & indexing status
- /api/chat    - End-user RAG Q&A with citations
- /api/admin/* - Scraper management & healing lifecycle (protected)
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from core.config import settings
from api.middleware import setup_middleware
from api.routes import admin, chat, health

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("docmind.api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown hooks."""
    logger.info("Initializing DocMind API in %s mode...", settings.app_env.value)
    logger.info("Vector DB Provider: %s", settings.vector_db_provider.value)
    logger.info("Embedding Provider: %s", settings.embedding_provider.value)
    logger.info("LLM Provider: %s", settings.llm_provider.value)
    yield
    logger.info("Shutting down DocMind API...")


app = FastAPI(
    title="DocMind API",
    description="Self-Healing Documentation-to-RAG Pipeline powered by Bright Data Scraper Studio",
    version="0.1.0",
    lifespan=lifespan,
)

# Apply CORS & rate limiting middleware
setup_middleware(app)

# Include route handlers under prefix
app.include_router(health.router, prefix=settings.api_prefix)
app.include_router(chat.router, prefix=settings.api_prefix)
app.include_router(admin.auth_router, prefix=settings.api_prefix)
app.include_router(admin.router, prefix=settings.api_prefix)



@app.get("/")
async def root():
    """Root status endpoint."""
    return {
        "app": "DocMind",
        "version": "0.1.0",
        "status": "online",
        "docs_url": "/docs",
        "health_url": f"{settings.api_prefix}/health",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "api.main:app",
        host=settings.host,
        port=settings.port,
        reload=(settings.app_env.value == "development"),
    )
