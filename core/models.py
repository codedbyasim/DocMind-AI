"""DocMind Core Data Entities & Schema Models.

Implements all core entities from SRS Section 6.1:
- Page
- Chunk
- Embedding
- ScrapeRun
- HealEvent
Plus API request/response contracts for chat, citations, and admin endpoints.
"""

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
import uuid


def generate_uuid() -> str:
    """Generate a standard UUID string."""
    return str(uuid.uuid4())


def utc_now() -> datetime:
    """Return current UTC datetime."""
    return datetime.now(timezone.utc)


class ScrapeRunStatus(str, Enum):
    """Status of a Bright Data scrape run."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    HEALING_REQUIRED = "healing_required"


class SystemHealthState(str, Enum):
    """Overall system health status."""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    HEALING = "healing"
    ERROR = "error"


# ------------------------------------------------------------------------------
# Core Domain Entities (SRS Section 6.1)
# ------------------------------------------------------------------------------

class Page(BaseModel):
    """Represents a single scraped documentation page."""
    id: str = Field(default_factory=generate_uuid, description="Unique page ID")
    url: str = Field(..., description="Source URL of the documentation page")
    title: str = Field(..., description="Page title")
    section: Optional[str] = Field(default=None, description="Section or breadcrumb name")
    content: str = Field(..., description="Raw or parsed textual content of the page")
    last_scraped_at: datetime = Field(default_factory=utc_now, description="Timestamp of scrape")
    scrape_run_id: Optional[str] = Field(default=None, description="Linked ScrapeRun ID")


class Chunk(BaseModel):
    """Represents a chunked segment of a Page for vector embedding."""
    id: str = Field(default_factory=generate_uuid, description="Unique chunk ID")
    page_id: str = Field(..., description="Foreign key linking to Page.id")
    text: str = Field(..., description="Segment text content")
    token_count: int = Field(..., description="Estimated token count of this segment")
    chunk_order: int = Field(..., description="Ordering sequence index within the page")
    metadata: Dict[str, Any] = Field(
        default_factory=dict,
        description="Source metadata (url, title, section, page_id, chunk_order)",
    )


class EmbeddingRecord(BaseModel):
    """Represents the vector embedding for a Chunk."""
    chunk_id: str = Field(..., description="Foreign key linking to Chunk.id")
    vector: List[float] = Field(..., description="Vector embedding representation")
    embedding_model_version: str = Field(..., description="Model name & version used")
    created_at: datetime = Field(default_factory=utc_now)


# Alias for SRS compatibility
Embedding = EmbeddingRecord



class ScrapeRun(BaseModel):
    """Logs metadata for a Bright Data scraping execution."""
    id: str = Field(default_factory=generate_uuid, description="Unique scrape run ID")
    collector_id: str = Field(..., description="Bright Data Collector ID")
    timestamp: datetime = Field(default_factory=utc_now, description="Execution timestamp")
    status: ScrapeRunStatus = Field(default=ScrapeRunStatus.PENDING)
    page_count: int = Field(default=0, description="Total pages scraped and validated")
    error_summary: Optional[str] = Field(default=None, description="Error details if failed")
    target_url: str = Field(..., description="Base documentation URL scraped")


class HealEvent(BaseModel):
    """Represents an automated or manual scraper heal attempt and outcome."""
    id: str = Field(default_factory=generate_uuid, description="Unique heal event ID")
    collector_id: str = Field(..., description="Target Collector ID")
    timestamp: datetime = Field(default_factory=utc_now, description="Timestamp when heal was triggered")
    break_description: str = Field(..., description="Diagnostic summary of detected scraper breakage")
    fix_summary: Optional[str] = Field(default=None, description="Proposed or applied fix details from bdata")
    approved: Optional[bool] = Field(
        default=None,
        description="True if approved, False if rejected, None if pending review",
    )
    resulting_scrape_run_id: Optional[str] = Field(
        default=None,
        description="Linked ScrapeRun ID created after heal approval",
    )


# ------------------------------------------------------------------------------
# API Request / Response Models
# ------------------------------------------------------------------------------

class Citation(BaseModel):
    """Citation chip linking back to source documentation."""
    url: str = Field(..., description="Source doc URL")
    title: str = Field(..., description="Page or section title")
    section: Optional[str] = Field(default=None, description="Subheading / section")
    snippet: Optional[str] = Field(default=None, description="Relevant contextual snippet")
    similarity_score: Optional[float] = Field(default=None, description="Cosine similarity score")


class ChatMessage(BaseModel):
    """Single message in a conversation."""
    role: str = Field(..., description="Role: 'user', 'assistant', or 'system'")
    content: str = Field(..., description="Text content of message")
    timestamp: datetime = Field(default_factory=utc_now)
    citations: Optional[List[Citation]] = Field(default=None)


class ChatRequest(BaseModel):
    """User query payload for /api/chat."""
    query: str = Field(..., min_length=1, max_length=2000, description="Natural language question")
    session_id: Optional[str] = Field(default=None, description="Session ID for conversation history")
    top_k: Optional[int] = Field(default=None, description="Optional override for top-k retrieval")


class ChatResponse(BaseModel):
    """Grounded assistant response with citations."""
    answer: str = Field(..., description="Grounded response text")
    citations: List[Citation] = Field(default_factory=list, description="Source citations")
    session_id: str = Field(..., description="Session identifier")
    latency_ms: float = Field(..., description="End-to-end response time in milliseconds")
    grounded: bool = Field(default=True, description="False if fallback triggered (not found in docs)")


class HealthStatusResponse(BaseModel):
    """Overall system health status for admin and monitoring."""
    status: SystemHealthState
    active_collector_id: Optional[str] = None
    target_docs_url: str
    total_indexed_pages: int = 0
    total_indexed_chunks: int = 0
    last_scrape_run: Optional[ScrapeRun] = None
    last_heal_event: Optional[HealEvent] = None
    embedding_provider: str
    llm_provider: str
    vector_db_provider: str


class TriggerScrapeRequest(BaseModel):
    """Payload to trigger scraper creation or run."""
    url: Optional[str] = Field(default=None, description="Override target docs URL")
    collector_id: Optional[str] = Field(default=None, description="Optional existing Collector ID")


class ScrapedPageSummary(BaseModel):
    """Summary of a scraped page for Admin UI inspection."""
    url: str
    title: str
    section: Optional[str] = None
    content_snippet: str
    content_length: int
    is_valid: bool = True
    error_reason: Optional[str] = None


class ScrapeResultResponse(BaseModel):
    """Full scrape run response with pages and run metadata."""
    success: bool
    scrape_run: ScrapeRun
    pages: List[ScrapedPageSummary] = Field(default_factory=list)
    valid_count: int = 0
    failed_count: int = 0


class HealActionRequest(BaseModel):
    """Payload to trigger or approve/reject heal."""
    collector_id: str = Field(..., description="Collector ID to heal or approve")
    approve: bool = Field(default=True, description="True to approve, False to reject")
    feedback: Optional[str] = Field(default=None, description="Feedback or adjusted heal description")


class IndexingProgress(BaseModel):
    """Indexing progress indicator for UI and status monitoring (SRS §3.2)."""
    status: str = "idle"  # "idle", "indexing", "completed", "failed"
    processed_pages: int = 0
    total_pages: int = 0
    processed_chunks: int = 0
    total_chunks: int = 0
    current_page_title: Optional[str] = None
    last_indexed_at: Optional[datetime] = None
    error_message: Optional[str] = None


class DeltaReindexRequest(BaseModel):
    """Payload to trigger re-indexing on a specific subset of pages or run (FR-204)."""
    scrape_run_id: Optional[str] = None
    page_urls: Optional[List[str]] = None
    force_full: bool = False


class DeltaReindexResponse(BaseModel):
    """Response returned from delta re-indexing."""
    success: bool
    indexed_pages: int
    indexed_chunks: int
    message: str


