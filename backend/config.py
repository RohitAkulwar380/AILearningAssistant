from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional


class Settings(BaseSettings):
    openai_api_key: str
    supabase_url: str
    supabase_key: str
    allowed_origins: str = "http://localhost:3000"

    # Optional: set to use OpenRouter or any OpenAI-compatible provider
    # e.g. https://openrouter.ai/api/v1
    openai_base_url: Optional[str] = "https://openrouter.ai/api/v1"

    # Model names — use OpenRouter format if needed e.g. "openai/gpt-4o-mini"
    chat_model: str = "meta-llama/llama-3.1-8b-instruct"
    embedding_model: str = "text-embedding-3-small"

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
