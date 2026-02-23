"use client";

import { useState, useRef, useEffect } from "react";
import { ChatMessage, streamChat } from "@/lib/api";

interface Props {
    sessionId: string;
    isReady: boolean;
}

export default function ChatWindow({ sessionId, isReady }: Props) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [streaming, setStreaming] = useState(false);
    const [streamingText, setStreamingText] = useState("");
    const [error, setError] = useState("");
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, streamingText]);

    const sendMessage = async () => {
        const msg = input.trim();
        if (!msg || streaming || !isReady) return;

        setInput("");
        setError("");
        const userMsg: ChatMessage = { role: "user", content: msg };
        const newHistory = [...messages, userMsg];
        setMessages(newHistory);
        setStreaming(true);
        setStreamingText("");

        let accum = "";
        await streamChat(
            msg,
            sessionId,
            messages,
            (token) => {
                accum += token;
                setStreamingText(accum);
            },
            () => {
                setMessages((prev) => [...prev, { role: "assistant", content: accum }]);
                setStreamingText("");
                setStreaming(false);
            },
            (err) => {
                setError(err);
                setStreaming(false);
                setStreamingText("");
            }
        );
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    return (
        <div id="tab-chat" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 0 }}>
            {/* Messages Area */}
            <div className="chat-body" style={{ flex: 1 }}>
                {messages.length === 0 && !streaming && (
                    <div className="chat-empty">
                        <p className="chat-empty-label">02 — Explore</p>
                        <h2 className="chat-empty-heading">Ask anything<br />about <em>your content.</em></h2>
                    </div>
                )}

                {messages.map((msg, i) => (
                    <div key={i} className={`chat-msg ${msg.role === "user" ? "user" : "ai"}`}>
                        <span className="chat-msg-label">
                            {msg.role === "user" ? "You" : "Study"}
                        </span>
                        <div className="chat-bubble">
                            <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{msg.content}</p>
                        </div>
                    </div>
                ))}

                {/* Streaming Indicator */}
                {streaming && (
                    <div className="chat-msg ai">
                        <span className="chat-msg-label">Study</span>
                        <div className="chat-bubble">
                            {streamingText ? (
                                <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                                    {streamingText}
                                    <span className="type-cursor"></span>
                                </p>
                            ) : (
                                <div className="typing-indicator">
                                    <span></span><span></span><span></span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {error && (
                    <div style={{ padding: '12px', border: '1px solid var(--red)', color: 'var(--red)', marginTop: '16px', background: 'var(--red-dim)' }}>
                        ⚠️ {error}
                    </div>
                )}

                <div ref={bottomRef} />
            </div>

            {/* Input Area */}
            <div className="chat-footer">
                <div className="chat-input-row">
                    <textarea
                        rows={1}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={!isReady || streaming}
                        placeholder={isReady ? "Type a question…" : "Process a document first"}
                        className="chat-textarea"
                    />
                    <button
                        onClick={sendMessage}
                        disabled={!isReady || streaming || !input.trim()}
                        className="chat-send"
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13" />
                            <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                    </button>
                </div>
                <p className="chat-footer-note">Enter to send &nbsp;·&nbsp; Shift+Enter for new line</p>
            </div>
        </div>
    );
}