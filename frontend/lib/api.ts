const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Types ──────────────────────────────────────────────────────────────────

export interface Flashcard {
    front: string;
    back: string;
}

export interface QuizQuestion {
    question: string;
    options: string[];
    explanation: string;
}

export interface ChatMessage {
    role: "user" | "assistant";
    content: string;
}

export interface CheckAnswerResult {
    correct: boolean;
    correct_index: number;
    explanation: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, options);
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.detail || `Request failed: ${res.status}`);
    }
    return data as T;
}

// ── API Functions ──────────────────────────────────────────────────────────

export async function processVideo(
    url: string,
    sessionId: string
): Promise<{ session_id: string; chunk_count: number }> {
    return apiFetch("/process-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, session_id: sessionId }),
    });
}

export async function processPdf(
    file: File,
    sessionId: string
): Promise<{ session_id: string; chunk_count: number }> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const base64_data = reader.result as string;
                const data = await apiFetch<{ session_id: string; chunk_count: number }>("/process-pdf", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        session_id: sessionId,
                        filename: file.name,
                        base64_data,
                    }),
                });
                resolve(data);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

export async function generateFlashcards(
    sessionId: string,
    count = 10
): Promise<Flashcard[]> {
    const data = await apiFetch<{ flashcards: Flashcard[] }>("/generate-flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, count }),
    });
    return data.flashcards;
}

export async function generateQuiz(
    sessionId: string,
    count = 5
): Promise<QuizQuestion[]> {
    const data = await apiFetch<{ questions: QuizQuestion[] }>("/generate-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, count }),
    });
    return data.questions;
}

export async function checkAnswer(
    sessionId: string,
    questionIndex: number,
    selectedIndex: number
): Promise<CheckAnswerResult> {
    return apiFetch("/check-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            session_id: sessionId,
            question_index: questionIndex,
            selected_index: selectedIndex,
        }),
    });
}

/**
 * Streams chat tokens from the backend SSE endpoint.
 * Calls onToken for each streamed token, onDone when complete.
 */
export async function streamChat(
    message: string,
    sessionId: string,
    history: ChatMessage[],
    onToken: (token: string) => void,
    onDone: () => void,
    onError: (err: string) => void
): Promise<void> {
    const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, session_id: sessionId, history }),
    });

    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        onError(data.detail || `Chat request failed: ${res.status}`);
        return;
    }

    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) { onError("No response body"); return; }

    let buffer = "";
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6);
            if (raw === "[DONE]") { onDone(); return; }
            try {
                const parsed = JSON.parse(raw);
                if (parsed.error) { onError(parsed.error); return; }
                if (parsed.token) onToken(parsed.token);
            } catch {
                // ignore parse errors for partial chunks
            }
        }
    }
    onDone();
}
