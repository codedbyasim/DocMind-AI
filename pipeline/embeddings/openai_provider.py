import asyncio
import logging
from typing import List, Optional
from core.config import settings
from pipeline.embeddings.base import BaseEmbeddingProvider

logger = logging.getLogger("docmind.pipeline.embeddings.openai")


class OpenAIEmbeddingProvider(BaseEmbeddingProvider):
    """Generates embeddings using OpenAI or OpenAI-compatible API (e.g. AI/ML API)."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model_name: Optional[str] = None,
        dimension: Optional[int] = None,
        max_retries: Optional[int] = None,
        batch_size: Optional[int] = None,
    ):
        self._api_key = api_key or settings.embedding_api_key or settings.llm_api_key
        self._base_url = base_url if base_url is not None else settings.embedding_base_url
        self._model_name = model_name or settings.embedding_model or "text-embedding-3-small"
        self._dimension = dimension or settings.embedding_dimension or 1536
        self._max_retries = max_retries if max_retries is not None else settings.embedding_max_retries
        self._batch_size = batch_size or settings.embedding_batch_size
        self._client = None

    @property
    def provider_name(self) -> str:
        return "openai"

    @property
    def model_name(self) -> str:
        return self._model_name

    @property
    def dimension(self) -> int:
        return self._dimension

    @property
    def base_url(self) -> Optional[str]:
        return self._base_url

    def _get_client(self):
        if not self._client:
            from openai import AsyncOpenAI
            if not self._api_key:
                raise ValueError(
                    "Embedding API key missing. Set EMBEDDING_API_KEY or OPENAI_API_KEY in .env"
                )
            client_kwargs = {"api_key": self._api_key}
            if self._base_url:
                client_kwargs["base_url"] = self._base_url
            self._client = AsyncOpenAI(**client_kwargs)
        return self._client

    async def _embed_batch_with_retry(self, batch_texts: List[str]) -> List[List[float]]:
        """Embed a batch of texts with retry logic and exponential backoff per FR-202."""
        client = self._get_client()
        cleaned = [t.replace("\n", " ").strip() or " " for t in batch_texts]

        for attempt in range(1, self._max_retries + 1):
            try:
                response = await client.embeddings.create(
                    input=cleaned,
                    model=self._model_name,
                )
                return [item.embedding for item in response.data]
            except Exception as e:
                logger.warning(
                    "Embedding batch generation failed (attempt %d/%d): %s",
                    attempt,
                    self._max_retries,
                    str(e),
                )
                if attempt == self._max_retries:
                    logger.error(
                        "Persistent embedding error for batch of %d items after %d retries: %s",
                        len(batch_texts),
                        self._max_retries,
                        str(e),
                    )
                    raise
                # Exponential backoff: 0.5s, 1.0s, 2.0s...
                await asyncio.sleep(0.5 * (2 ** (attempt - 1)))

        return []

    async def embed_texts(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []

        all_embeddings: List[List[float]] = []
        # Chunk texts into batch_size chunks
        for i in range(0, len(texts), self._batch_size):
            batch = texts[i : i + self._batch_size]
            try:
                batch_embeddings = await self._embed_batch_with_retry(batch)
                all_embeddings.extend(batch_embeddings)
            except Exception as e:
                logger.error("Failed to generate embeddings for batch slice %d-%d: %s", i, i + len(batch), e)
                # For failed batches, fill with zero vectors or raise depending on caller handling
                raise

        return all_embeddings

    async def embed_query(self, query: str) -> List[float]:
        results = await self.embed_texts([query])
        if not results:
            raise RuntimeError("Failed to generate embedding for query")
        return results[0]

