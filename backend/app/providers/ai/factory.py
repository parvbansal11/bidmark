from functools import lru_cache

from app.providers.ai.base import AIProvider


@lru_cache
def get_ai_provider() -> AIProvider:
    # Recommendations and anomaly text are rule-based. No external model is called.
    from app.providers.ai.mock_ai_provider import MockAIProvider

    return MockAIProvider()
