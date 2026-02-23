import type { Metadata } from "next";
import { Syne, Syne_Mono, DM_Sans, Cormorant_Garamond, DM_Mono } from "next/font/google";
import "./globals.css";

// Dark Theme Fonts
const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne"
});

const syneMono = Syne_Mono({
  weight: '400',
  subsets: ["latin"],
  variable: "--font-syne-mono"
});

// Shared Body Font
const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans"
});

// Light Theme Fonts
const cormorant = Cormorant_Garamond({
  weight: ['300', '400', '500', '600'],
  subsets: ["latin"],
  style: ['normal', 'italic'],
  variable: "--font-cormorant"
});

const dmMono = DM_Mono({
  weight: ['300', '400', '500'],
  subsets: ["latin"],
  variable: "--font-dm-mono"
});

export const metadata: Metadata = {
  title: "AI Learning Assistant",
  description:
    "RAG-powered study tool — upload a YouTube video or PDF to generate flashcards, quizzes, and an AI chat assistant grounded in your content.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // We apply the dark theme by default and inject all font variables
  return (
    <html
      lang="en"
      className={`theme-dark ${syne.variable} ${syneMono.variable} ${dmSans.variable} ${cormorant.variable} ${dmMono.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}