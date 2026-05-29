"use client";

import { useState } from "react";
import GameSetup from "@/components/GameSetup";
import GameBoard from "@/components/GameBoard";
import type { GameConfig, GameState } from "@/lib/types";

export default function Home() {
  const [state, setState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart(config: GameConfig) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/game/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start");
      setState(data.state);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start game");
    } finally {
      setLoading(false);
    }
  }

  if (state) {
    return (
      <>
        <GameBoard
          initialState={state}
          hideImposterUntilReveal
          onReset={() => setState(null)}
        />
      </>
    );
  }

  return (
    <>
      {error && (
        <p
          style={{
            textAlign: "center",
            color: "#f87171",
            padding: "1rem",
            maxWidth: 520,
            margin: "0 auto",
          }}
        >
          {error}
        </p>
      )}
      <GameSetup onStart={handleStart} loading={loading} />
      <footer
        style={{
          textAlign: "center",
          padding: "2rem",
          color: "var(--muted)",
          fontSize: "0.85rem",
        }}
      >
        Copy <code>.env.example</code> to <code>.env</code> and add your OpenRouter &amp;
        ElevenLabs keys.
      </footer>
    </>
  );
}
