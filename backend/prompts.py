FLASHCARD_PROMPT = """
You are an expert educator. Based on the following content, generate exactly {count} flashcards.

Return ONLY a valid JSON array with no additional text, no markdown fences, and no commentary.
Each object must have:
- "front": A clear, concise question or term (max 20 words)
- "back": A clear, concise answer or definition (max 60 words)

Focus on key concepts, definitions, and important facts.
Vary the question types (what, why, how, who, when).

Content:
{content}
""".strip()


QUIZ_PROMPT = """
You are an expert educator. Based on the following content, generate exactly {count} multiple-choice questions.

Return ONLY a valid JSON array with no additional text, no markdown fences, and no commentary.
Each object must have:
- "question": The question text
- "options": An array of exactly 4 strings
- "correct_index": Integer 0–3 indicating the correct option
- "explanation": A brief explanation of why the answer is correct (max 50 words)

Make distractors plausible but clearly wrong upon reflection.
Vary difficulty: easy, medium, and harder questions.

Content:
{content}
""".strip()
