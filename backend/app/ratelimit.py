"""In-memory limits so a public deployment can't burn through the AI key.

Per client IP, sliding one-hour windows. Limits are configurable:
  AI_GENERATIONS_PER_HOUR (default 6), AI_MESSAGES_PER_HOUR (default 120).
Optional ACCESS_CODE: if set, AI features require it (share it with your class).
"""
from __future__ import annotations

import os
import secrets
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

_hits: dict[tuple[str, str], deque[float]] = defaultdict(deque)
LIMITS = {
    "generate": int(os.environ.get("AI_GENERATIONS_PER_HOUR", "6")),
    "message": int(os.environ.get("AI_MESSAGES_PER_HOUR", "120")),
}


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "unknown")


def check(request: Request, kind: str) -> None:
    code = os.environ.get("ACCESS_CODE", "")
    if code and not secrets.compare_digest(request.headers.get("x-access-code", ""), code):
        raise HTTPException(401, "This server needs an access code for AI features. Ask the person who runs it.")
    now = time.time()
    q = _hits[(client_ip(request), kind)]
    while q and now - q[0] > 3600:
        q.popleft()
    if len(q) >= LIMITS[kind]:
        wait = int(3600 - (now - q[0])) // 60 + 1
        what = "generations" if kind == "generate" else "AI messages"
        raise HTTPException(429, f"Limit reached: {LIMITS[kind]} {what} per hour. Try again in about {wait} minutes.")
    q.append(now)


def reset() -> None:
    _hits.clear()
