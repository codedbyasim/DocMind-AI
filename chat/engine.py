"""Chat Query Engine coordinating RAG pipeline, grounding, and citations."""

import json
import logging
import time
import uuid
from typing import List, Optional, Tuple


from core.config import settings
from core.models import ChatMessage, ChatResponse, Chunk, Citation
from core.security import sanitize_user_input
from chat.history import history_manager
from chat.llm.factory import get_llm_provider
from chat.prompts import (
    GROUNDED_RAG_SYSTEM_PROMPT,
    NOT_FOUND_FALLBACK_MESSAGE,
    format_context_chunks,
)
from pipeline.embeddings.factory import get_embedding_provider
from retrieval.factory import get_vector_store

logger = logging.getLogger("docmind.chat.engine")


class ChatQueryEngine:
    """End-to-end RAG orchestrator for grounded documentation chat."""

    def __init__(
        self,
        embedding_provider=None,
        vector_store=None,
        llm_provider=None,
        confidence_threshold: Optional[float] = None,
    ):
        self._embedding_provider = embedding_provider
        self._vector_store = vector_store
        self._llm_provider = llm_provider
        self._confidence_threshold = confidence_threshold

    @property
    def embedding_provider(self):
        return self._embedding_provider or get_embedding_provider()

    @property
    def vector_store(self):
        return self._vector_store or get_vector_store()

    @property
    def llm_provider(self):
        return self._llm_provider or get_llm_provider()

    @property
    def confidence_threshold(self) -> float:
        if self._confidence_threshold is not None:
            return self._confidence_threshold
        return settings.confidence_threshold

    async def process_query(
        self,
        raw_query: str,
        session_id: Optional[str] = None,
        top_k: Optional[int] = None,
        confidence_threshold: Optional[float] = None,
    ) -> ChatResponse:
        """Process a user question, retrieve relevant chunks, and generate a cited answer.

        Args:
            raw_query: Raw user query string
            session_id: Optional session identifier for history tracking
            top_k: Optional top-k chunk count override
            confidence_threshold: Optional similarity threshold override

        Returns:
            ChatResponse with answer, citations, latency_ms, and grounded status.
        """
        start_time = time.perf_counter()
        session = session_id or str(uuid.uuid4())
        sanitized_query = sanitize_user_input(raw_query)

        k = top_k or settings.retrieval_top_k
        threshold = (
            confidence_threshold
            if confidence_threshold is not None
            else self.confidence_threshold
        )
        logger.info("Processing chat query for session %s (threshold=%.2f): '%s'", session, threshold, sanitized_query[:80])

        # Step 1: Embed query
        query_vector = await self.embedding_provider.embed_query(sanitized_query)

        # Step 2: Semantic retrieval
        retrieved_chunks_with_scores: List[Tuple[Chunk, float]] = await self.vector_store.search(
            query_vector=query_vector,
            top_k=k,
            confidence_threshold=threshold,
        )



        # Step 3: Handle empty retrieval / low confidence fallback (FR-403)
        if not retrieved_chunks_with_scores:
            logger.info("No chunks exceeded confidence threshold for query: '%s'", sanitized_query)
            latency = (time.perf_counter() - start_time) * 1000.0

            # Record in history
            history_manager.add_message(
                session, ChatMessage(role="user", content=sanitized_query)
            )
            history_manager.add_message(
                session, ChatMessage(role="assistant", content=NOT_FOUND_FALLBACK_MESSAGE)
            )

            return ChatResponse(
                answer=NOT_FOUND_FALLBACK_MESSAGE,
                citations=[],
                session_id=session,
                latency_ms=round(latency, 2),
                grounded=False,
            )

        # Step 4: Build grounded prompt
        context_str = format_context_chunks(retrieved_chunks_with_scores)
        system_prompt = GROUNDED_RAG_SYSTEM_PROMPT.format(context=context_str)

        # Step 5: Get past session history
        history = history_manager.get_history(session)

        # Step 6: Generate LLM response
        answer_text = await self.llm_provider.generate(
            system_prompt=system_prompt,
            user_prompt=sanitized_query,
            history=history,
            temperature=settings.llm_temperature,
        )

        # Step 7: Build Citation objects
        citations: List[Citation] = []
        seen_urls = set()
        for chunk, score in retrieved_chunks_with_scores:
            url = chunk.metadata.get("url", "")
            if url and url not in seen_urls:
                seen_urls.add(url)
                citations.append(
                    Citation(
                        url=url,
                        title=chunk.metadata.get("title", "Documentation"),
                        section=chunk.metadata.get("section"),
                        snippet=chunk.text[:180] + ("..." if len(chunk.text) > 180 else ""),
                        similarity_score=round(score, 3),
                    )
                )

        # Step 8: Update session history
        history_manager.add_message(
            session, ChatMessage(role="user", content=sanitized_query)
        )
        history_manager.add_message(
            session, ChatMessage(role="assistant", content=answer_text, citations=citations)
        )

        latency = (time.perf_counter() - start_time) * 1000.0
        logger.info("Chat query answered in %.2fms with %d citations", latency, len(citations))

        return ChatResponse(
            answer=answer_text,
            citations=citations,
            session_id=session,
            latency_ms=round(latency, 2),
            grounded=True,
        )

    async def process_query_stream(
        self,
        raw_query: str,
        session_id: Optional[str] = None,
        top_k: Optional[int] = None,
        confidence_threshold: Optional[float] = None,
    ):
        """Stream token deltas for low-latency perceived response (SSE)."""
        start_time = time.perf_counter()
        session = session_id or str(uuid.uuid4())
        sanitized_query = sanitize_user_input(raw_query)

        k = top_k or settings.retrieval_top_k
        threshold = (
            confidence_threshold
            if confidence_threshold is not None
            else self.confidence_threshold
        )

        query_vector = await self.embedding_provider.embed_query(sanitized_query)
        retrieved_chunks_with_scores: List[Tuple[Chunk, float]] = await self.vector_store.search(
            query_vector=query_vector,
            top_k=k,
            confidence_threshold=threshold,
        )

        if not retrieved_chunks_with_scores:
            history_manager.add_message(session, ChatMessage(role="user", content=sanitized_query))
            history_manager.add_message(session, ChatMessage(role="assistant", content=NOT_FOUND_FALLBACK_MESSAGE))
            yield json.dumps({
                "type": "done",
                "delta": NOT_FOUND_FALLBACK_MESSAGE,
                "answer": NOT_FOUND_FALLBACK_MESSAGE,
                "citations": [],
                "session_id": session,
                "grounded": False,
                "latency_ms": round((time.perf_counter() - start_time) * 1000.0, 2),
            }) + "\n\n"
            return

        citations: List[Citation] = []
        seen_urls = set()
        for chunk, score in retrieved_chunks_with_scores:
            url = chunk.metadata.get("url", "")
            if url and url not in seen_urls:
                seen_urls.add(url)
                citations.append(
                    Citation(
                        url=url,
                        title=chunk.metadata.get("title", "Documentation"),
                        section=chunk.metadata.get("section"),
                        snippet=chunk.text[:180] + ("..." if len(chunk.text) > 180 else ""),
                        similarity_score=round(score, 3),
                    )
                )

        yield json.dumps({
            "type": "citations",
            "citations": [c.model_dump(mode="json") for c in citations],
            "session_id": session,
        }) + "\n\n"

        context_str = format_context_chunks(retrieved_chunks_with_scores)
        system_prompt = GROUNDED_RAG_SYSTEM_PROMPT.format(context=context_str)
        history = history_manager.get_history(session)

        full_answer_parts = []
        async for token in self.llm_provider.stream_generate(
            system_prompt=system_prompt,
            user_prompt=sanitized_query,
            history=history,
            temperature=settings.llm_temperature,
        ):
            full_answer_parts.append(token)
            yield json.dumps({"type": "token", "delta": token}) + "\n\n"

        full_answer = "".join(full_answer_parts)
        history_manager.add_message(session, ChatMessage(role="user", content=sanitized_query))
        history_manager.add_message(session, ChatMessage(role="assistant", content=full_answer, citations=citations))

        yield json.dumps({
            "type": "done",
            "answer": full_answer,
            "citations": [c.model_dump(mode="json") for c in citations],
            "session_id": session,
            "grounded": True,
            "latency_ms": round((time.perf_counter() - start_time) * 1000.0, 2),
        }) + "\n\n"


# Global default engine instance
chat_engine = ChatQueryEngine()

