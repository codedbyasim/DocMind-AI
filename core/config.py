"""DocMind Central Configuration Module.

All runtime options (embedding provider, LLM provider, vector database,
Bright Data credentials, security settings) are loaded from environment
variables or .env files. Never hardcode sensitive tokens or provider choices.
"""

import os
from enum import Enum
from functools import lru_cache
from typing import List, Optional
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class EnvironmentType(str, Enum):
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"
    TESTING = "testing"


class EmbeddingProviderType(str, Enum):
    OPENAI = "openai"
    COHERE = "cohere"
    VOYAGE = "voyage"
    OLLAMA = "ollama"
    MOCK = "mock"


class LLMProviderType(str, Enum):
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    GROQ = "groq"
    OLLAMA = "ollama"
    MOCK = "mock"


class VectorDBProviderType(str, Enum):
    CHROMA = "chroma"
    PINECONE = "pinecone"
    MOCK = "mock"


class Settings(BaseSettings):
    """Application settings and configuration parameters."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --------------------------------------------------------------------------
    # Server & App Settings
    # --------------------------------------------------------------------------
    app_name: str = "DocMind"
    app_env: EnvironmentType = EnvironmentType.DEVELOPMENT
    host: str = "0.0.0.0"
    port: int = 8000
    api_prefix: str = "/api"
    cors_origins: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    # --------------------------------------------------------------------------
    # Bright Data Scraper Studio & CLI
    # --------------------------------------------------------------------------
    brightdata_api_key: Optional[str] = Field(
        default=None,
        description="Bright Data API Key / Token",
    )
    brightdata_collector_id: Optional[str] = Field(
        default=None,
        description="Bright Data Collector ID (e.g. c_xxx)",
    )
    target_docs_url: str = Field(
        default="https://docs.litellm.ai",
        description="Target documentation site URL with discoverable sitemap",
    )

    # --------------------------------------------------------------------------
    # Embedding Configuration (Swappable via EMBEDDING_PROVIDER)
    # --------------------------------------------------------------------------
    embedding_provider: EmbeddingProviderType = Field(
        default=EmbeddingProviderType.OPENAI,
        description="Active embedding provider (openai | cohere | voyage | ollama | mock)",
    )
    embedding_api_key: Optional[str] = Field(
        default=None,
        description="API Key for embedding provider (or OPENAI_API_KEY / AIML_API_KEY)",
    )
    embedding_base_url: Optional[str] = Field(
        default=None,
        description="Custom base URL for OpenAI-compatible embedding API (e.g. https://api.aimlapi.com/v1)",
    )
    embedding_model: str = Field(
        default="text-embedding-3-small",
        description="Embedding model name",
    )
    embedding_dimension: int = Field(
        default=1536,
        description="Dimension of generated embedding vectors",
    )
    embedding_max_retries: int = Field(
        default=3,
        description="Maximum retry attempts for failed embedding API calls",
    )
    embedding_batch_size: int = Field(
        default=64,
        description="Batch size for embedding generation",
    )
    embedding_timeout_seconds: float = Field(
        default=30.0,
        description="Request timeout in seconds for embedding generation",
    )
    ollama_base_url: str = Field(
        default="http://localhost:11434",
        description="Base URL for local Ollama instance",
    )

    # --------------------------------------------------------------------------
    # LLM Configuration (Swappable via LLM_PROVIDER)
    # --------------------------------------------------------------------------
    llm_provider: LLMProviderType = Field(
        default=LLMProviderType.OPENAI,
        description="Active LLM provider (openai | anthropic | groq | ollama | mock)",
    )
    llm_api_key: Optional[str] = Field(
        default=None,
        description="API Key for LLM provider (or OPENAI_API_KEY / AIML_API_KEY)",
    )
    llm_base_url: Optional[str] = Field(
        default=None,
        description="Custom base URL for OpenAI-compatible LLM API (e.g. https://api.aimlapi.com/v1)",
    )
    llm_model: str = Field(
        default="gpt-4o-mini",
        description="LLM model name for generation",
    )
    llm_temperature: float = Field(
        default=0.1,
        ge=0.0,
        le=2.0,
        description="Sampling temperature for grounded RAG generation",
    )
    llm_timeout_seconds: float = Field(
        default=45.0,
        description="Request timeout in seconds for LLM answer generation",
    )
    scraper_cli_timeout_seconds: int = Field(
        default=180,
        description="Maximum execution timeout in seconds for Bright Data CLI processes",
    )


    # --------------------------------------------------------------------------
    # Vector Database Configuration (Swappable via VECTOR_DB_PROVIDER)
    # --------------------------------------------------------------------------
    vector_db_provider: VectorDBProviderType = Field(
        default=VectorDBProviderType.CHROMA,
        description="Active vector database (chroma | pinecone | mock)",
    )
    chroma_persist_dir: str = Field(
        default="./data/chroma",
        description="Local directory for ChromaDB vector storage",
    )
    chroma_collection_name: str = Field(
        default="docmind_knowledge_base",
        description="ChromaDB collection name",
    )
    pinecone_api_key: Optional[str] = Field(
        default=None,
        description="Pinecone API key for hosted vector storage",
    )
    pinecone_environment: Optional[str] = Field(
        default=None,
        description="Pinecone cloud environment / region",
    )
    pinecone_index_name: Optional[str] = Field(
        default="docmind-index",
        description="Pinecone index name",
    )

    # --------------------------------------------------------------------------
    # Pipeline & RAG Tunables
    # --------------------------------------------------------------------------
    chunk_size_tokens: int = Field(
        default=500,
        description="Target chunk size in tokens",
    )
    chunk_overlap_tokens: int = Field(
        default=50,
        description="Overlap between consecutive chunks in tokens",
    )
    retrieval_top_k: int = Field(
        default=5,
        description="Number of most relevant chunks to retrieve per query",
    )
    confidence_threshold: float = Field(
        default=0.65,
        description="Minimum similarity score threshold for grounding",
    )
    chat_rate_limit_per_minute: int = Field(
        default=20,
        description="Max chat requests per minute per client IP/session",
    )

    # --------------------------------------------------------------------------
    # Self-Healing & Scraper Monitoring (FR-501 to FR-505)
    # --------------------------------------------------------------------------
    docmind_auto_approve_heals: bool = Field(
        default=False,
        description="Whether to auto-approve proposed heal fixes without admin review gate",
    )
    page_count_drop_threshold_pct: float = Field(
        default=50.0,
        description="Percentage drop in page count compared to previous run to trigger degraded state",
    )
    min_expected_pages: int = Field(
        default=5,
        description="Minimum expected valid pages in a documentation scrape",
    )

    # --------------------------------------------------------------------------
    # Admin Auth & Security
    # --------------------------------------------------------------------------
    admin_api_key: str = Field(
        default="docmind_dev_admin_key_12345",
        description="API Key / Bearer token for accessing admin routes",
    )
    admin_username: str = Field(
        default="admin",
        description="Admin username for basic authentication",
    )
    admin_password: str = Field(
        default="docmind_admin_password",
        description="Admin password for basic authentication",
    )
    session_secret_key: str = Field(
        default="docmind_session_super_secret_key_32bytes!",
        description="Secret key for signing sessions/tokens",
    )
    session_timeout_minutes: int = Field(
        default=30,
        description="Admin session idle timeout in minutes",
    )



@lru_cache()
def get_settings() -> Settings:
    """Returns a cached instance of application settings."""
    return Settings()


# Default singleton settings instance
settings = get_settings()
