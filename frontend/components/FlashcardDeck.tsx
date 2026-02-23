"use client";

import { useState, useRef } from "react";
import { Flashcard } from "@/lib/api";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

interface Props {
    flashcards: Flashcard[];
}

export default function FlashcardDeck({ flashcards }: Props) {
    const [index, setIndex] = useState(0);
    const [flipped, setFlipped] = useState(false);
    const [finished, setFinished] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const { contextSafe } = useGSAP({ scope: containerRef });

    if (!flashcards.length) return null;

    const card = flashcards[index];
    const progress = ((index + 1) / flashcards.length) * 100;

    const flipCard = contextSafe(() => {
        setFlipped(!flipped);
        gsap.fromTo(".card-scene",
            { scale: 0.985 },
            { scale: 1, duration: 0.4, ease: "back.out(2.5)" }
        );
    });

    const go = contextSafe((dir: number) => {
        if (dir > 0 && index === flashcards.length - 1) {
            // Finish animation
            gsap.to(".card-scene", {
                opacity: 0,
                scale: 0.9,
                y: -20,
                duration: 0.4,
                ease: "power2.in",
                onComplete: () => {
                    setFinished(true);
                }
            });
            return;
        }

        const xOffset = dir > 0 ? -20 : 20;
        const xEntrance = dir > 0 ? 20 : -20;

        gsap.to(".card-scene", {
            opacity: 0,
            x: xOffset,
            duration: 0.2,
            ease: "power2.in",
            onComplete: () => {
                setFlipped(false);
                setIndex((i) => (i + dir + flashcards.length) % flashcards.length);
                gsap.fromTo(".card-scene",
                    { opacity: 0, x: xEntrance },
                    { opacity: 1, x: 0, duration: 0.35, ease: "power3.out" }
                );
            }
        });
    });

    const restart = contextSafe(() => {
        gsap.to(".fc-finished-view", {
            opacity: 0,
            y: 10,
            duration: 0.3,
            onComplete: () => {
                setIndex(0);
                setFlipped(false);
                setFinished(false);
            }
        });
    });

    useGSAP(() => {
        if (finished) {
            gsap.fromTo(".fc-finished-view",
                { opacity: 0, y: 20 },
                { opacity: 1, y: 0, duration: 0.6, ease: "back.out(1.5)" }
            );
        } else {
            // Entrance animation for the card scene when NOT finished (includes restart)
            gsap.fromTo(".card-scene",
                { opacity: 0, y: 20, scale: 0.95 },
                { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: "back.out(1.7)" }
            );
        }
    }, { dependencies: [finished], scope: containerRef });

    return (
        <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header + Progress */}
            <div className="fc-header">
                <span className="fc-label">Flashcards</span>
                <span className="fc-counter">
                    {String(index + 1).padStart(2, '0')} / {String(flashcards.length).padStart(2, '0')}
                </span>
            </div>
            <div className="fc-progress">
                <div className="fc-progress-fill" style={{ width: `${progress}%` }}></div>
            </div>

            {/* Card Scene */}
            {finished ? (
                <div className="fc-finished-view" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                    <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'var(--green-dim)', border: '1px solid var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                    </div>
                    <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '24px', marginBottom: '12px' }}>Deck Completed</h3>
                    <p style={{ color: 'var(--text-dim)', fontSize: '14px', maxWidth: '300px', lineHeight: 1.6 }}>You've reviewed all {flashcards.length} cards in this set.</p>
                    <button
                        className="submit-btn"
                        style={{ marginTop: '32px', maxWidth: '200px', borderColor: 'var(--accent)', color: 'var(--text)' }}
                        onClick={restart}
                    >
                        Review Again
                    </button>
                </div>
            ) : (
                <div className="card-scene" onClick={flipCard}>
                    <div className={`card-inner ${flipped ? 'flipped' : ''}`}>
                        {/* Front */}
                        <div className="card-face card-front">
                            <span className="card-tag">Question</span>
                            <span className="card-flip-hint">{String(index + 1).padStart(2, '0')}</span>
                            <div className="card-q">{card.front}</div>
                            <span className="card-hint">Click to flip</span>
                        </div>

                        {/* Back */}
                        <div className="card-face card-back">
                            <span className="card-tag">Answer</span>
                            <span className="card-flip-hint">{String(index + 1).padStart(2, '0')}</span>
                            <div className="card-a">{card.back}</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Navigation */}
            <div className="card-nav mt-auto" style={{ opacity: finished ? 0.3 : 1, pointerEvents: finished ? 'none' : 'auto', transition: 'opacity 0.3s' }}>
                <button className="cnav-btn" onClick={() => go(-1)}>Prev</button>
                <button
                    className="cnav-btn flip"
                    onClick={(e) => { e.stopPropagation(); flipCard(); }}
                >
                    Flip
                </button>
                <button className="cnav-btn" onClick={() => go(1)}>
                    {index === flashcards.length - 1 ? 'Finish' : 'Next'}
                </button>
            </div>
        </div>
    );
}