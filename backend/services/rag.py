from typing import AsyncGenerator

from openai import AsyncOpenAI

from config import get_settings
from models import ChatMessage
from services.embeddings import embed_single
from services.vector_store import retrieve_relevant_chunks

_SYSTEM_TEMPLATE = """You are a helpful learning assistant. Your job is to answer the user's questions \
based on the provided context from their uploaded document or video (including any source metadata tags like Title or Date).

If the answer is definitely not found in the context, say clearly: "I don't have enough information from the \
provided content to answer that."

Be concise, accurate, and educational in your responses.

Context:
{context}"""


def _get_client() -> AsyncOpenAI:
    s = get_settings()
    return AsyncOpenAI(
        api_key=s.openrouter_api_key,
        base_url=s.openrouter_base_url,
    )


async def stream_chat_response(
    message: str,
    session_id: str,
    history: list[ChatMessage],
) -> AsyncGenerator[str, None]:
    """
    Retrieve relevant chunks via RAG, build a context-grounded prompt,
    and stream the LLM response as SSE tokens.
    """
    # Step 1: embed the user's question
    query_embedding = await embed_single(message)

    # Step 2: retrieve top-K relevant chunks
    chunks = await retrieve_relevant_chunks(
        query_embedding=query_embedding,
        session_id=session_id,
        top_k=5,
        threshold=0.1,
    )

    # If nothing retrieved at all, issue a soft warning in context
    if chunks:
        context = "\n\n---\n\n".join(chunks)
    else:
        context = "(No relevant content found in the uploaded document for this query.)"

    system_prompt = _SYSTEM_TEMPLATE.format(context=context)

    # Step 3: build message list
    messages = [{"role": "system", "content": system_prompt}]
    for msg in history[-10:]:  # keep last 10 turns to stay within context budget
        messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": message})

    # Step 4: stream response
    client = _get_client()
    stream = await client.chat.completions.create(
        model=get_settings().chat_model,
        messages=messages,
        temperature=0.7,
        max_tokens=1000,
        stream=True,
    )

    async for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta
