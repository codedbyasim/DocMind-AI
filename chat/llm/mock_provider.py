"""Mock LLM Provider for offline testing and fast local evaluation."""

from typing import List, Optional
from core.models import ChatMessage
from chat.llm.base import BaseLLMProvider


class MockLLMProvider(BaseLLMProvider):
    """Produces deterministic simulated responses citing provided documentation context."""

    @property
    def provider_name(self) -> str:
        return "mock"

    @property
    def model_name(self) -> str:
        return "mock-llm-v1"

    async def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        history: Optional[List[ChatMessage]] = None,
        temperature: Optional[float] = None,
    ) -> str:
        if "No relevant documentation chunks retrieved." in system_prompt:
            return "I could not find information about that in the current documentation."

        return (
            f"Based on the provided documentation, here is the answer regarding '{user_prompt}':\n\n"
            f"The documentation outlines the core APIs and setup steps. "
            f"Please refer to the linked source citations for full specifications."
        )
