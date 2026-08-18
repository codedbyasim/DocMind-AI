"""DocMind Security & Authentication Utilities (SRS §5.1, §2.2).

Enforces:
- HMAC-SHA256 signed session token lifecycle with automatic expiry (SESSION_TIMEOUT_MINUTES).
- Role-based server-side authentication for all /api/admin/* endpoints.
- Robust prompt-injection and control-character sanitization on /api/chat and admin inputs.
- Persistent audit logging for all administrative, scraping, and healing actions.
"""

import base64
import hashlib
import hmac
import json
import logging
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import Header, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from core.config import settings

logger = logging.getLogger("docmind.security")
security_bearer = HTTPBearer(auto_error=False)

# ------------------------------------------------------------------------------
# Prompt Injection & Input Sanitization (SRS §5.1)
# ------------------------------------------------------------------------------
PROMPT_INJECTION_PATTERNS = [
    r"ignore\s+(all\s+)?(previous|prior|above|system)\s+instructions?",
    r"disregard\s+(all\s+)?(previous|prior|above|system)\s+instructions?",
    r"forget\s+(all\s+)?(previous|prior|above|system)\s+(instructions?|rules?)",
    r"reveal\s+(your\s+|the\s+)?(system\s+)?(prompt|instructions?)",
    r"show\s+(me\s+)?(your\s+|the\s+)?(system\s+)?(prompt|instructions?)",
    r"what\s+is\s+(your\s+|the\s+)?(system\s+)?(prompt|instructions?)",
    r"system\s*prompt\s*override",
    r"you\s+are\s+now\s+(an?\s+)?(unfiltered|new|dan|jailbroken)",
    r"<\|im_start\|>",
    r"<\|im_end\|>",
    r"\[INST\]",
    r"\[/INST\]",
    r"<<SYS>>",
    r"<</SYS>>",
    r"---BEGIN\s+SYSTEM---",
    r"---END\s+SYSTEM---",
]


def sanitize_user_input(text: str, max_length: int = 2000) -> str:
    """Sanitize user chat input to neutralize prompt injection and control character abuse.

    Args:
        text: Raw user string.
        max_length: Maximum allowed character length.

    Returns:
        Sanitized safe string.
    """
    if not text:
        return ""

    # Strip null bytes and non-printable control characters except newline and tab
    cleaned = "".join(ch for ch in text if ch.isprintable() or ch in ("\n", "\t", " "))

    # Enforce maximum length limit
    cleaned = cleaned.strip()[:max_length]

    # Neutralize dangerous prompt breakout markers
    for pattern in PROMPT_INJECTION_PATTERNS:
        cleaned = re.sub(pattern, "[filtered-directive]", cleaned, flags=re.IGNORECASE)

    return cleaned


def sanitize_admin_input(text: str, max_length: int = 1000) -> str:
    """Sanitize administrative inputs (e.g. descriptions, feedback) before persistence or CLI use."""
    if not text:
        return ""
    cleaned = "".join(ch for ch in text if ch.isprintable() or ch in ("\n", "\t", " "))
    # Remove dangerous shell control metacharacters
    cleaned = re.sub(r"[`$;|&><]", "", cleaned)
    return cleaned.strip()[:max_length]


def sanitize_target_url(url: str) -> str:
    """Validate and sanitize target documentation URL."""
    if not url:
        raise ValueError("Target URL cannot be empty")
    cleaned = url.strip()
    if not (cleaned.startswith("http://") or cleaned.startswith("https://")):
        raise ValueError("Target URL must start with http:// or https://")
    # Strip dangerous metacharacters
    cleaned = re.sub(r"[\s`$;|&><]", "", cleaned)
    return cleaned


# ------------------------------------------------------------------------------
# HMAC-SHA256 Signed Session Token System (Zero-Dependency JWT)
# ------------------------------------------------------------------------------
def _base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("utf-8")


def _base64url_decode(data: str) -> bytes:
    padding = 4 - (len(data) % 4)
    if padding != 4:
        data += "=" * padding
    return base64.urlsafe_b64decode(data.encode("utf-8"))


def create_session_token(subject: str, expires_in_minutes: Optional[int] = None) -> str:
    """Generate a tamper-proof HMAC-SHA256 signed session token for authenticated admins.

    Args:
        subject: Username or identity identifier.
        expires_in_minutes: Optional token TTL in minutes (defaults to settings.session_timeout_minutes).

    Returns:
        Compact signed token string (header.payload.signature).
    """
    ttl = expires_in_minutes or settings.session_timeout_minutes
    now = int(time.time())
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": subject,
        "iat": now,
        "exp": now + (ttl * 60),
        "iss": "docmind-auth",
    }

    header_b64 = _base64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    payload_b64 = _base64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")

    secret = settings.session_secret_key.encode("utf-8")
    signature = hmac.new(secret, signing_input, hashlib.sha256).digest()
    sig_b64 = _base64url_encode(signature)

    return f"{header_b64}.{payload_b64}.{sig_b64}"


def verify_session_token(token: str) -> Optional[Dict[str, Any]]:
    """Verify cryptographic signature and expiration of a session token.

    Returns:
        Decoded payload dictionary if valid, None if tampered or expired.
    """
    if not token or token.count(".") != 2:
        return None

    try:
        header_b64, payload_b64, sig_b64 = token.split(".")
        signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")
        secret = settings.session_secret_key.encode("utf-8")

        expected_sig = hmac.new(secret, signing_input, hashlib.sha256).digest()
        actual_sig = _base64url_decode(sig_b64)

        if not hmac.compare_digest(expected_sig, actual_sig):
            logger.warning("Session token signature verification failed (tampered token)")
            return None

        payload_bytes = _base64url_decode(payload_b64)
        payload = json.loads(payload_bytes.decode("utf-8"))

        now = int(time.time())
        if payload.get("exp", 0) < now:
            logger.info("Session token expired for subject: %s", payload.get("sub"))
            return None

        return payload
    except Exception as exc:
        logger.warning("Failed to decode/verify session token: %s", exc)
        return None


# ------------------------------------------------------------------------------
# FastAPI Admin Authentication Dependency (SRS §2.2 & §5.1)
# ------------------------------------------------------------------------------
def verify_admin_auth(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security_bearer),
    x_admin_key: Optional[str] = Header(None, alias="X-Admin-API-Key"),
) -> str:
    """Protect /api/admin/* routes via API Key or signed Session Bearer Token.

    Returns:
        Authenticated actor identifier (e.g. 'admin' or 'admin-api-key').

    Raises:
        HTTPException 401 Unauthorized if missing, invalid, or expired credentials.
    """
    provided_token = None
    if credentials and credentials.credentials:
        provided_token = credentials.credentials.strip()
    elif x_admin_key:
        provided_token = x_admin_key.strip()

    if not provided_token:
        logger.warning("Unauthorized admin access attempt: missing credentials")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin authentication required. Please login or provide a valid Bearer token / X-Admin-API-Key.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 1. Direct API Key Match
    expected_api_key = settings.admin_api_key.strip()
    if provided_token == expected_api_key:
        return "admin-api-key"

    # 2. Signed Session Token Match
    session_payload = verify_session_token(provided_token)
    if session_payload:
        return session_payload.get("sub", "admin")

    logger.warning("Unauthorized admin access attempt: invalid or expired token")
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Forbidden: Invalid or expired admin credentials.",
    )



# ------------------------------------------------------------------------------
# Audit Logging System (SRS §5.1)
# ------------------------------------------------------------------------------
AUDIT_LOG_FILE = Path("./data/logs/audit_log.json")


def audit_log(action: str, actor: str, details: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Emit and persist a structured audit log entry for administrative and healing actions."""
    AUDIT_LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "action": action,
        "actor": actor,
        "details": details or {},
    }

    try:
        existing = []
        if AUDIT_LOG_FILE.exists():
            try:
                with open(AUDIT_LOG_FILE, "r", encoding="utf-8") as f:
                    existing = json.load(f)
            except Exception:
                existing = []
        existing.append(entry)
        
        # Atomic write
        temp_file = AUDIT_LOG_FILE.with_suffix(f".tmp.{os.getpid()}")
        with open(temp_file, "w", encoding="utf-8") as f:
            json.dump(existing[-200:], f, indent=2)  # Keep rolling last 200 events
        os.replace(temp_file, AUDIT_LOG_FILE)
    except Exception as exc:
        logger.error("Failed to persist audit log entry: %s", exc)

    logger.info("AUDIT [%s] Actor='%s' Action='%s': %s", entry["timestamp"], actor, action, details)
    return entry



def get_audit_logs(limit: int = 50) -> List[Dict[str, Any]]:
    """Retrieve recent audit log records."""
    if not AUDIT_LOG_FILE.exists():
        return []
    try:
        with open(AUDIT_LOG_FILE, "r", encoding="utf-8") as f:
            records = json.load(f)
            return list(reversed(records))[:limit]
    except Exception as exc:
        logger.error("Failed to read audit logs: %s", exc)
        return []
