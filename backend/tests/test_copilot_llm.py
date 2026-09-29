"""The Claude-backed copilot keeps only citations that exist and falls back on refusal."""
from types import SimpleNamespace

from app.providers.ai.llm_provider import LLMProvider

EVIDENCE = {"case": {"findings": [{"id": "doc:1:OVERLAPPING_TEXT", "code": "OVERLAPPING_TEXT", "severity": "HIGH",
                                    "source": "DOCUMENT", "title": "t", "detail": "'2027' typed over '2025'.", "category": "OEM"}]}}


class _Messages:
    def __init__(self, reply):
        self.reply = reply

    def create(self, **kw):
        assert kw["model"] and kw["fallbacks"] == "default"
        return self.reply


def _provider(reply):
    p = LLMProvider.__new__(LLMProvider)
    from app.providers.ai.mock_ai_provider import MockAIProvider
    import anthropic

    p._anthropic, p._fallback = anthropic, MockAIProvider()
    p._client = SimpleNamespace(beta=SimpleNamespace(messages=_Messages(reply)))
    return p


def test_invented_citations_are_dropped():
    reply = SimpleNamespace(stop_reason="end_turn", model="claude-opus-5",
                            content=[SimpleNamespace(type="text", text="The expiry was retyped [doc:1:OVERLAPPING_TEXT] [made:up].")])
    out = _provider(reply).answer_copilot_question("Was it edited?", EVIDENCE)
    assert out["evidence"] == ["doc:1:OVERLAPPING_TEXT"]


def test_refusal_falls_back_to_templated_answer():
    reply = SimpleNamespace(stop_reason="refusal", model="claude-opus-5", content=[])
    out = _provider(reply).answer_copilot_question("Was anything tampered with?", EVIDENCE)
    assert "doc:1:OVERLAPPING_TEXT" in out["evidence"]
