import logging
import os
from typing import Optional
from core.config import LLMProviderType, settings
from chat.llm.base import BaseLLMProvider
from chat.llm.mock_provider import MockLLMProvider
from chat.llm.openai_provider import OpenAILLMProvider

logger = logging.getLogger("docmind.chat.llm.factory")


def get_llm_provider(
    provider_override: Optional[str] = None,
) -> BaseLLMProvider:
    """Return an LLM provider based on configuration or override.

    Args:
        provider_override: Optional string to override settings.llm_provider

    Returns:
        Instance of BaseLLMProvider
    """
    if os.environ.get("DOCMIND_MOCK_LLM", "").lower() == "true":
        return MockLLMProvider()

    provider_str = (provider_override or settings.llm_provider).lower()

    if provider_str == LLMProviderType.OPENAI:
        return OpenAILLMProvider()
    elif provider_str == LLMProviderType.MOCK:
        return MockLLMProvider()

    else:
        logger.warning(
            "LLM provider '%s' not explicitly configured; falling back to OpenAI or Mock",
            provider_str,
        )
        try:
            return OpenAILLMProvider()
        except Exception:
            logger.warning("Failed to initialize OpenAI LLM provider; using MockLLMProvider")
            return MockLLMProvider()
