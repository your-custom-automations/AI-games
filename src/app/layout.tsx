import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Imposter — Who's the Imposter?",
  description: "ChatGPT, Claude, Gemini & Grok play a word deduction game",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
