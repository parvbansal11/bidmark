"""
AIProvider
  ├── MockAIProvider   (deterministic, rule-based, default, no external calls)
  └── LLMProvider      (optional; reads LLM_API_KEY; not wired by default)

AI in this platform never invents a verification result and never issues a
final qualification decision. It explains, classifies, maps requirements to
evidence, and drafts recommendations for a human Procurement Officer.
"""
from abc import ABC, abstractmethod
from typing import Any


class AIProvider(ABC):
    @abstractmethod
    def build_recommendation(self, context: dict[str, Any]) -> dict[str, Any]:
        ...

    @abstractmethod
    def explain_anomaly(self, signal: dict[str, Any]) -> str:
        ...

    @abstractmethod
    def answer_copilot_question(self, question: str, evidence: dict[str, Any]) -> dict[str, Any]:
        ...
