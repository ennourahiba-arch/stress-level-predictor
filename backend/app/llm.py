"""One small interface over the AI providers.

Configured only through environment variables on the server (never in the website):
  LLM_PROVIDER   gemini | anthropic | fake     (unset = AI features off)
  GEMINI_API_KEY / ANTHROPIC_API_KEY
  LLM_MODEL      optional model override
  LLM_FALLBACK_MODEL  optional second model, used when the first is overloaded

"fake" is a scripted stand-in used by the automated tests and for local
development without a key. Everything it produces is labelled as simulated.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
from typing import Any, Callable

import httpx

DEFAULT_MODELS = {"gemini": "gemini-2.5-flash", "anthropic": "claude-sonnet-5-5", "fake": "simulated"}
TIMEOUT = httpx.Timeout(120.0, connect=15.0)
RETRY_STATUS = {429, 500, 502, 503, 504}
RETRY_DELAYS = [2.0, 5.0]  # seconds between attempts; tests set this to [0, 0]
TRANSPORT: httpx.AsyncBaseTransport | None = None  # tests install a mock transport here


class LLMError(Exception):
    """A user-presentable failure (bad key, quota, unreadable reply...)."""


TRUNCATED = ("The AI's reply was cut off before it finished. Try fewer rounds, a smaller file, "
             "or a standard Flash model in LLM_MODEL.")


class _Retryable(Exception):
    def __init__(self, response: httpx.Response):
        self.response = response


def provider() -> str | None:
    p = os.environ.get("LLM_PROVIDER", "").strip().lower()
    return p if p in DEFAULT_MODELS else None


def model() -> str:
    p = provider() or "fake"
    return os.environ.get("LLM_MODEL", "").strip() or DEFAULT_MODELS[p]


def fallback_model() -> str | None:
    m = os.environ.get("LLM_FALLBACK_MODEL", "").strip()
    return m if m and m != model() else None


def status() -> dict[str, Any]:
    p = provider()
    key_ok = p == "fake" or (p == "gemini" and bool(os.environ.get("GEMINI_API_KEY"))) or (
        p == "anthropic" and bool(os.environ.get("ANTHROPIC_API_KEY")))
    return {"enabled": bool(p and key_ok), "provider": p, "model": model() if p else None,
            "fallback_model": fallback_model() if p else None, "test_mode": p == "fake"}


# Tests install a function here: (system, user) -> str
FAKE_RESPONDER: Callable[[str, str], str] | None = None


async def complete(system: str, user: str, *, json_mode: bool, temperature: float = 0.4, max_tokens: int = 8000) -> str:
    p = provider()
    if not status()["enabled"]:
        raise LLMError("AI features are not set up on this server yet. Add LLM_PROVIDER and an API key in Render.")
    if p == "fake":
        if FAKE_RESPONDER is not None:
            return FAKE_RESPONDER(system, user)
        from .fake_ai import respond
        return respond(system, user)
    name = "Gemini" if p == "gemini" else "Claude"
    models = [model()] + ([fallback_model()] if fallback_model() else [])
    last: httpx.Response | None = None
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, transport=TRANSPORT) as client:
            for m in models:
                # Busy or rate-limited providers get a few patient retries, then the backup model.
                for attempt in range(len(RETRY_DELAYS) + 1):
                    try:
                        if p == "gemini":
                            return await _gemini(client, m, system, user, json_mode, temperature, max_tokens)
                        return await _anthropic(client, m, system, user, temperature, max_tokens)
                    except _Retryable as e:
                        last = e.response
                        if attempt < len(RETRY_DELAYS):
                            await asyncio.sleep(RETRY_DELAYS[attempt])
    except httpx.TimeoutException:
        raise LLMError("The AI provider took too long to answer. Try again, or use a smaller file.")
    except httpx.HTTPError:
        raise LLMError("Couldn't reach the AI provider from the server. Try again in a minute.")
    assert last is not None
    raise LLMError(_provider_error(name, last, models[-1]))


async def _gemini(client: httpx.AsyncClient, m: str, system: str, user: str, json_mode: bool, temperature: float, max_tokens: int) -> str:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent"
    body: dict[str, Any] = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": user}]}],
        "generationConfig": {"temperature": temperature, "maxOutputTokens": max_tokens},
    }
    if json_mode:
        body["generationConfig"]["responseMimeType"] = "application/json"
    r = await client.post(url, json=body, headers={"x-goog-api-key": os.environ["GEMINI_API_KEY"]})
    if r.status_code in RETRY_STATUS:
        raise _Retryable(r)
    if r.status_code != 200:
        raise LLMError(_provider_error("Gemini", r, m))
    data = r.json()
    finish = (data.get("candidates") or [{}])[0].get("finishReason")
    if finish == "MAX_TOKENS":
        raise LLMError(TRUNCATED)
    try:
        # Skip any "thought" parts some models return before the answer.
        return "".join(p.get("text", "") for p in data["candidates"][0]["content"]["parts"] if not p.get("thought"))
    except (KeyError, IndexError):
        reason = data.get("promptFeedback", {}).get("blockReason") or data.get("candidates", [{}])[0].get("finishReason")
        raise LLMError(f"Gemini returned no text{f' ({reason})' if reason else ''}.")


async def _anthropic(client: httpx.AsyncClient, m: str, system: str, user: str, temperature: float, max_tokens: int) -> str:
    r = await client.post(
        "https://api.anthropic.com/v1/messages",
        headers={"x-api-key": os.environ["ANTHROPIC_API_KEY"], "anthropic-version": "2023-06-01"},
        json={"model": m, "max_tokens": max_tokens, "temperature": temperature, "system": system,
              "messages": [{"role": "user", "content": user}]},
    )
    if r.status_code in RETRY_STATUS | {529}:
        raise _Retryable(r)
    if r.status_code != 200:
        raise LLMError(_provider_error("Claude", r, m))
    if r.json().get("stop_reason") == "max_tokens":
        raise LLMError(TRUNCATED)
    return "".join(b.get("text", "") for b in r.json().get("content", []) if b.get("type") == "text")


def _provider_error(name: str, r: httpx.Response, m: str) -> str:
    if r.status_code in (401, 403):
        return f"The {name} API key was rejected. Check the key in Render's environment settings."
    if r.status_code == 404:
        return f"{name} doesn't recognise the model '{m}'. Set LLM_MODEL in Render to a current model name."
    if r.status_code == 429:
        return f"The {name} free quota or rate limit was reached. Wait a minute and try again."
    if r.status_code in (500, 502, 503, 504, 529):
        tip = "" if fallback_model() else " Setting LLM_FALLBACK_MODEL in Render to a lighter model helps when this happens."
        return f"{name} is overloaded right now (HTTP {r.status_code}), even after retrying. Try again in a minute.{tip}"
    return f"{name} returned an error (HTTP {r.status_code}). Try again shortly."


def parse_json(text: str) -> Any:
    """Parse a model's JSON reply, tolerating ```json fences and leading prose."""
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        m = re.search(r"[\[{].*[\]}]", t, re.S)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                pass
    raise LLMError(
        "The AI's reply wasn't in the expected format. Try again. If it keeps happening, "
        "set LLM_MODEL in Render to a standard Gemini Flash model."
    )


async def complete_json(system: str, user: str, **kw: Any) -> Any:
    """JSON completion with one automatic retry on malformed output."""
    try:
        return parse_json(await complete(system, user, json_mode=True, **kw))
    except LLMError as first:
        if "expected format" not in str(first):
            raise
        return parse_json(await complete(system, user + "\n\nReturn ONLY valid JSON.", json_mode=True, **kw))
