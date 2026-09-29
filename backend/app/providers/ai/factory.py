from functools import lru_cache

from app.core.config import settings
from app.providers.ai.base import AIProvider


@lru_cache
def get_ai_provider() -> AIProvider:
    if settings.AI_PROVIDER == "llm":
        from app.providers.ai.llm_provider import LLMProvider

        return LLMProvider()
    from app.providers.ai.mock_ai_provider import MockAIProvider

    return MockAIProvider()
