# AI Learning Assistant — Internship Project Guide

> A comprehensive reference covering architecture, implementation strategy, pitfalls, shortcomings, and best practices.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Recommended Architecture](#2-recommended-architecture)
3. [How to Build It — Step by Step](#3-how-to-build-it--step-by-step)
4. [RAG Implementation Deep Dive](#4-rag-implementation-deep-dive)
5. [Flashcard & Quiz Generation](#5-flashcard--quiz-generation)
6. [Frontend Guide](#6-frontend-guide)
7. [What Can Go Wrong](#7-what-can-go-wrong)
8. [What NOT to Do](#8-what-not-to-do)
9. [Known Shortcomings & Limitations](#9-known-shortcomings--limitations)
10. [Best Practices](#10-best-practices)
11. [Project Structure](#11-project-structure)
12. [Environment Variables](#12-environment-variables)
13. [Evaluation Checklist](#13-evaluation-checklist)

---

## 1. Project Overview

The goal is to build a full-stack AI-powered learning tool that:

- Accepts a **YouTube URL** or a **PDF upload**
- Extracts and processes the content
- Generates **flashcards** and **multiple-choice quizzes**
- Provides a **RAG-based chat interface** where users can ask questions grounded in the uploaded content
- Maintains **chat history** throughout the session

The project is evaluated heavily on **RAG quality (20%)**, **AI integration (20%)**, and **architecture (20%)** — totalling 60% of the score before you touch the UI.

---

## 2. Recommended Architecture

```
┌─────────────────────────────────┐
│         Next.js Frontend        │
│  (App Router, TailwindCSS)      │
│                                 │
│  - Upload / URL input form      │
│  - Flashcard display            │
│  - Quiz component               │
│  - Streaming chat window        │
└────────────┬────────────────────┘
             │ HTTP / SSE
┌────────────▼────────────────────┐
│        FastAPI Backend          │
│                                 │
│  POST /process-video            │
│  POST /process-pdf              │
│  POST /generate-flashcards      │
│  POST /generate-quiz            │
│  POST /chat                     │
└────────────┬────────────────────┘
             │
     ┌───────┴────────┐
     │                │
┌────▼─────┐   ┌──────▼──────────┐
│ Postgres │   │  pgvector /      │
│(Supabase)│   │  Pinecone        │
│          │   │  (embeddings +   │
│ sessions │   │   chunks)        │
│ history  │   └─────────────────┘
└──────────┘
             │
┌────────────▼────────────────────┐
│     OpenRouter / Gemini API         │
│  - Embeddings                   │
│  - Chat completions (streaming) │
│  - Flashcard/Quiz generation    │
└─────────────────────────────────┘
```

### Why This Stack

- **Next.js App Router** gives you React Server Components, streaming support via `ReadableStream`, and easy Vercel deployment.
- **FastAPI** is async-native, well-suited for streaming LLM responses, and has excellent Pydantic validation.
- **Supabase** gives you Postgres + pgvector in one place, eliminating the need to manage a separate vector DB for a project of this scope.
- **text-embedding-3-small** is cheap, fast, and performs well for semantic search — a good default.

---

## 3. How to Build It — Step by Step

Build in this order. Each layer depends on the one before it.

### Step 1 — Backend Skeleton

Set up FastAPI with the five required endpoints returning stub responses. This gives you a working API contract to build against from day one.

```bash
pip install fastapi uvicorn python-multipart pydantic OpenRouter supabase youtube-transcript-api pypdf2 langchain tiktoken
```

```python
# main.py
from fastapi import FastAPI
app = FastAPI()

@app.post("/process-video")
async def process_video(data: dict): ...

@app.post("/process-pdf")
async def process_pdf(file: UploadFile): ...

@app.post("/generate-flashcards")
async def generate_flashcards(data: dict): ...

@app.post("/generate-quiz")
async def generate_quiz(data: dict): ...

@app.post("/chat")
async def chat(data: dict): ...
```

### Step 2 — Content Extraction

**YouTube:**
```python
from youtube_transcript_api import YouTubeTranscriptApi
import re

def extract_video_id(url: str) -> str:
    pattern = r"(?:v=|youtu\.be/)([A-Za-z0-9_-]{11})"
    match = re.search(pattern, url)
    if not match:
        raise ValueError("Invalid YouTube URL")
    return match.group(1)

def get_transcript(url: str) -> str:
    video_id = extract_video_id(url)
    transcript = YouTubeTranscriptApi.get_transcript(video_id)
    return " ".join([entry["text"] for entry in transcript])
```

**PDF:**
```python
import pypdf

def extract_pdf_text(file_bytes: bytes) -> str:
    reader = pypdf.PdfReader(io.BytesIO(file_bytes))
    return "\n".join(page.extract_text() for page in reader.pages if page.extract_text())
```

### Step 3 — Chunking & Embedding

This is arguably the most important step. Poor chunking = poor RAG.

```python
from langchain.text_splitter import RecursiveCharacterTextSplitter
from OpenRouter import OpenRouter

client = OpenRouter()

def chunk_text(text: str) -> list[str]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=800,
        chunk_overlap=150,
        separators=["\n\n", "\n", ". ", " ", ""]
    )
    return splitter.split_text(text)

def embed_chunks(chunks: list[str]) -> list[list[float]]:
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=chunks
    )
    return [item.embedding for item in response.data]
```

Then store each chunk + embedding in Supabase pgvector:

```sql
-- Run once in Supabase SQL editor
create extension if not exists vector;

create table documents (
  id uuid primary key default gen_random_uuid(),
  session_id text,
  content text,
  embedding vector(1536),
  created_at timestamptz default now()
);

create index on documents using ivfflat (embedding vector_cosine_ops);
```

### Step 4 — Retrieval (RAG Query)

```python
def retrieve_relevant_chunks(query: str, session_id: str, top_k: int = 5) -> list[str]:
    query_embedding = embed_chunks([query])[0]
    
    result = supabase.rpc("match_documents", {
        "query_embedding": query_embedding,
        "match_threshold": 0.75,
        "match_count": top_k,
        "session_id": session_id
    }).execute()
    
    return [row["content"] for row in result.data]
```

Create the matching function in Supabase:

```sql
create or replace function match_documents(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  session_id text
)
returns table (content text, similarity float)
language sql stable
as $$
  select content, 1 - (embedding <=> query_embedding) as similarity
  from documents
  where session_id = match_documents.session_id
    and 1 - (embedding <=> query_embedding) > match_threshold
  order by embedding <=> query_embedding
  limit match_count;
$$;
```

### Step 5 — Streaming Chat Endpoint

```python
from fastapi.responses import StreamingResponse

@app.post("/chat")
async def chat(data: ChatRequest):
    chunks = retrieve_relevant_chunks(data.message, data.session_id)
    context = "\n\n".join(chunks)
    
    async def generate():
        stream = client.chat.completions.create(
            model="gpt-4.1",
            messages=[
                {"role": "system", "content": f"""You are a helpful learning assistant. 
                Answer questions based ONLY on the following context. 
                If the answer is not in the context, say so clearly.
                
                Context:
                {context}"""},
                *data.history,
                {"role": "user", "content": data.message}
            ],
            stream=True
        )
        for chunk in stream:
            if chunk.choices[0].delta.content:
                yield f"data: {chunk.choices[0].delta.content}\n\n"
        yield "data: [DONE]\n\n"
    
    return StreamingResponse(generate(), media_type="text/event-stream")
```

### Step 6 — Flashcard & Quiz Generation

See [Section 5](#5-flashcard--quiz-generation) for detailed prompt engineering.

### Step 7 — Frontend

See [Section 6](#6-frontend-guide).

### Step 8 — Deploy

- Backend: Railway, Render, or Fly.io (all support FastAPI with minimal config)
- Frontend: Vercel (push to GitHub, connect repo, done)

---

## 4. RAG Implementation Deep Dive

RAG is worth 20% of your grade and is the trickiest part to get right.

### How It Works

1. At ingestion: chunk text → embed each chunk → store in vector DB with a `session_id`
2. At query time: embed the user's question → cosine similarity search → retrieve top-K chunks → inject into prompt → stream response

### Chunking Strategy

| Parameter | Recommended Value | Why |
|-----------|------------------|-----|
| `chunk_size` | 600–900 tokens | Enough context per chunk without bloating the prompt |
| `chunk_overlap` | 100–200 tokens | Prevents losing meaning at chunk boundaries |
| Splitter | `RecursiveCharacterTextSplitter` | Respects natural text boundaries (paragraphs → sentences → words) |

**Do not** use a fixed character split. It will cut sentences mid-word and destroy semantic coherence.

### Context Window Budget

When building your RAG prompt, be deliberate about how many chunks you inject. A rough budget for `gpt-4.1`:

```
System prompt:     ~300 tokens
Context chunks:    ~2000 tokens (5 chunks × ~400 tokens each)
Chat history:      ~1000 tokens
User question:     ~100 tokens
Response buffer:   ~1000 tokens
─────────────────────────────
Total:             ~4400 tokens (well within limits)
```

### Session Isolation

Every processed document should be assigned a unique `session_id` (UUID). All vector queries must filter by `session_id` so users don't get content from other people's documents. This is critical for correctness and privacy.

### Improving Retrieval Quality

- **Hybrid search**: combine keyword (BM25) + semantic similarity. pgvector alone is pure semantic; add a `tsvector` column for keyword fallback.
- **Reranking**: after top-K retrieval, use a cross-encoder or `Cohere Rerank` to reorder results before injecting into the prompt.
- **Query expansion**: rephrase the user's question before embedding it (e.g., "What is photosynthesis?" → also embed "How do plants make food?").

---

## 5. Flashcard & Quiz Generation

### Flashcard Prompt

```python
FLASHCARD_PROMPT = """
You are an expert educator. Based on the following content, generate exactly {count} flashcards.

Return ONLY a valid JSON array with no additional text. Each object must have:
- "front": A clear, concise question or term (max 20 words)
- "back": A clear, concise answer or definition (max 60 words)

Focus on key concepts, definitions, and important facts.
Vary the question types (what, why, how, who, when).

Content:
{content}
"""
```

### Quiz Prompt

```python
QUIZ_PROMPT = """
You are an expert educator. Based on the following content, generate exactly {count} multiple-choice questions.

Return ONLY a valid JSON array. Each object must have:
- "question": The question text
- "options": An array of exactly 4 strings (A, B, C, D)
- "correct_index": Integer 0–3 indicating the correct option
- "explanation": A brief explanation of why the answer is correct (max 50 words)

Make distractors plausible but clearly wrong upon reflection.

Content:
{content}
"""
```

### Parsing AI JSON Responses Safely

AI models sometimes return JSON wrapped in markdown code fences. Always strip before parsing:

```python
import json, re

def parse_json_response(text: str) -> list:
    # Strip markdown fences if present
    text = re.sub(r"```(?:json)?\n?", "", text).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Fallback: try to extract array from response
        match = re.search(r"\[.*\]", text, re.DOTALL)
        if match:
            return json.loads(match.group())
        raise ValueError("Could not parse AI response as JSON")
```

### Quiz Auto-Evaluation

Store the `correct_index` server-side (or encrypted). Never send it to the frontend until the user submits their answer — otherwise it's visible in the network tab.

---

## 6. Frontend Guide

### Recommended Page Layout

```
┌─────────────────────────────────────────────────────┐
│                    Header / Nav                     │
├────────────────────┬────────────────────────────────┤
│                    │                                │
│  Input Panel       │   Output Panel                 │
│  ─────────────     │   ─────────────                │
│  [ YouTube URL ]   │   [ Flashcards tab ]           │
│  [ Upload PDF  ]   │   [ Quiz tab       ]           │
│  [ Process btn ]   │   [ Chat tab       ]           │
│                    │                                │
└────────────────────┴────────────────────────────────┘
```

### Streaming Chat in Next.js

```tsx
// Use the Fetch API with ReadableStream for SSE
const sendMessage = async (message: string) => {
  const response = await fetch("/api/chat", {
    method: "POST",
    body: JSON.stringify({ message, session_id, history }),
    headers: { "Content-Type": "application/json" }
  });

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader!.read();
    if (done) break;
    
    buffer += decoder.decode(value);
    const lines = buffer.split("\n\n");
    buffer = lines.pop() || "";
    
    for (const line of lines) {
      if (line.startsWith("data: ") && line !== "data: [DONE]") {
        const token = line.replace("data: ", "");
        setCurrentResponse(prev => prev + token);
      }
    }
  }
};
```

### Key UI States to Handle

- Loading skeleton while content is being processed
- Empty state before any document is uploaded
- Partial streaming text with a blinking cursor
- Error state with a user-friendly message (not a raw stack trace)
- Disabled inputs during processing to prevent duplicate submissions

---

## 7. What Can Go Wrong

### 7.1 YouTube Transcript Unavailable

**Problem:** Not all YouTube videos have transcripts. Auto-generated ones may be missing or in another language.

**Fix:**
```python
try:
    transcript = YouTubeTranscriptApi.get_transcript(video_id, languages=["en"])
except TranscriptsDisabled:
    raise HTTPException(400, "This video has no available transcript.")
except NoTranscriptFound:
    # Try getting any available language
    transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
    transcript = transcript_list.find_generated_transcript(["en", "en-US"]).fetch()
```

### 7.2 PDF Text Extraction Failure

**Problem:** Scanned PDFs are images, not text. `pypdf` will return empty strings.

**Fix:** Detect empty extraction and return a clear error. If you want to go further, integrate `pytesseract` for OCR — but this significantly increases complexity and is not required for the assignment.

### 7.3 AI Returns Malformed JSON

**Problem:** Even with explicit prompting, GPT occasionally wraps JSON in markdown, adds commentary, or truncates the array.

**Fix:** Always use the `parse_json_response` function from Section 5. Additionally, use `response_format={"type": "json_object"}` with newer OpenRouter models to enforce JSON output.

### 7.4 Embedding API Rate Limits

**Problem:** Sending 200 chunks to the embedding API in one shot can hit rate limits.

**Fix:** Batch your embedding calls:
```python
def embed_chunks_batched(chunks: list[str], batch_size: int = 100) -> list[list[float]]:
    all_embeddings = []
    for i in range(0, len(chunks), batch_size):
        batch = chunks[i:i + batch_size]
        response = client.embeddings.create(model="text-embedding-3-small", input=batch)
        all_embeddings.extend([item.embedding for item in response.data])
    return all_embeddings
```

### 7.5 CORS Errors

**Problem:** Frontend on `localhost:3000` calling backend on `localhost:8000` will be blocked by the browser.

**Fix:**
```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://your-vercel-app.vercel.app"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 7.6 Large PDF Exceeds Context Limit

**Problem:** A 100-page PDF may generate 500+ chunks. Injecting all of them into a single prompt will exceed the model's context window.

**Fix:** This is exactly what RAG solves — only retrieve the top-K relevant chunks per query. For flashcard/quiz generation, use only the first N chunks or a summarisation step if the document is very long.

### 7.7 Supabase pgvector Index Slowdown

**Problem:** Without an index, vector similarity search does a full table scan. Fine for development, unacceptably slow in production.

**Fix:** Always create the `ivfflat` index (shown in Step 4). Rebuild it if you insert a lot of new rows.

### 7.8 Streaming Breaks on Vercel (Serverless)

**Problem:** Vercel's serverless functions have a 10-second timeout by default on the free plan. Long LLM responses will be cut off.

**Fix:** Add this to your Next.js API route:
```typescript
export const maxDuration = 60; // seconds (requires Pro plan for values > 10)
```
Or proxy the stream through your FastAPI backend instead of calling OpenRouter directly from Next.js.

---

## 8. What NOT to Do

### ❌ Don't Store API Keys in Code

Never hardcode `OPENROUTER_API_KEY` or database credentials. Use `.env` files locally and environment variable settings on your deployment platform.

### ❌ Don't Skip Session Isolation

If every user's embeddings go into the same table without a `session_id` filter, every chat will retrieve content from every other user's documents. This is a fundamental correctness bug.

### ❌ Don't Send the Full Document as a Chat Prompt

A common beginner mistake is to skip RAG entirely and just paste the whole document into every chat message. This works for very small documents, but fails as soon as content exceeds the context window, is extremely expensive, and is precisely what the assignment is testing you on.

### ❌ Don't Embed the Entire Document as One Vector

One embedding for a 50-page PDF is meaningless. The whole point of chunking is to create granular, retrievable pieces of information.

### ❌ Don't Use `chunk_size=100` (Too Small)

Tiny chunks lose context. "The mitochondria is" as a standalone chunk is not useful for retrieval. Aim for at least 400–800 tokens per chunk.

### ❌ Don't Ignore Loading and Error States in the UI

A blank screen or unresponsive button while processing is happening will cost you UI/UX marks. Always show the user what's happening.

### ❌ Don't Fetch the Correct Answer to the Frontend

The quiz `correct_index` must not be included in the initial fetch response. Validate answers server-side via a `/check-answer` endpoint, or at minimum, send answers only after the user submits.

### ❌ Don't Use `time.sleep()` for Rate Limiting

Use `asyncio.sleep()` in async FastAPI code. `time.sleep()` blocks the entire event loop.

### ❌ Don't Regenerate Embeddings on Every Chat Message

Embeddings are generated once at ingestion and stored. Querying the vector DB is cheap. Never re-embed the entire document per request.

### ❌ Don't Forget to Handle Duplicate Submissions

If the user clicks "Process" twice, you'll end up with duplicate embeddings for the same document, which will degrade retrieval quality. Use a loading state and disable the button after the first click.

---

## 9. Known Shortcomings & Limitations

Understanding the limitations of your own system shows maturity. Document these in your README.

### Inherent Limitations

**Auto-generated YouTube transcripts are noisy.** They lack punctuation, have incorrect word boundaries for technical terms, and sometimes mix up homophones. This directly degrades chunking and retrieval quality.

**RAG cannot answer questions that require synthesising the whole document.** If a user asks "What are the three main themes of this video?", RAG will retrieve specific chunks but may miss the big picture. Consider adding a summarisation endpoint that processes the full text before chunking.

**Flashcards are only as good as the content.** If the source material is poorly structured (e.g., a rambling video with no clear topics), the flashcards will reflect that.

**pgvector's ivfflat index is approximate.** It trades some recall for speed. For small datasets (< 10,000 chunks), this doesn't matter, but it's worth knowing.

**No authentication.** The current design shares a session model but has no user accounts. Session IDs are ephemeral and lost on page refresh. This is acceptable for an MVP/internship demo.

**PDF table extraction is unreliable.** `pypdf` extracts text in reading order but does not understand tabular structure. Data in tables may be jumbled.

**Context window limits on very long sources.** For flashcard/quiz generation from a 200-page PDF, you cannot send all text to the model at once. You'll need either summarisation or to generate cards in batches per section.

### Trade-offs Made

| Decision | Trade-off |
|----------|-----------|
| pgvector over Pinecone | Simpler setup, but less scalable at high volume |
| text-embedding-3-small | Cheaper and faster, but slightly lower quality than large |
| Session-based state | No persistence across page reloads |
| No OCR | Fast and simple, but excludes scanned PDFs |

---

## 10. Best Practices

### Code & Architecture

- **Separate concerns clearly.** Keep extraction, chunking, embedding, and retrieval in separate modules — not one giant function.
- **Use Pydantic models** for all request/response bodies in FastAPI. This gives you automatic validation and clear API contracts.
- **Type-hint everything.** It makes the code self-documenting and catches bugs early.
- **Write at least basic unit tests** for your chunking, JSON parsing, and video ID extraction functions. These are deterministic and easy to test.

### AI Integration

- **Always validate AI output structure** before returning it. Never assume the model returned valid JSON.
- **Use temperature=0** for structured outputs (flashcards, quiz JSON). Use temperature=0.7 for chat responses to make them feel more natural.
- **Log token usage** from the API response. It helps you debug cost and context issues.
- **Version your prompts.** Store prompt templates as constants, not inline strings. This makes iteration easier.

### Vector Database

- **Index your vectors** before demo day. An un-indexed table with a few hundred rows is fast enough locally but looks bad in a live demo.
- **Store chunk metadata** alongside embeddings — at minimum, the source type (pdf/youtube), the original position in the document, and a timestamp. This makes debugging retrieval quality much easier.
- **Test your similarity threshold.** A `match_threshold` of 0.75 is a good starting point, but you should test it against your actual data and lower it if you're getting no results.

### Error Handling

- **Return meaningful HTTP status codes.** `400` for bad input (invalid URL, empty PDF), `422` for validation errors, `500` for unexpected failures.
- **Never expose raw Python stack traces to the frontend.** Catch exceptions and return a clean error message.
- **Add a timeout** on your YouTube and OpenRouter API calls so a single slow request doesn't hang the server indefinitely.

### Security

- **Validate file type on upload.** Check the MIME type, not just the extension. Users can rename any file to `.pdf`.
- **Limit file size** on the upload endpoint (e.g., 10MB max).
- **Sanitise the YouTube URL** before passing it to the transcript API.

### Performance

- **Process documents asynchronously.** Return a `job_id` immediately and let the frontend poll for completion, rather than blocking the HTTP connection for 30+ seconds.
- **Cache embeddings.** If the same YouTube URL is processed twice, don't re-embed it.

---

## 11. Project Structure

```
ai-learning-assistant/
├── backend/
│   ├── main.py                  # FastAPI app, route definitions
│   ├── models.py                # Pydantic request/response models
│   ├── config.py                # Settings from env vars
│   ├── services/
│   │   ├── extraction.py        # YouTube + PDF text extraction
│   │   ├── chunking.py          # Text splitting logic
│   │   ├── embeddings.py        # OpenRouter embedding calls
│   │   ├── vector_store.py      # Supabase pgvector operations
│   │   ├── generation.py        # Flashcard + quiz generation
│   │   └── rag.py               # Retrieval + chat logic
│   ├── prompts.py               # All prompt templates as constants
│   ├── utils.py                 # JSON parsing helpers, validators
│   └── requirements.txt
│
├── frontend/
│   ├── app/
│   │   ├── page.tsx             # Main page
│   │   ├── layout.tsx
│   │   └── api/
│   │       └── chat/route.ts    # Proxy for streaming (optional)
│   ├── components/
│   │   ├── InputPanel.tsx       # URL/PDF upload form
│   │   ├── FlashcardDeck.tsx    # Flashcard flip animation
│   │   ├── Quiz.tsx             # MCQ with evaluation
│   │   └── ChatWindow.tsx       # Streaming chat UI
│   ├── lib/
│   │   └── api.ts               # Typed API client functions
│   ├── tailwind.config.ts
│   └── package.json
│
├── .env.example
├── README.md
└── docker-compose.yml           # Optional: local dev with Postgres
```

---

## 12. Environment Variables

```bash
# .env (backend)
OPENROUTER_API_KEY=sk-...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-or-service-key
ALLOWED_ORIGINS=http://localhost:3000,https://your-app.vercel.app

# .env.local (frontend)
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## 13. Evaluation Checklist

Use this before submitting.

### Architecture & Code Structure (20%)
- [ ] Clear separation of concerns (extraction, embedding, retrieval, generation)
- [ ] Pydantic models for all endpoints
- [ ] No business logic in route handlers
- [ ] Meaningful variable and function names

### AI Integration Quality (20%)
- [ ] Structured prompts with clear output format instructions
- [ ] JSON response parsing with error handling fallback
- [ ] Correct model parameters (temperature, max_tokens)
- [ ] Token usage is not wasteful

### RAG Implementation (20%)
- [ ] Chunking with overlap
- [ ] Embeddings stored with session isolation
- [ ] Cosine similarity retrieval with threshold
- [ ] Retrieved context injected into system prompt
- [ ] Chat history maintained across turns
- [ ] Streaming response to frontend

### Flashcard & Quiz Logic (15%)
- [ ] 10–15 flashcards generated in valid JSON
- [ ] 5–10 quiz questions with 4 options each
- [ ] Correct answer index stored/validated server-side
- [ ] Questions vary in type and difficulty

### UI/UX & Responsiveness (10%)
- [ ] Works on mobile and desktop
- [ ] Loading states for all async operations
- [ ] Error states with user-friendly messages
- [ ] Chat feels real-time (streaming visible to user)

### Error Handling (10%)
- [ ] Invalid YouTube URL returns clear error
- [ ] Non-PDF upload is rejected
- [ ] Transcript unavailable is handled gracefully
- [ ] API failures return 4xx/5xx with a message (not a stack trace)

### Documentation (5%)
- [ ] README with setup instructions
- [ ] Architecture diagram or explanation
- [ ] `.env.example` with all required keys listed
- [ ] Demo video: shows URL input, PDF upload, flashcards, quiz, and chat

---

*Good luck. Focus your energy on RAG first — get retrieval working well and everything else becomes easier.*
