"""
LLMProvider — optional scaffold for a real LLM-backed provider. NOT wired up
by default (AI_PROVIDER=mock in .env). If enabled, it would read
settings.LLM_API_KEY and call out to a language model, but must still ground
every answer in the evidence passed to it and must never fabricate
verification results. Left intentionally unimplemented for this prototype.
"""
from typing import Any

from app.core.config import settings
from app.providers.ai.base import AIProvider
from app.providers.ai.mock_ai_provider import MockAIProvider


class LLMProvider(AIProvider):
    def __init__(self):
        if not settings.LLM_API_KEY:
            raise RuntimeError(
                "AI_PROVIDER is set to 'llm' but LLM_API_KEY is empty. "
                "Set LLM_API_KEY in .env, or set AI_PROVIDER=mock to use the deterministic provider."
            )
        # Intentionally not implemented in this prototype: wire up your LLM
        # SDK of choice here, but keep MockAIProvider's evidence-grounding
        # rules — never invent a verification result.
        self._fallback = MockAIProvider()

    def build_recommendation(self, context: dict[str, Any]) -> dict[str, Any]:
        return self._fallback.build_recommendation(context)

    def explain_anomaly(self, signal: dict[str, Any]) -> str:
        return self._fallback.explain_anomaly(signal)

    def answer_copilot_question(self, question: str, evidence: dict[str, Any]) -> dict[str, Any]:
        return self._fallback.answer_copilot_question(question, evidence)
