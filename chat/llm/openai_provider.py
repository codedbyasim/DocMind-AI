"""OpenAI LLM Provider Implementation."""

import logging
from typing import List, Optional
from core.config import settings
from core.models import ChatMessage
from chat.llm.base import BaseLLMProvider

logger = logging.getLogger("docmind.chat.llm.openai")


class OpenAILLMProvider(BaseLLMProvider):
    """Generates chat responses using OpenAI or OpenAI-compatible API (e.g. AI/ML API)."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model_name: Optional[str] = None,
    ):
        self._api_key = api_key or settings.llm_api_key
        self._base_url = base_url if base_url is not None else settings.llm_base_url
        self._model_name = model_name or settings.llm_model or "gpt-4o-mini"
        self._client = None

    @property
    def provider_name(self) -> str:
        return "openai"

    @property
    def model_name(self) -> str:
        return self._model_name

    @property
    def base_url(self) -> Optional[str]:
        return self._base_url

    def _get_client(self):
        if not self._client:
            from openai import AsyncOpenAI
            if not self._api_key:
                raise ValueError("LLM API key missing. Set LLM_API_KEY or OPENAI_API_KEY in .env")
            client_kwargs = {
                "api_key": self._api_key,
                "timeout": settings.llm_timeout_seconds,
            }
            if self._base_url:
                client_kwargs["base_url"] = self._base_url
            self._client = AsyncOpenAI(**client_kwargs)
        return self._client


    async def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        history: Optional[List[ChatMessage]] = None,
        temperature: Optional[float] = None,
    ) -> str:
        client = self._get_client()
        temp = temperature if temperature is not None else settings.llm_temperature

        messages = [{"role": "system", "content": system_prompt}]

        if history:
            for msg in history:
                if msg.role in ("user", "assistant"):
                    messages.append({"role": msg.role, "content": msg.content})

        messages.append({"role": "user", "content": user_prompt})

        response = await client.chat.completions.create(
            model=self._model_name,
            messages=messages,
            temperature=temp,
        )

        return response.choices[0].message.content or ""
