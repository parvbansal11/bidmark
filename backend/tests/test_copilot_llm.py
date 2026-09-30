"""The Claude-backed copilot keeps only real citations and reports itself unavailable instead of substituting answers."""
from types import SimpleNamespace

import anthropic
import httpx2
import pytest

from app.providers.ai.base import CopilotUnavailable
from app.providers.ai.llm_provider import LLMProvider

EVIDENCE = {"case": {"findings": [{"id": "doc:1:OVERLAPPING_TEXT", "code": "OVERLAPPING_TEXT", "severity": "HIGH",
                                    "source": "DOCUMENT", "title": "t", "detail": "'2027' typed over '2025'.", "category": "OEM"}]}}


class _Messages:
    def __init__(self, reply=None, raises=None):
        self.reply, self.raises, self.kwargs = reply, raises, None

    def create(self, **kw):
        self.kwargs = kw
        if self.raises:
            raise self.raises
        return self.reply


def _provider(reply=None, raises=None):
    p = LLMProvider()
    p._messages = _Messages(reply, raises)
    p._client = SimpleNamespace(beta=SimpleNamespace(messages=p._messages))
    return p


def _reply(text, stop_reason="end_turn"):
    return SimpleNamespace(stop_reason=stop_reason, model="claude-opus-5-5", content=[SimpleNamespace(type="text", text=text)] if text else [])


def test_invented_citations_are_dropped():
    out = _provider(_reply("The expiry was retyped [doc:1:OVERLAPPING_TEXT] [made:up].")).answer_copilot_question("Was it edited?", EVIDENCE)
    assert out["evidence"] == ["doc:1:OVERLAPPING_TEXT"]
    assert out["provider"] == "anthropic:claude-opus-5-5"


def test_request_uses_fallbacks_and_leaves_room_for_thinking():
    p = _provider(_reply("Nothing found [doc:1:OVERLAPPING_TEXT]."))
    p.answer_copilot_question("q", EVIDENCE)
    kw = p._messages.kwargs
    assert kw["fallbacks"] == "default" and kw["max_tokens"] >= 16000 and "thinking" not in kw


def test_refusal_is_reported_not_replaced():
    with pytest.raises(CopilotUnavailable):
        _provider(_reply("", stop_reason="refusal")).answer_copilot_question("Was anything tampered with?", EVIDENCE)


def test_empty_answer_is_reported():
    with pytest.raises(CopilotUnavailable):
        _provider(_reply("", stop_reason="max_tokens")).answer_copilot_question("q", EVIDENCE)


def test_api_error_is_reported():
    req = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    err = anthropic.APIConnectionError(request=req)
    with pytest.raises(CopilotUnavailable):
        _provider(raises=err).answer_copilot_question("q", EVIDENCE)


def test_missing_credentials_are_reported(monkeypatch, tmp_path):
    # The SDK raises TypeError when it cannot resolve any credential; that used to escape as a 500.
    for var in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_PROFILE", "ANTHROPIC_CONFIG_DIR", "ANTHROPIC_FEDERATION_RULE_ID"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path))
    from app.core.config import settings
    monkeypatch.setattr(settings, "LLM_API_KEY", "")
    with pytest.raises(CopilotUnavailable):
        LLMProvider().answer_copilot_question("q", EVIDENCE)


class _DownProvider:
    def answer_copilot_question(self, question, evidence):
        raise CopilotUnavailable("test")


def test_endpoint_returns_503_when_assistant_is_down(client, officer_headers, sample_bidder, sample_tender, monkeypatch):
    import app.services.copilot_service as svc
    monkeypatch.setattr(svc, "get_ai_provider", lambda: _DownProvider())
    body = {"bidder_id": sample_bidder["id"], "tender_id": sample_tender["id"], "question": "Why?"}
    res = client.post("/api/v1/copilot/ask", json=body, headers=officer_headers)
    assert res.status_code == 503
    assert res.json()["error"]["code"] == "COPILOT_UNAVAILABLE"
    assert "answer" not in res.text


def test_templated_answers_are_labelled(client, officer_headers, sample_bidder, sample_tender):
    body = {"bidder_id": sample_bidder["id"], "tender_id": sample_tender["id"], "question": "Why was this bidder flagged?"}
    res = client.post("/api/v1/copilot/ask", json=body, headers=officer_headers)
    assert res.status_code == 200
    assert res.json()["data"]["provider"] == "bidmark:templated"
    status = client.get("/api/v1/copilot/status", headers=officer_headers).json()["data"]
    assert status == {"mode": "templated", "model": None}
