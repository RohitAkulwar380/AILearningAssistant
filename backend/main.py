import uuid
import json

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from config import get_settings
from models import (
    CheckAnswerRequest,
    CheckAnswerResponse,
    ChatRequest,
    FlashcardRequest,
    FlashcardsResponse,
    Flashcard,
    ProcessVideoRequest,
    ProcessVideoResponse,
    ProcessPdfRequest,
    ProcessPdfResponse,
    QuizRequest,
    QuizResponse,
    QuizQuestion,
)
from services.extraction import get_transcript, extract_pdf_text
from services.chunking import chunk_text
from services.embeddings import embed_chunks
from services.vector_store import (
    store_chunks, 
    delete_session_data,
    get_cached_answer
)
from services.generation import generate_flashcards, generate_quiz
from services.rag import stream_chat_response

app = FastAPI(
    title="AI Learning Assistant API",
    description="RAG-powered learning tool: process YouTube videos or PDFs into flashcards, quizzes, and chat.",
    version="1.0.0",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok"}


# ── Process YouTube Video ─────────────────────────────────────────────────────
@app.post("/process-video", response_model=ProcessVideoResponse)
async def process_video(data: ProcessVideoRequest):
    """
    Extract transcript from a YouTube video URL, chunk it, embed it,
    and store in Supabase under the given session_id.
    """
    await delete_session_data(data.session_id)
    transcript = get_transcript(data.url)
    chunks = chunk_text(transcript)
    if not chunks:
        raise HTTPException(status_code=422, detail="Transcript was too short to process.")

    embeddings = await embed_chunks(chunks)
    await store_chunks(data.session_id, chunks, embeddings, source_type="youtube")

    return ProcessVideoResponse(
        session_id=data.session_id,
        chunk_count=len(chunks),
    )


# ── Process PDF ───────────────────────────────────────────────────────────────
@app.post("/process-pdf", response_model=ProcessPdfResponse)
async def process_pdf(data: ProcessPdfRequest):
    """
    Accept a base64 PDF upload, extract text, chunk, embed, and store in Supabase.
    """
    import base64
    
    b64_string = data.base64_data
    if "," in b64_string:
        b64_string = b64_string.split(",", 1)[1]

    try:
        file_bytes = base64.b64decode(b64_string)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 encoding for PDF.")

    if len(file_bytes) > 15 * 1024 * 1024:  # 15 MB limit
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 15 MB.")

    await delete_session_data(data.session_id)
    text = extract_pdf_text(file_bytes)
    
    chunks = chunk_text(text)
    if not chunks:
        raise HTTPException(status_code=422, detail="Could not extract enough text from the PDF.")

    embeddings = await embed_chunks(chunks)
    await store_chunks(data.session_id, chunks, embeddings, source_type="pdf")

    return ProcessPdfResponse(
        session_id=data.session_id,
        chunk_count=len(chunks),
    )


# ── Generate Flashcards ───────────────────────────────────────────────────────
@app.post("/generate-flashcards", response_model=FlashcardsResponse)
async def generate_flashcards_endpoint(data: FlashcardRequest):
    """Generate flashcards from the processed document for this session."""
    try:
        cards = await generate_flashcards(data.session_id, data.count)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return FlashcardsResponse(flashcards=[Flashcard(**c) for c in cards])


# ── Generate Quiz ─────────────────────────────────────────────────────────────
@app.post("/generate-quiz", response_model=QuizResponse)
async def generate_quiz_endpoint(data: QuizRequest):
    """
    Generate MCQ questions. Correct answers are cached server-side and
    NOT included in this response — submit via /check-answer instead.
    """
    try:
        questions = await generate_quiz(data.session_id, data.count)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return QuizResponse(questions=[QuizQuestion(**q) for q in questions])


# ── Check Answer ──────────────────────────────────────────────────────────────
@app.post("/check-answer", response_model=CheckAnswerResponse)
async def check_answer(data: CheckAnswerRequest):
    """Validate a quiz answer server-side and return the correct index + explanation."""
    result = get_cached_answer(data.session_id, data.question_index)
    if result is None:
        raise HTTPException(
            status_code=404,
            detail="No quiz found for this session. Generate a quiz first.",
        )
    correct_index, explanation = result
    return CheckAnswerResponse(
        correct=(data.selected_index == correct_index),
        correct_index=correct_index,
        explanation=explanation,
    )


# ── Chat (Streaming SSE) ──────────────────────────────────────────────────────
@app.post("/chat")
async def chat(data: ChatRequest):
    """
    RAG-powered streaming chat. Retrieves relevant chunks from the session's
    document, injects them as context, and streams the response via SSE.
    """

    async def generate():
        try:
            async for token in stream_chat_response(
                message=data.message,
                session_id=data.session_id,
                history=data.history,
            ):
                yield f"data: {json.dumps({'token': token})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
