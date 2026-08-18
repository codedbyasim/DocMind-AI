"""Middleware and security configuration for FastAPI."""

import time
from collections import defaultdict
from typing import Dict, List
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from core.config import settings


class SimpleRateLimiterMiddleware(BaseHTTPMiddleware):
    """In-memory sliding window rate limiter for public endpoints per SRS Section 5.1."""

    def __init__(self, app: FastAPI, max_requests_per_minute: int = 30):
        super().__init__(app)
        self.max_requests = max_requests_per_minute
        self._requests: Dict[str, List[float]] = defaultdict(list)

    async def dispatch(self, request: Request, call_next):
        # Rate limit only chat requests
        if request.url.path.endswith("/chat") and request.method == "POST":
            client_ip = request.client.host if request.client else "unknown"
            now = time.time()
            window_start = now - 60.0

            # Filter old requests
            self._requests[client_ip] = [
                t for t in self._requests[client_ip] if t > window_start
            ]

            if len(self._requests[client_ip]) >= self.max_requests:
                return Response(
                    content=f'{{"detail": "Rate limit exceeded. Maximum {self.max_requests} requests per minute allowed."}}',
                    status_code=429,
                    media_type="application/json",
                    headers={"Retry-After": "60"},
                )

            self._requests[client_ip].append(now)

        response = await call_next(request)
        # Add basic security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        return response



def setup_middleware(app: FastAPI) -> None:
    """Register CORS and rate limiting middleware on the FastAPI instance."""
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(
        SimpleRateLimiterMiddleware,
        max_requests_per_minute=settings.chat_rate_limit_per_minute,
    )
