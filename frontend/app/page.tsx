"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import InputPanel from "@/components/InputPanel";
import FlashcardDeck from "@/components/FlashcardDeck";
import Quiz from "@/components/Quiz";
import ChatWindow from "@/components/ChatWindow";
import { Flashcard, QuizQuestion, generateFlashcards, generateQuiz } from "@/lib/api";

type Tab = "flashcards" | "quiz" | "chat";
type TabStatus = "idle" | "loading" | "done" | "error";

const SESSION_ID = uuidv4();

export default function Home() {
  const [isReady, setIsReady] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("flashcards");
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [flashcardStatus, setFlashcardStatus] = useState<TabStatus>("idle");

  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [quizStatus, setQuizStatus] = useState<TabStatus>("idle");
  const [contentVersion, setContentVersion] = useState(0);

  const [tabError, setTabError] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const hasIntroPlayed = useRef(false);

  // Apply theme safely without overwriting the Next.js Font injected classes
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.remove('theme-dark');
      root.classList.add('theme-light');
    } else {
      root.classList.remove('theme-light');
      root.classList.add('theme-dark');
    }
  }, [theme]);

  // Handle botanical visibility and motion explicitly with GSAP on theme change
  useEffect(() => {
    // Resolve to actual DOM elements — killTweensOf doesn't work with selector strings
    const bots = ['#botTL', '#botBR']
      .map(id => document.querySelector(id))
      .filter((el): el is Element => el !== null);

    if (!bots.length) return;

    if (theme === 'light') {
      // Only kill the y-motion tweens, not opacity
      bots.forEach((el, index) => {
        // Kill previous y tweens on this element only
        gsap.killTweensOf(el, 'y');

        // Fade in
        gsap.to(el, { opacity: 0.9, duration: 0.5, overwrite: 'auto' });

        // Floating — fresh start from current y position
        gsap.to(el, {
          y: '+=6',
          duration: 4 + index,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
          delay: 0.5 // let fade-in finish first
        });
      });
    } else {
      bots.forEach((el) => {
        gsap.killTweensOf(el, 'y');
        gsap.to(el, { opacity: 0, duration: 0.4, overwrite: 'auto' });
      });
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  useGSAP(() => {
    if (hasIntroPlayed.current) return;
    hasIntroPlayed.current = true;

    const intro = gsap.timeline({ defaults: { ease: 'power3.out' } });

    intro
      .to('#siteHeader', { opacity: 1, duration: 0.5 })
      .to('#sidebar', { opacity: 1, x: 0, duration: 0.7 }, '-=0.1')
      .to('#rightPanel', { opacity: 1, y: 0, duration: 0.7 }, '-=0.6')
      .to('#illoCard', { opacity: 0.65, y: 0, duration: 0.9, ease: 'power2.out' }, '-=0.4')
      .to('#illoUpload', { opacity: 0.55, y: 0, duration: 0.7, ease: 'power2.out' }, '-=0.6');

    // Start perpetual floating for all illustrations once
    const float = (id: string, yAmt: number, dur: number) => {
      gsap.to(id, { y: `+=${yAmt}`, duration: dur, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    };
    float('#illoCard', 8, 3.2);
    float('#illoQuiz', 7, 3.8);
    float('#illoChat', 9, 2.9);
    float('#illoUpload', 5, 4.1);
  }, { scope: containerRef });

  const handleReady = useCallback(() => {
    setIsReady(true);
    setFlashcards([]);
    setFlashcardStatus("idle");
    setQuestions([]);
    setQuizStatus("idle");
    setContentVersion(v => v + 1);
  }, []);

  const handleReset = useCallback(() => {
    setIsReady(false);
    setFlashcards([]);
    setFlashcardStatus("idle");
    setQuestions([]);
    setQuizStatus("idle");
    setContentVersion(v => v + 1);
    setTabError("");
  }, []);

  const handleTabClick = async (tab: Tab) => {
    const curTab = activeTab;
    setActiveTab(tab);
    setTabError("");

    // GSAP exclusively controls the visual transition to prevent conflicts
    const illoMap: Record<string, string> = { flashcards: 'illoCard', quiz: 'illoQuiz', chat: 'illoChat' };
    if (illoMap[curTab]) gsap.to('#' + illoMap[curTab], { opacity: 0, y: '-=6', duration: 0.2, overwrite: 'auto' });
    if (illoMap[tab]) gsap.fromTo('#' + illoMap[tab], { opacity: 0, y: 10 }, { opacity: 0.65, y: 0, duration: 0.6, ease: 'power2.out', delay: 0.1, overwrite: 'auto' });

    if (tab === "flashcards" && flashcardStatus === "idle" && isReady) {
      setFlashcardStatus("loading");
      try {
        const cards = await generateFlashcards(SESSION_ID, 10);
        setFlashcards(cards);
        setFlashcardStatus("done");
      } catch (e: unknown) {
        setTabError(e instanceof Error ? e.message : "Failed to generate flashcards.");
        setFlashcardStatus("error");
      }
    }

    if (tab === "quiz" && quizStatus === "idle" && isReady) {
      setQuizStatus("loading");
      try {
        const qs = await generateQuiz(SESSION_ID, 5);
        setQuestions(qs);
        setQuizStatus("done");
      } catch (e: unknown) {
        setTabError(e instanceof Error ? e.message : "Failed to generate quiz.");
        setQuizStatus("error");
      }
    }
  };

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "flashcards", label: "Flashcards", icon: "🃏" },
    { id: "quiz", label: "Quiz", icon: "📝" },
    { id: "chat", label: "Chat", icon: "💬" },
  ];

  return (
    <div ref={containerRef}>
      <div className="grain"></div>
      <div className="bg-grid"></div>

      {/* BOTANICALS: Visibility controlled entirely by GSAP */}
      <div key="botanicals-wrapper" className="pointer-events-none fixed inset-0" style={{ zIndex: 10 }}>
        <div key="botTL" className="botanical bot-tl" id="botTL">
          <svg viewBox="0 0 220 200" xmlns="http://www.w3.org/2000/svg">
            <path d="M10,200 C30,160 60,130 80,100 C100,70 90,40 110,20" className="b-stroke" />
            <path d="M55,140 C65,120 85,115 100,105" className="b-stroke" />
            <path d="M75,110 C60,95 50,80 60,60" className="b-stroke" />
            <g transform="translate(105,18)">
              <ellipse cx="0" cy="-8" rx="4" ry="6" className="p-fill" transform="rotate(0)" />
              <ellipse cx="0" cy="-8" rx="4" ry="6" className="p-fill" transform="rotate(72)" />
              <ellipse cx="0" cy="-8" rx="4" ry="6" className="p-fill" transform="rotate(144)" />
              <ellipse cx="0" cy="-8" rx="4" ry="6" className="p-fill" transform="rotate(216)" />
              <ellipse cx="0" cy="-8" rx="4" ry="6" className="p-fill" transform="rotate(288)" />
              <circle cx="0" cy="0" r="2" fill="rgba(196,115,106,0.3)" stroke="rgba(196,115,106,0.5)" strokeWidth="0.5" />
              <line x1="0" y1="0" x2="3" y2="-5" className="b-stroke-rose" />
              <line x1="0" y1="0" x2="-3" y2="-5" className="b-stroke-rose" />
              <line x1="0" y1="0" x2="0" y2="-6" className="b-stroke-rose" />
            </g>
            <g transform="translate(60,56) scale(0.65)">
              <ellipse cx="0" cy="-8" rx="4" ry="6" className="p-fill" transform="rotate(20)" />
              <ellipse cx="0" cy="-8" rx="4" ry="6" className="p-fill" transform="rotate(92)" />
              <ellipse cx="0" cy="-8" rx="4" ry="6" className="p-fill" transform="rotate(164)" />
              <ellipse cx="0" cy="-8" rx="4" ry="6" className="p-fill" transform="rotate(236)" />
              <ellipse cx="0" cy="-8" rx="4" ry="6" className="p-fill" transform="rotate(308)" />
              <circle cx="0" cy="0" r="2" fill="rgba(196,115,106,0.25)" />
            </g>
            <ellipse cx="72" cy="118" rx="12" ry="5" className="l-fill" transform="rotate(-30,72,118)" />
            <ellipse cx="88" cy="99" rx="10" ry="4" className="l-fill" transform="rotate(10,88,99)" />
            <ellipse cx="140" cy="60" rx="3" ry="5" className="p-fill" transform="rotate(20,140,60)" />
            <ellipse cx="160" cy="90" rx="2.5" ry="4" className="p-fill" transform="rotate(-15,160,90)" />
          </svg>
        </div>
        <div key="botBR" className="botanical bot-br" id="botBR">
          <svg viewBox="0 0 200 180" xmlns="http://www.w3.org/2000/svg">
            <path d="M10,180 C25,150 40,110 55,80 C65,60 70,30 85,10" className="b-stroke" />
            <path d="M40,120 C55,105 75,100 90,92" className="b-stroke" />
            <g transform="translate(80,8)">
              <ellipse cx="0" cy="-8" rx="4" ry="6" className="p-fill" transform="rotate(0)" />
              <ellipse cx="0" cy="-8" rx="4" ry="6" className="p-fill" transform="rotate(72)" />
              <ellipse cx="0" cy="-8" rx="4" ry="6" className="p-fill" transform="rotate(144)" />
              <ellipse cx="0" cy="-8" rx="4" ry="6" className="p-fill" transform="rotate(216)" />
              <ellipse cx="0" cy="-8" rx="4" ry="6" className="p-fill" transform="rotate(288)" />
              <circle cx="0" cy="0" r="2" fill="rgba(196,115,106,0.3)" />
            </g>
            <ellipse cx="55" cy="108" rx="11" ry="4.5" className="l-fill" transform="rotate(-25,55,108)" />
            <ellipse cx="70" cy="90" rx="9" ry="4" className="l-fill" transform="rotate(15,70,90)" />
            <ellipse cx="110" cy="50" rx="2.5" ry="4" className="p-fill" transform="rotate(25,110,50)" />
          </svg>
        </div>
      </div>

      <header id="siteHeader">
        <div className="wordmark">Study<em>.</em></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>

          <button
            onClick={toggleTheme}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-mid)', display: 'flex', alignItems: 'center', transition: 'color 0.2s ease' }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-mid)'}
          >
            {theme === 'dark' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
            )}
          </button>

          <div id="statusTag" className={`status-tag ${isReady ? 'live' : ''}`}>
            <div className="status-dot"></div>
            <span id="statusText">{isReady ? "Document ready" : "No document loaded"}</span>
          </div>
        </div>
      </header>

      <div className="page-grid">
        <aside className="sidebar" id="sidebar">
          <InputPanel
            sessionId={SESSION_ID}
            onReady={handleReady}
            onReset={handleReset}
            isReady={isReady}
          />
        </aside>

        <div className="right-panel" id="rightPanel">

          {/* FLOATING TAB ILLUSTRATIONS - No inline React style dictating visibility, purely GSAP controlled */}
          <div className="illo illo-card" id="illoCard">
            <svg viewBox="0 0 110 130" xmlns="http://www.w3.org/2000/svg">
              <g transform="translate(0, 18)">
                <polygon points="55,18 100,42 55,66 10,42" className="illo-face-mid" />
                <polygon points="10,42 10,72 55,96 55,66" className="illo-face-mid" />
                <polygon points="100,42 100,72 55,96 55,66" className="illo-face-mid" />
                <polyline points="55,18 100,42 55,66 10,42 55,18" className="illo-stroke" />
                <line x1="10" y1="42" x2="10" y2="72" className="illo-stroke" />
                <line x1="100" y1="42" x2="100" y2="72" className="illo-stroke" />
                <line x1="55" y1="66" x2="55" y2="96" className="illo-stroke" />
                <line x1="10" y1="72" x2="55" y2="96" className="illo-stroke" />
                <line x1="100" y1="72" x2="55" y2="96" className="illo-stroke" />
              </g>
              <g transform="translate(0, 9)">
                <polygon points="55,18 100,42 55,66 10,42" className="illo-face-light" />
                <polygon points="10,42 10,72 55,96 55,66" className="illo-face-mid" />
                <polygon points="100,42 100,72 55,96 55,66" className="illo-face-mid" />
                <polyline points="55,18 100,42 55,66 10,42 55,18" className="illo-stroke" />
                <line x1="10" y1="42" x2="10" y2="72" className="illo-stroke" />
                <line x1="100" y1="42" x2="100" y2="72" className="illo-stroke" />
                <line x1="55" y1="66" x2="55" y2="96" className="illo-stroke" />
                <line x1="10" y1="72" x2="55" y2="96" className="illo-stroke" />
                <line x1="100" y1="72" x2="55" y2="96" className="illo-stroke" />
              </g>
              <g transform="translate(0, 0)">
                <polygon points="55,18 100,42 55,66 10,42" className="illo-face-light" />
                <polygon points="10,42 10,72 55,96 55,66" className="illo-face-mid" />
                <polygon points="100,42 100,72 55,96 55,66" className="illo-face-mid" />
                <polyline points="55,18 100,42 55,66 10,42 55,18" className="illo-stroke-accent" />
                <line x1="10" y1="42" x2="10" y2="72" className="illo-stroke" />
                <line x1="100" y1="42" x2="100" y2="72" className="illo-stroke" />
                <line x1="55" y1="66" x2="55" y2="96" className="illo-stroke" />
                <line x1="10" y1="72" x2="55" y2="96" className="illo-stroke" />
                <line x1="100" y1="72" x2="55" y2="96" className="illo-stroke" />
                <line x1="38" y1="36" x2="68" y2="26" className="illo-stroke-accent" />
                <line x1="38" y1="40" x2="62" y2="31" className="illo-stroke-accent" />
                <line x1="38" y1="44" x2="72" y2="36" className="illo-stroke-accent" />
              </g>
            </svg>
          </div>

          <div className="illo illo-quiz" id="illoQuiz">
            <svg viewBox="0 0 88 110" xmlns="http://www.w3.org/2000/svg">
              <polygon points="44,8 82,30 82,90 44,112 6,90 6,30" className="illo-face-mid" />
              <polygon points="44,8 82,30 44,52 6,30" className="illo-face-light" />
              <polyline points="44,8 82,30 82,90 44,112 6,90 6,30 44,8" className="illo-stroke" />
              <line x1="44" y1="52" x2="44" y2="112" className="illo-stroke" />
              <line x1="44" y1="52" x2="82" y2="30" className="illo-stroke" />
              <line x1="44" y1="52" x2="6" y2="30" className="illo-stroke" />
              <line x1="30" y1="24" x2="55" y2="15" className="illo-stroke-accent" />
              <line x1="30" y1="29" x2="50" y2="21" className="illo-stroke-accent" />
              <polyline points="22,27 26,31 34,20" className="illo-stroke-accent" />
            </svg>
          </div>

          <div className="illo illo-chat" id="illoChat">
            <svg viewBox="0 0 96 100" xmlns="http://www.w3.org/2000/svg">
              <g transform="translate(12, 28)">
                <rect x="2" y="2" width="60" height="36" rx="0" className="illo-face-mid" />
                <rect x="0" y="0" width="60" height="36" rx="0" className="illo-stroke" />
                <line x1="10" y1="12" x2="50" y2="12" className="illo-stroke-accent" />
                <line x1="10" y1="20" x2="40" y2="20" className="illo-stroke-accent" />
                <line x1="10" y1="28" x2="45" y2="28" className="illo-stroke-accent" />
                <polyline points="14,36 10,46 22,36" className="illo-stroke" />
                <polygon points="14,36 10,46 22,36" className="illo-face-mid" />
              </g>
              <g transform="translate(28, 6)">
                <rect x="2" y="2" width="56" height="32" rx="0" className="illo-face-light" />
                <rect x="0" y="0" width="56" height="32" rx="0" className="illo-stroke-accent" />
                <line x1="10" y1="11" x2="46" y2="11" className="illo-stroke-accent" />
                <line x1="10" y1="19" x2="36" y2="19" className="illo-stroke-accent" />
                <polyline points="44,32 50,42 38,32" className="illo-stroke-accent" />
                <polygon points="44,32 50,42 38,32" className="illo-face-light" />
              </g>
            </svg>
          </div>

          <div className="tab-bar">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id)}
                className={`tab-btn ${activeTab === tab.id ? "active" : ""}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="tab-pane active" style={{ display: "flex" }}>
            {!isReady ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎓</div>
                <p style={{ fontFamily: 'var(--font-heading)', fontSize: '18px', fontWeight: 600 }}>Ready to learn?</p>
                <p style={{ color: 'var(--text-mid)', marginTop: '8px' }}>Upload a file to begin.</p>
              </div>
            ) : (
              <>
                {tabError && (
                  <div style={{ padding: '12px', border: '1px solid var(--red)', color: 'var(--red)', marginBottom: '16px', background: 'var(--red-dim)' }}>
                    ⚠️ {tabError}
                  </div>
                )}

                {activeTab === "flashcards" && (
                  <>
                    {flashcardStatus === "loading" && <LoadingState text="Generating flashcards…" />}
                    {flashcardStatus === "done" && <FlashcardDeck flashcards={flashcards} />}
                    {flashcardStatus === "idle" && <IdleTabState onClick={() => handleTabClick("flashcards")} label="Generate Flashcards" />}
                    {flashcardStatus === "error" && <ErrorState onClick={() => { setFlashcardStatus("idle"); handleTabClick("flashcards"); }} />}
                  </>
                )}

                {activeTab === "quiz" && (
                  <>
                    {quizStatus === "loading" && <LoadingState text="Generating quiz…" />}
                    {quizStatus === "done" && <Quiz questions={questions} sessionId={SESSION_ID} />}
                    {quizStatus === "idle" && <IdleTabState onClick={() => handleTabClick("quiz")} label="Generate Quiz" />}
                    {quizStatus === "error" && <ErrorState onClick={() => { setQuizStatus("idle"); handleTabClick("quiz"); }} />}
                  </>
                )}

                {activeTab === "chat" && (
                  <ChatWindow key={contentVersion} sessionId={SESSION_ID} isReady={isReady} />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingState({ text }: { text: string }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
      <svg className="animate-spin" style={{ height: '32px', width: '32px', color: 'var(--accent)' }} viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
      </svg>
      <p style={{ color: 'var(--text-mid)' }}>{text}</p>
    </div>
  );
}

function IdleTabState({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <button onClick={onClick} className="process-btn" style={{ width: 'auto', padding: '12px 24px', margin: 0 }}>
        <span className="btn-label">{label}</span>
      </button>
    </div>
  );
}

function ErrorState({ onClick }: { onClick: () => void }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
      <p style={{ color: 'var(--red)' }}>Something went wrong.</p>
      <button onClick={onClick} style={{ color: 'var(--text-mid)', textDecoration: 'underline', background: 'transparent', border: 'none', cursor: 'pointer' }}>
        Try again
      </button>
    </div>
  );
}