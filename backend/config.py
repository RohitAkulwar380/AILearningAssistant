from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional


class Settings(BaseSettings):
    openrouter_api_key: str
    supabase_url: str
    supabase_key: str
    allowed_origins: str = "http://localhost:3000"

    # Default OpenRouter API base
    openrouter_base_url: str = "https://openrouter.ai/api/v1"

    # Model names — using OpenRouter format
    chat_model: str = "meta-llama/llama-3.1-8b-instruct"
    embedding_model: str = "openai/text-embedding-3-small"

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
