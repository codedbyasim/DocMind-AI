"""Conversation History Session Manager (FR-404).

Maintains rolling conversation history per session ID in memory (or redis-compatible store).
"""

from collections import defaultdict
from typing import Dict, List
from core.models import ChatMessage


class SessionHistoryManager:
    """Stores conversation turns for active user chat sessions."""

    def __init__(self, max_history_per_session: int = 10):
        self._sessions: Dict[str, List[ChatMessage]] = defaultdict(list)
        self.max_history = max_history_per_session

    def add_message(self, session_id: str, message: ChatMessage) -> None:
        """Append a message to a session's history, trimming to max_history."""
        history = self._sessions[session_id]
        history.append(message)
        if len(history) > self.max_history * 2:  # 2 messages per turn (user + assistant)
            self._sessions[session_id] = history[-(self.max_history * 2) :]

    def get_history(self, session_id: str) -> List[ChatMessage]:
        """Retrieve full message history for a given session."""
        return self._sessions.get(session_id, [])

    def clear_session(self, session_id: str) -> bool:
        """Clear history for a session."""
        if session_id in self._sessions:
            del self._sessions[session_id]
            return True
        return False


# Global singleton instance
history_manager = SessionHistoryManager()
