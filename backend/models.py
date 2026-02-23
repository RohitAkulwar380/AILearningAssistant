from pydantic import BaseModel, field_validator
from typing import Optional


# ── Request models ────────────────────────────────────────────────────────────

class ProcessVideoRequest(BaseModel):
    url: str
    session_id: str

    @field_validator("url")
    @classmethod
    def url_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("URL cannot be empty")
        return v.strip()


class ProcessPdfResponse(BaseModel):
    session_id: str
    chunk_count: int
    source_type: str = "pdf"


class ProcessVideoResponse(BaseModel):
    session_id: str
    chunk_count: int


class ProcessPdfRequest(BaseModel):
    session_id: str
    filename: str
    base64_data: str


class FlashcardRequest(BaseModel):
    session_id: str
    count: int = 10


class QuizRequest(BaseModel):
    session_id: str
    count: int = 5


class ChatMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    session_id: str
    history: list[ChatMessage] = []


class CheckAnswerRequest(BaseModel):
    session_id: str
    question_index: int
    selected_index: int


# ── Response models ───────────────────────────────────────────────────────────

class Flashcard(BaseModel):
    front: str
    back: str


class FlashcardsResponse(BaseModel):
    flashcards: list[Flashcard]


class QuizOption(BaseModel):
    text: str


class QuizQuestion(BaseModel):
    question: str
    options: list[str]
    explanation: str
    # correct_index is intentionally omitted from this model — served separately


class QuizResponse(BaseModel):
    questions: list[QuizQuestion]


class CheckAnswerResponse(BaseModel):
    correct: bool
    correct_index: int
    explanation: str
