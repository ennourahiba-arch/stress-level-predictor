"""Busy providers: retries, then the fallback model, then a clear message."""
import asyncio
import json

import httpx
import pytest

from app import llm


def _ok(text):
    return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": text}]}}]})


@pytest.fixture()
def gemini(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setenv("LLM_MODEL", "main-model")
    monkeypatch.delenv("LLM_FALLBACK_MODEL", raising=False)
    monkeypatch.setattr(llm, "RETRY_DELAYS", [0, 0])
    calls = []
    yield calls
    llm.TRANSPORT = None


def run(coro):
    return asyncio.run(coro)


def test_retries_then_succeeds(gemini):
    def handler(req):
        gemini.append(req.url.path)
        return httpx.Response(503) if len(gemini) < 3 else _ok('{"a": 1}')
    llm.TRANSPORT = httpx.MockTransport(handler)
    assert run(llm.complete_json("s", "u")) == {"a": 1}
    assert len(gemini) == 3


def test_falls_back_to_second_model(gemini, monkeypatch):
    monkeypatch.setenv("LLM_FALLBACK_MODEL", "lite-model")
    def handler(req):
        gemini.append(req.url.path)
        return _ok('{"b": 2}') if "lite-model" in req.url.path else httpx.Response(503)
    llm.TRANSPORT = httpx.MockTransport(handler)
    assert run(llm.complete_json("s", "u")) == {"b": 2}
    assert sum("main-model" in c for c in gemini) == 3 and "lite-model" in gemini[-1]


def test_clear_message_when_still_overloaded(gemini):
    llm.TRANSPORT = httpx.MockTransport(lambda req: httpx.Response(503))
    with pytest.raises(llm.LLMError) as e:
        run(llm.complete("s", "u", json_mode=True))
    assert "overloaded" in str(e.value) and "LLM_FALLBACK_MODEL" in str(e.value)


def test_bad_key_is_not_retried(gemini):
    llm.TRANSPORT = httpx.MockTransport(lambda req: (gemini.append(1), httpx.Response(401))[1])
    with pytest.raises(llm.LLMError) as e:
        run(llm.complete("s", "u", json_mode=False))
    assert "key was rejected" in str(e.value) and len(gemini) == 1


def test_cut_off_reply_is_reported_clearly(gemini):
    llm.TRANSPORT = httpx.MockTransport(lambda req: httpx.Response(
        200, json={"candidates": [{"finishReason": "MAX_TOKENS", "content": {"parts": [{"text": '{"rounds": [{"q'}]}}]}))
    with pytest.raises(llm.LLMError) as e:
        run(llm.complete_json("s", "u"))
    assert "cut off" in str(e.value)


def test_thought_parts_are_ignored(gemini):
    llm.TRANSPORT = httpx.MockTransport(lambda req: httpx.Response(
        200, json={"candidates": [{"content": {"parts": [{"text": "Let me think...", "thought": True}, {"text": '{"ok": true}'}]}}]}))
    assert run(llm.complete_json("s", "u")) == {"ok": True}
