"""Abstract Base Class for LLM Providers (FR-401, NFR-08).

Ensures all LLM backends (OpenAI, Anthropic, Groq, Ollama, Mock) can be swapped
purely via LLM_PROVIDER configuration without modifying RAG or chat routing.
"""

from abc import ABC, abstractmethod
from typing import List, Optional
from core.models import ChatMessage


class BaseLLMProvider(ABC):
    """Abstract interface for LLM text generation."""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Name of the LLM provider."""
        pass

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Name of the active model."""
        pass

    @abstractmethod
    async def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        history: Optional[List[ChatMessage]] = None,
        temperature: Optional[float] = None,
    ) -> str:
        """Generate a grounded response given system context and conversation history.

        Args:
            system_prompt: Grounded system instructions and context
            user_prompt: User query
            history: Optional past messages
            temperature: Sampling temperature

        Returns:
            Generated text string
        """
        pass
