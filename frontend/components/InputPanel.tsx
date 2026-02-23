"use client";

import { useState, useRef } from "react";
import { processVideo, processPdf } from "@/lib/api";
import { v4 as uuidv4 } from "uuid";
import gsap from "gsap";

interface Props {
    sessionId: string;
    onReady: () => void;
    onReset: () => void;
    isReady: boolean;
}

type Status = "idle" | "processing" | "ready" | "error";

export default function InputPanel({ sessionId, onReady, onReset, isReady }: Props) {
    const [tab, setTab] = useState<"youtube" | "pdf">("youtube");
    const [url, setUrl] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [status, setStatus] = useState<Status>("idle");
    const [error, setError] = useState("");
    const [chunkCount, setChunkCount] = useState(0);
    const fileRef = useRef<HTMLInputElement>(null);

    const handleTabChange = (newTab: "youtube" | "pdf") => {
        if (newTab === tab) return;

        if (isReady) {
            const confirmed = window.confirm(
                `Do you want to switch to ${newTab.toUpperCase()}? Your current ${tab.toUpperCase()} data will go away.`
            );
            if (!confirmed) return;

            setUrl("");
            setFile(null);
            setStatus("idle");
            setError("");
            onReset();
        }

        setTab(newTab);
        setStatus("idle");
        setError("");
    };

    const handleProcess = async () => {
        setStatus("processing");
        setError("");
        try {
            let result;
            if (tab === "youtube") {
                if (!url.trim()) throw new Error("Please enter a YouTube URL.");
                result = await processVideo(url.trim(), sessionId);
            } else {
                if (!file) throw new Error("Please select a PDF file.");
                result = await processPdf(file, sessionId);
            }
            setChunkCount(result.chunk_count);
            // Simulate GSAP progress bar animation before setting ready state
            gsap.to('#btnProgress', {
                width: '100%', duration: 1.5, ease: 'power1.inOut',
                onComplete: () => {
                    setStatus("ready");
                    onReady();
                }
            });
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Something went wrong.");
            setStatus("error");
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const dropped = e.dataTransfer.files[0];
        if (dropped?.type === "application/pdf") setFile(dropped);
        else setError("Only PDF files are accepted.");
    };

    return (
        <>
            <p className="section-label">01 — Source</p>

            <div className="source-toggle">
                <button
                    className={`src-btn ${tab === 'youtube' ? 'active' : ''}`}
                    onClick={() => handleTabChange('youtube')}
                >
                    Video
                </button>
                <button
                    className={`src-btn ${tab === 'pdf' ? 'active' : ''}`}
                    onClick={() => handleTabChange('pdf')}
                >
                    PDF
                </button>
            </div>

            {tab === "youtube" ? (
                <div id="yt-area" className="field-group">
                    <label className="field-label">URL</label>
                    <input
                        className="field-input"
                        type="url"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="youtube.com/watch?v=..."
                        disabled={status === "processing"}
                    />
                </div>
            ) : (
                <div id="pdf-area" className="field-group">
                    <label className="field-label">Document</label>
                    <div
                        className={`drop-zone ${file ? 'has-file' : ''}`}
                        id="dropZone"
                        onClick={() => fileRef.current?.click()}
                        onDrop={handleDrop}
                        onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('hovered'); }}
                        onDragLeave={(e) => e.currentTarget.classList.remove('hovered')}
                    >
                        <input
                            ref={fileRef}
                            type="file"
                            accept="application/pdf"
                            className="hidden"
                            onChange={(e) => setFile(e.target.files?.[0] || null)}
                        />
                        <div className="drop-icon">
                            <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                            </svg>
                        </div>
                        <p id="dropText">
                            {file ? (
                                <strong>{file.name}</strong>
                            ) : (
                                <>Drop file here or <strong>click to browse</strong></>
                            )}
                        </p>
                        <span className="drop-note">PDF · Max 15 MB</span>
                    </div>
                </div>
            )}

            <button
                className={`process-btn ${status === 'processing' ? 'processing' : status === 'ready' ? 'done' : ''}`}
                id="processBtn"
                onClick={handleProcess}
                disabled={status === "processing" || status === "ready"}
            >
                <div className="btn-bg"></div>
                <div className="btn-progress" id="btnProgress"></div>
                <span className="btn-label" id="btnLabel">
                    {status === "processing" ? "Processing…" : status === "ready" ? `Done — ${chunkCount} chunks indexed` : "Process Content"}
                </span>
            </button>

            {error && (
                <div style={{ padding: '12px', border: '1px solid var(--red)', color: 'var(--red)', marginBottom: '16px', background: 'var(--red-dim)' }}>
                    ⚠️ {error}
                </div>
            )}

            <div className="sidebar-divider"></div>

            <div className="notes-block">
                <p className="note-title">Requirements</p>
                <p>
                    Videos require English captions.<br />
                    PDFs must be text-based.<br />
                    Large files take 20–30 seconds.
                </p>

                {/* Sidebar Upload Illustration Isolated Wrapper */}
                <div className="illo illo-upload" id="illoUpload">
                    <svg viewBox="0 0 64 80" xmlns="http://www.w3.org/2000/svg">
                        <polygon points="32,6 58,20 58,60 32,74 6,60 6,20" className="illo-face-mid" />
                        <polygon points="32,6 58,20 32,34 6,20" className="illo-face-light" />
                        <polyline points="32,6 58,20 58,60 32,74 6,60 6,20 32,6" className="illo-stroke" />
                        <line x1="32" y1="34" x2="32" y2="74" className="illo-stroke" />
                        <line x1="6" y1="20" x2="32" y2="34" className="illo-stroke" />
                        <line x1="58" y1="20" x2="32" y2="34" className="illo-stroke" />
                        <line x1="32" y1="13" x2="32" y2="28" className="illo-stroke-accent" />
                        <polyline points="26,18 32,13 38,18" className="illo-stroke-accent" />
                    </svg>
                </div>
            </div>
        </>
    );
}