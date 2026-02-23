from openai import AsyncOpenAI

from config import get_settings
from prompts import FLASHCARD_PROMPT, QUIZ_PROMPT
from utils import parse_json_response
from services.vector_store import get_chunks_for_session, cache_quiz_answers

_MAX_CONTENT_CHARS = 12000  # ~3000 tokens — safe budget for generation prompts


def _get_client() -> AsyncOpenAI:
    s = get_settings()
    return AsyncOpenAI(
        api_key=s.openai_api_key,
        base_url=s.openai_base_url or None,
    )


def _truncate_content(chunks: list[str], max_chars: int = _MAX_CONTENT_CHARS) -> str:
    combined = "\n\n".join(chunks)
    return combined[:max_chars]


async def generate_flashcards(session_id: str, count: int = 10) -> list[dict]:
    """
    Retrieve document chunks for the session and generate flashcards via LLM.
    Returns a list of {"front": ..., "back": ...} dicts.
    """
    chunks = await get_chunks_for_session(session_id, limit=60)
    if not chunks:
        raise ValueError(f"No content found for session {session_id}. Process a document first.")

    content = _truncate_content(chunks)
    prompt = FLASHCARD_PROMPT.format(count=count, content=content)

    client = _get_client()
    response = await client.chat.completions.create(
        model=get_settings().chat_model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0,
        max_tokens=2000,
    )

    raw = response.choices[0].message.content or ""
    cards = parse_json_response(raw)

    # Validate structure
    validated = []
    for card in cards:
        if isinstance(card, dict) and "front" in card and "back" in card:
            validated.append({"front": str(card["front"]), "back": str(card["back"])})
    return validated


async def generate_quiz(session_id: str, count: int = 5) -> list[dict]:
    """
    Generate MCQ quiz questions. Caches correct_index server-side.
    Returns question dicts WITHOUT correct_index (stripped before returning).
    """
    chunks = await get_chunks_for_session(session_id, limit=60)
    if not chunks:
        raise ValueError(f"No content found for session {session_id}. Process a document first.")

    content = _truncate_content(chunks)
    prompt = QUIZ_PROMPT.format(count=count, content=content)

    client = _get_client()
    response = await client.chat.completions.create(
        model=get_settings().chat_model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0,
        max_tokens=2500,
    )

    raw = response.choices[0].message.content or ""
    questions = parse_json_response(raw)

    # Separate answers from questions
    safe_questions = []
    correct_indices = []
    explanations = []

    for q in questions:
        if not isinstance(q, dict):
            continue
        correct_indices.append(int(q.get("correct_index", 0)))
        explanations.append(str(q.get("explanation", "")))
        safe_questions.append({
            "question": str(q.get("question", "")),
            "options": [str(o) for o in q.get("options", [])],
            "explanation": "",  # hidden until answered
        })

    # Cache answers server-side
    cache_quiz_answers(session_id, correct_indices, explanations)
    return safe_questions
