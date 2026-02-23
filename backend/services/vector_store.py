from config import get_settings
from supabase import create_client, Client

# In-memory cache for quiz answers: session_id -> list of correct_index per question
# This avoids sending correct answers to the frontend
_quiz_answer_cache: dict[str, list[int]] = {}
_explanation_cache: dict[str, list[str]] = {}


def _get_client() -> Client:
    s = get_settings()
    return create_client(s.supabase_url, s.supabase_key)


async def store_chunks(
    session_id: str,
    chunks: list[str],
    embeddings: list[list[float]],
    source_type: str = "youtube",
) -> None:
    """Insert text chunks + embeddings into the documents table."""
    client = _get_client()
    rows = [
        {
            "session_id": session_id,
            "content": chunk,
            "embedding": embedding,
            "source_type": source_type,
            "chunk_index": idx,
        }
        for idx, (chunk, embedding) in enumerate(zip(chunks, embeddings))
    ]
    client.table("documents").insert(rows).execute()


async def delete_session_data(session_id: str) -> None:
    """Delete all documents and clear caches for a given session."""
    client = _get_client()
    client.table("documents").delete().eq("session_id", session_id).execute()
    
    # Clear in-memory caches
    if session_id in _quiz_answer_cache:
        del _quiz_answer_cache[session_id]
    if session_id in _explanation_cache:
        del _explanation_cache[session_id]


async def retrieve_relevant_chunks(
    query_embedding: list[float],
    session_id: str,
    top_k: int = 5,
    threshold: float = 0.5,
) -> list[str]:
    """
    Perform cosine similarity search via the match_documents Supabase RPC.
    Uses a lower threshold (0.5) to be more permissive for short/noisy transcripts.
    """
    client = _get_client()
    result = client.rpc(
        "match_documents",
        {
            "query_embedding": query_embedding,
            "match_threshold": threshold,
            "match_count": top_k,
            "p_session_id": session_id,
        },
    ).execute()
    
    return [row["content"] for row in (result.data or [])]


async def get_chunks_for_session(session_id: str, limit: int = 60) -> list[str]:
    """
    Fetch the first N chunks for a session — used for flashcard/quiz generation
    where we want broad document coverage rather than query-specific retrieval.
    """
    client = _get_client()
    result = (
        client.table("documents")
        .select("content, chunk_index")
        .eq("session_id", session_id)
        .order("chunk_index")
        .limit(limit)
        .execute()
    )
    return [row["content"] for row in (result.data or [])]


def cache_quiz_answers(session_id: str, correct_indices: list[int], explanations: list[str]) -> None:
    _quiz_answer_cache[session_id] = correct_indices
    _explanation_cache[session_id] = explanations


def get_cached_answer(session_id: str, question_index: int) -> tuple[int, str] | None:
    indices = _quiz_answer_cache.get(session_id)
    explanations = _explanation_cache.get(session_id)
    if indices is None or question_index >= len(indices):
        return None
    return indices[question_index], explanations[question_index]
