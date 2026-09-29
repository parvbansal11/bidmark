"""Copilot answers written by Claude, grounded in the evidence passed in.

Enabled with AI_PROVIDER=llm. The model sees only the evidence JSON for one
case and must cite finding ids for every claim. Any API error, refusal or
missing credential falls back to the templated MockAIProvider, so the demo
never depends on the network.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from app.core.config import settings
from app.providers.ai.base import AIProvider
from app.providers.ai.mock_ai_provider import MockAIProvider

logger = logging.getLogger(__name__)

SYSTEM = """You assist a government procurement officer reviewing one bidder on one tender.
Answer only from the JSON evidence in the user message. If the evidence does not contain the answer, say so plainly.
Cite every factual claim with the finding id in square brackets, for example [doc:abc:OVERLAPPING_TEXT].
Describe findings as observations for review. Do not say a bidder committed fraud or is guilty; the officer decides.
Keep answers under 150 words, plain sentences, no headings."""


class LLMProvider(AIProvider):
    def __init__(self):
        import anthropic

        # Falls back to the SDK's own credential chain (ANTHROPIC_API_KEY, `ant auth login`) when LLM_API_KEY is empty.
        self._client = anthropic.Anthropic(api_key=settings.LLM_API_KEY) if settings.LLM_API_KEY else anthropic.Anthropic()
        self._anthropic = anthropic
        self._fallback = MockAIProvider()

    def build_recommendation(self, context: dict[str, Any]) -> dict[str, Any]:
        return self._fallback.build_recommendation(context)

    def explain_anomaly(self, signal: dict[str, Any]) -> str:
        return self._fallback.explain_anomaly(signal)

    def answer_copilot_question(self, question: str, evidence: dict[str, Any]) -> dict[str, Any]:
        a = self._anthropic
        try:
            response = self._client.beta.messages.create(
                model=settings.LLM_MODEL,
                max_tokens=2000,
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
                system=SYSTEM,
                messages=[{"role": "user", "content": f"Evidence:\n{json.dumps(evidence, default=str)}\n\nQuestion: {question}"}],
            )
        except a.AuthenticationError:
            logger.warning("copilot: no valid Anthropic credentials, using templated answers")
            return self._fallback.answer_copilot_question(question, evidence)
        except (a.RateLimitError, a.APIStatusError, a.APIConnectionError) as exc:
            logger.warning("copilot: API call failed (%s), using templated answers", type(exc).__name__)
            return self._fallback.answer_copilot_question(question, evidence)

        if response.stop_reason == "refusal":
            return self._fallback.answer_copilot_question(question, evidence)
        text = "".join(b.text for b in response.content if b.type == "text").strip()
        known = {f["id"] for f in (evidence.get("case") or {}).get("findings", [])}
        cited = [c for c in dict.fromkeys(re.findall(r"\[([^\[\]]+)\]", text)) if c in known]
        return {"answer": text, "evidence": cited or ["No finding cited."], "provider": f"anthropic:{response.model}"}
