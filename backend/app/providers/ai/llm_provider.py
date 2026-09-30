"""Copilot answers written by Claude, grounded in the evidence passed in.

Enabled with AI_PROVIDER=llm. The model sees only the evidence JSON for one
case and must cite finding ids for every claim. Missing credentials, API
errors, timeouts, refusals and empty answers raise CopilotUnavailable: the
officer is told the assistant is unavailable, never shown a substitute answer.
Verification, findings and decisions do not depend on this provider.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from app.core.config import settings
from app.providers.ai.base import AIProvider, CopilotUnavailable
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

        self._anthropic = anthropic
        self._client = None
        # Recommendations and anomaly text stay deterministic; only the copilot uses the model.
        self._rules = MockAIProvider()

    def _get_client(self):
        if self._client is None:
            a = self._anthropic
            opts = {"timeout": settings.LLM_TIMEOUT_SECONDS, "max_retries": 1}
            # An empty LLM_API_KEY falls back to the SDK's credential chain (ANTHROPIC_API_KEY, `ant auth login`).
            self._client = a.Anthropic(api_key=settings.LLM_API_KEY, **opts) if settings.LLM_API_KEY else a.Anthropic(**opts)
        return self._client

    def build_recommendation(self, context: dict[str, Any]) -> dict[str, Any]:
        return self._rules.build_recommendation(context)

    def explain_anomaly(self, signal: dict[str, Any]) -> str:
        return self._rules.explain_anomaly(signal)

    def answer_copilot_question(self, question: str, evidence: dict[str, Any]) -> dict[str, Any]:
        a = self._anthropic
        try:
            response = self._get_client().beta.messages.create(
                model=settings.LLM_MODEL,
                max_tokens=16000,
                output_config={"effort": "low"},
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
                system=SYSTEM,
                messages=[{"role": "user", "content": f"Evidence:\n{json.dumps(evidence, default=str)}\n\nQuestion: {question}"}],
            )
        except a.AuthenticationError as exc:
            logger.warning("copilot: Anthropic rejected the credentials (%s)", exc.message)
            raise CopilotUnavailable("credentials rejected") from exc
        except a.NotFoundError as exc:
            logger.warning("copilot: model %r not found (%s)", settings.LLM_MODEL, exc.message)
            raise CopilotUnavailable("model not found") from exc
        except a.BadRequestError as exc:
            logger.warning("copilot: request rejected (%s)", exc.message)
            raise CopilotUnavailable("request rejected") from exc
        except a.APITimeoutError as exc:
            logger.warning("copilot: no response within %ss", settings.LLM_TIMEOUT_SECONDS)
            raise CopilotUnavailable("timeout") from exc
        except (a.RateLimitError, a.APIStatusError, a.APIConnectionError) as exc:
            logger.warning("copilot: API call failed (%s)", type(exc).__name__)
            raise CopilotUnavailable(type(exc).__name__) from exc
        except TypeError as exc:
            # The SDK raises TypeError when no API key, auth token or profile can be resolved.
            logger.warning("copilot: no Anthropic credentials configured (%s)", exc)
            raise CopilotUnavailable("no credentials") from exc
        except a.AnthropicError as exc:
            logger.warning("copilot: Anthropic client error (%s)", exc)
            raise CopilotUnavailable(type(exc).__name__) from exc

        if response.stop_reason == "refusal":
            logger.warning("copilot: model declined the question")
            raise CopilotUnavailable("refusal")
        text = "".join(b.text for b in response.content if b.type == "text").strip()
        if not text:
            logger.warning("copilot: empty answer (stop_reason=%s)", response.stop_reason)
            raise CopilotUnavailable("empty answer")
        known = {f["id"] for f in (evidence.get("case") or {}).get("findings", [])}
        cited = [c for c in dict.fromkeys(re.findall(r"\[([^\[\]]+)\]", text)) if c in known]
        return {"answer": text, "evidence": cited or ["No finding cited."], "provider": f"anthropic:{response.model}"}
