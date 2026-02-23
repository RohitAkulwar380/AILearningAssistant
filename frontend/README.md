# Study. — Frontend (Next.js)

This is the frontend for **Study.**, a high-fidelity AI Learning Assistant. It is built as a highly interactive, single-page application focused on motion design and pedagogical clarity.

## 🚀 Key Technologies

- **React 19 / Next.js 15**: Leveraging the App Router for modern component architecture.
- **GSAP (GreenSock Animation Platform)**: Handles all high-performance animations, including intro sequences, card flips, and interactive feedback.
- **Vanilla CSS**: Optimized with HSL color variables and CSS Grid for a robust, flexible design system.
- **OpenRouter / OpenAI**: Integrated for streaming RAG chat and structured content generation.

## 🏗️ UI Architecture

- **`app/page.tsx`**: The main orchestration layer. Handles global state (session, loading, theme) and layout grid.
- **`components/FlashcardDeck.tsx`**: A 3D-flipping flashcard interface with GSAP orchestration.
- **`components/Quiz.tsx`**: A multiple-choice testing platform with interactive scoring and results views.
- **`components/ChatWindow.tsx`**: A conversation interface supporting Server-Sent Events (SSE) for streaming AI responses.
- **`components/InputPanel.tsx`**: Unified sourcing interface for YouTube URLs and PDF uploads.

## 🎨 Motion Design

The frontend implements a sophisticated animation system:
1. **Intro Sequence**: A staggered entrance for all UI panels.
2. **Contextual Hooks**: `useGSAP` is used to trigger animations based on state changes (e.g., card navigation, quiz completion).
3. **Tactile Feedback**: Interactive elements use scale-pops and directional slides to provide physical intuition.

## 🛠️ Development

```bash
npm install
npm run dev
```

Ensure your backend is running at the address specified in `lib/api.ts` (default: `http://localhost:8000`).

---
*Focus: Performance, Tactile Feedback, Minimalist Aesthetics.*
