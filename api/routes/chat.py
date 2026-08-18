"""Chat endpoint for end-user documentation Q&A (/api/chat)."""

import logging
from typing import List
from fastapi import APIRouter, HTTPException, Request, status
from core.models import ChatMessage, ChatRequest, ChatResponse
from chat.engine import chat_engine
from chat.history import history_manager

logger = logging.getLogger("docmind.api.chat")
router = APIRouter(prefix="/chat", tags=["Chat"])


@router.post("", response_model=ChatResponse)
async def ask_question(request: Request, body: ChatRequest) -> ChatResponse:
    """Submit a natural language question about the documentation and receive a cited answer (FR-401 to FR-403)."""
    try:
        response = await chat_engine.process_query(
            raw_query=body.query,
            session_id=body.session_id,
            top_k=body.top_k,
        )
        return response
    except Exception as exc:
        logger.exception("Error processing chat query: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating answer: {str(exc)}",
        )


@router.get("/history/{session_id}", response_model=List[ChatMessage])
async def get_session_history(session_id: str) -> List[ChatMessage]:
    """Retrieve in-memory conversation history for a given session (FR-404)."""
    return history_manager.get_history(session_id)


@router.delete("/history/{session_id}")
async def clear_session_history(session_id: str):
    """Clear conversation history for a given session."""
    cleared = history_manager.clear_session(session_id)
    return {"success": True, "cleared": cleared, "session_id": session_id}

