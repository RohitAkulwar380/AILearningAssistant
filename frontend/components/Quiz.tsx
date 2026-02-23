"use client";

import { useState, useRef } from "react";
import { QuizQuestion, checkAnswer } from "@/lib/api";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

interface Props {
    questions: QuizQuestion[];
    sessionId: string;
}

interface AnswerResult {
    correct: boolean;
    correct_index: number;
    explanation: string;
}

export default function Quiz({ questions, sessionId }: Props) {
    const [selected, setSelected] = useState<(number | null)[]>(Array(questions.length).fill(null));
    const [results, setResults] = useState<(AnswerResult | null)[]>(Array(questions.length).fill(null));
    const [checking, setChecking] = useState<number | null>(null);
    const [current, setCurrent] = useState(0);

    const containerRef = useRef<HTMLDivElement>(null);
    const { contextSafe } = useGSAP({ scope: containerRef });

    const score = results.filter((r) => r?.correct).length;
    const allAnswered = results.every((r) => r !== null);

    // Entrance staggered animation
    // Entrance staggered animation
    useGSAP(() => {
        gsap.fromTo([".q-block", ".opt-row", ".explanation"],
            { opacity: 0, x: -8 },
            { opacity: 1, x: 0, stagger: 0.055, duration: 0.28, ease: "power2.out" }
        );
    }, { dependencies: [current], scope: containerRef });

    // Score badge entrance
    useGSAP(() => {
        if (allAnswered) {
            gsap.fromTo(".quiz-results-view",
                { opacity: 0, scale: 0.95, y: 10 },
                { opacity: 1, scale: 1, y: 0, duration: 0.6, ease: "back.out(1.5)" }
            );

            gsap.fromTo(".score-circle",
                { scale: 0, opacity: 0 },
                { scale: 1, opacity: 1, duration: 0.8, delay: 0.2, ease: "back.out(2)" }
            );
        }
    }, { dependencies: [allAnswered], scope: containerRef });

    const handleSelect = contextSafe((optionIdx: number) => {
        if (results[current] !== null) return;
        const updated = [...selected];
        updated[current] = optionIdx;
        setSelected(updated);

        // Pop effect
        gsap.fromTo(`.opt-row:nth-child(${optionIdx + 1})`,
            { scale: 0.985 },
            { scale: 1, duration: 0.25, ease: "back.out(3)" }
        );
    });

    const handleSubmit = async () => {
        const sel = selected[current];
        if (sel === null || results[current] !== null) return;
        setChecking(current);
        try {
            const result = await checkAnswer(sessionId, current, sel);
            const updated = [...results];
            updated[current] = result;
            setResults(updated);

            // Conditional feedback
            if (!result.correct) {
                gsap.to(`.opt-row:nth-child(${sel + 1})`, {
                    keyframes: { x: [0, -5, 5, -5, 5, 0] },
                    duration: 0.4,
                    ease: "power2.out"
                });
            }
        } catch {
            // allow retry on network fail
        } finally {
            setChecking(null);
        }
    };

    const handleNext = contextSafe(() => {
        if (current >= questions.length - 1) return;

        gsap.to(['.q-block', '.opt-row', '.explanation'], {
            opacity: 0,
            x: -14,
            duration: 0.18,
            ease: "power2.in",
            onComplete: () => {
                setCurrent((c) => c + 1);
            }
        });
    });

    const handleRetake = contextSafe(() => {
        gsap.to(".quiz-results-view", {
            opacity: 0,
            scale: 0.95,
            y: 10,
            duration: 0.4,
            ease: "power2.in",
            onComplete: () => {
                setSelected(Array(questions.length).fill(null));
                setResults(Array(questions.length).fill(null));
                setCurrent(0);
                gsap.fromTo(".q-block, .opt-row",
                    { opacity: 0, y: 10 },
                    { opacity: 1, y: 0, duration: 0.4, stagger: 0.05 }
                );
            }
        });
    });

    const q = questions[current];
    const res = results[current];
    const optionLabel = ["A", "B", "C", "D"];

    return (
        <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Meta */}
            <div className="quiz-meta">
                <span className="quiz-counter">
                    Question {String(current + 1).padStart(2, '0')} of {String(questions.length).padStart(2, '0')}
                </span>
                {allAnswered && (
                    <span className={`score-badge ${score >= questions.length * 0.7 ? 'good' : 'ok'}`} style={{ display: 'inline-block' }}>
                        {score} / {questions.length}
                    </span>
                )}
            </div>

            {/* Segments (Progress) */}
            <div className="seg-track">
                {questions.map((_, i) => (
                    <div
                        key={i}
                        className={`seg ${i === current ? 'active' : ''} ${results[i] ? (results[i]?.correct ? 'correct' : 'wrong') : ''}`}
                        onClick={() => setCurrent(i)}
                    />
                ))}
            </div>

            {/* Question / Results View */}
            {allAnswered ? (
                <div className="quiz-results-view" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '20px' }}>
                    <div className={`score-circle ${score >= questions.length * 0.7 ? 'good' : 'ok'}`} style={{
                        width: '100px',
                        height: '100px',
                        borderRadius: '50%',
                        border: '2px solid',
                        borderColor: score >= questions.length * 0.7 ? 'var(--green)' : 'var(--accent)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '24px',
                        background: score >= questions.length * 0.7 ? 'var(--green-dim)' : 'var(--accent-dim)'
                    }}>
                        <span style={{ fontSize: '32px', fontWeight: 700, lineHeight: 1 }}>{score}</span>
                        <span style={{ fontSize: '12px', opacity: 0.6, marginTop: '4px' }}>out of {questions.length}</span>
                    </div>

                    <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '24px', marginBottom: '8px' }}>
                        {score === questions.length ? "Perfect Score!" : score >= questions.length * 0.7 ? "Great Job!" : "Keep Practicing!"}
                    </h3>
                    <p style={{ color: 'var(--text-dim)', fontSize: '14px', maxWidth: '280px', lineHeight: 1.6 }}>
                        {score === questions.length
                            ? "You've mastered this topic! You're ready to move on."
                            : "You've got a good handle on the basics. A bit more review and you'll be an expert."}
                    </p>
                </div>
            ) : (
                <>
                    <div className="q-block">
                        <span className="q-num">Question {String(current + 1).padStart(2, '0')}</span>
                        <p className="q-text">{q.question}</p>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {q.options.map((opt, i) => {
                            const isSelected = selected[current] === i;
                            const isCorrect = res?.correct_index === i;
                            const isWrong = res !== null && isSelected && !res.correct;

                            let rowClass = "opt-row";
                            if (res !== null) {
                                if (isCorrect) rowClass += " correct-ans";
                                else if (isWrong) rowClass += " wrong-ans";
                                else if (isSelected) rowClass += " selected";
                            } else if (isSelected) {
                                rowClass += " selected";
                            }

                            return (
                                <button
                                    key={i}
                                    className={rowClass}
                                    onClick={() => handleSelect(i)}
                                    disabled={res !== null}
                                >
                                    <div className="opt-key">{optionLabel[i]}</div>
                                    <div className="opt-text">{opt}</div>
                                </button>
                            );
                        })}
                    </div>

                    {res && (
                        <div className={`explanation show ${res.correct ? 'correct-ex' : 'wrong-ex'}`}>
                            <strong>{res.correct ? "Correct" : "Incorrect"}</strong>
                            {res.correct ? res.explanation : `The correct answer was: "${q.options[res.correct_index]}"`}
                        </div>
                    )}
                </>
            )}

            {/* Action */}
            <div style={{ marginTop: 'auto', paddingTop: '16px' }}>
                {allAnswered ? (
                    <button
                        className="submit-btn"
                        style={{ opacity: 1, borderColor: 'var(--accent)', color: 'var(--text)' }}
                        onClick={handleRetake}
                    >
                        Retake Quiz
                    </button>
                ) : res === null ? (
                    <button
                        className="submit-btn"
                        onClick={handleSubmit}
                        disabled={selected[current] === null || checking === current}
                    >
                        {checking === current ? "Checking…" : "Submit Answer"}
                    </button>
                ) : current < questions.length - 1 ? (
                    <button
                        className="submit-btn"
                        style={{ borderColor: 'var(--accent)', color: 'var(--text)' }}
                        onClick={handleNext}
                    >
                        Next Question
                    </button>
                ) : (
                    <button
                        className="submit-btn"
                        style={{ borderColor: 'var(--accent)', color: 'var(--text)' }}
                        disabled // This button is a placeholder as handleNext logic covers the flow
                    >
                        Reviewing...
                    </button>
                )}
            </div>
        </div>
    );
}