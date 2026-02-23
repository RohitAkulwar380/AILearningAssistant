from openai import AsyncOpenAI

from config import get_settings

_BATCH_SIZE = 100


def _get_client() -> AsyncOpenAI:
    s = get_settings()
    return AsyncOpenAI(
        api_key=s.openrouter_api_key,
        base_url=s.openrouter_base_url,
    )


async def embed_chunks(chunks: list[str]) -> list[list[float]]:
    """
    Embed a list of text chunks using the configured embedding model.
    Processes in batches of 100 to stay within rate limits.
    """
    client = _get_client()
    model = get_settings().embedding_model
    all_embeddings: list[list[float]] = []

    for i in range(0, len(chunks), _BATCH_SIZE):
        batch = chunks[i : i + _BATCH_SIZE]
        response = await client.embeddings.create(
            model=model,
            input=batch,
        )
        all_embeddings.extend([item.embedding for item in response.data])

    return all_embeddings


async def embed_single(text: str) -> list[float]:
    """Convenience wrapper to embed a single string."""
    result = await embed_chunks([text])
    return result[0]

