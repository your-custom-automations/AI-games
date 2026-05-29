"use client";

import { useState } from "react";
import type { GameConfig, PlayerId } from "@/lib/types";
import { PLAYER_IDS, PLAYER_LABELS, PLAYER_COLORS } from "@/lib/types";

const PRESETS = [
  { character: "Chris Hemsworth", category: "famous actor" },
  { character: "Apple", category: "fruit or company" },
  { character: "Paris", category: "city" },
  { character: "Einstein", category: "famous person" },
];

interface Props {
  onStart: (config: GameConfig) => void;
  loading: boolean;
}

export default function GameSetup({ onStart, loading }: Props) {
  const [character, setCharacter] = useState("Chris Hemsworth");
  const [category, setCategory] = useState("famous actor");
  const [imposterId, setImposterId] = useState<PlayerId>("gemini");
  const [rounds, setRounds] = useState(5);

  return (
    <div className="setup">
      <header>
        <h1>Who&apos;s the Imposter?</h1>
        <p className="subtitle">
          Four AIs — ChatGPT, Claude, Gemini & Grok — powered by{" "}
          <strong>OpenRouter</strong>, voiced by <strong>ElevenLabs</strong>.
        </p>
      </header>

      <section className="card">
        <h2>Secret character</h2>
        <p className="hint">Three models will know this exact answer. One only gets the category.</p>
        <input
          value={character}
          onChange={(e) => setCharacter(e.target.value)}
          placeholder="e.g. Chris Hemsworth"
        />
        <div className="presets">
          {PRESETS.map((p) => (
            <button
              key={p.character}
              type="button"
              className="chip"
              onClick={() => {
                setCharacter(p.character);
                setCategory(p.category);
              }}
            >
              {p.character}
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Imposter&apos;s category hint</h2>
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="e.g. celebrity, fruit, city..."
        />
      </section>

      <section className="card">
        <h2>Who is the imposter?</h2>
        <div className="player-grid">
          {PLAYER_IDS.map((id) => (
            <button
              key={id}
              type="button"
              className={`player-btn ${imposterId === id ? "active" : ""}`}
              style={{ borderColor: PLAYER_COLORS[id] }}
              onClick={() => setImposterId(id)}
            >
              <span className="dot" style={{ background: PLAYER_COLORS[id] }} />
              {PLAYER_LABELS[id]}
            </button>
          ))}
        </div>
        <p className="hint">
          The other three will be told the exact character via private prompts.
        </p>
      </section>

      <section className="card row">
        <label>
          Rounds
          <input
            type="number"
            min={1}
            max={10}
            value={rounds}
            onChange={(e) => setRounds(Number(e.target.value))}
          />
        </label>
      </section>

      <button
        type="button"
        className="primary"
        disabled={loading || !character.trim() || !category.trim()}
        onClick={() =>
          onStart({
            character: character.trim(),
            category: category.trim(),
            imposterId,
            rounds,
          })
        }
      >
        {loading ? "Starting…" : "Start game"}
      </button>

      <style jsx>{`
        .setup {
          max-width: 520px;
          margin: 0 auto;
          padding: 2rem 1.25rem 3rem;
        }
        header h1 {
          font-size: 1.75rem;
          font-weight: 700;
          letter-spacing: -0.02em;
        }
        .subtitle {
          color: var(--muted);
          margin-top: 0.5rem;
          line-height: 1.5;
          font-size: 0.95rem;
        }
        .card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 1.25rem;
          margin-top: 1.25rem;
        }
        .card h2 {
          font-size: 0.85rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--muted);
          margin-bottom: 0.75rem;
        }
        .hint {
          font-size: 0.85rem;
          color: var(--muted);
          margin-top: 0.5rem;
          line-height: 1.4;
        }
        input {
          width: 100%;
          padding: 0.65rem 0.85rem;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--surface2);
          color: var(--text);
        }
        .presets {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-top: 0.75rem;
        }
        .chip {
          padding: 0.35rem 0.65rem;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: var(--surface2);
          color: var(--muted);
          font-size: 0.8rem;
        }
        .chip:hover {
          color: var(--text);
          border-color: var(--accent);
        }
        .player-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.5rem;
        }
        .player-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem;
          border-radius: 10px;
          border: 2px solid var(--border);
          background: var(--surface2);
          color: var(--text);
        }
        .player-btn.active {
          background: #2a2640;
        }
        .dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }
        .row label {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          font-size: 0.85rem;
          color: var(--muted);
        }
        .row input {
          width: 5rem;
        }
        .primary {
          width: 100%;
          margin-top: 1.5rem;
          padding: 0.9rem;
          border: none;
          border-radius: 10px;
          background: linear-gradient(135deg, #c9a227, #a67c00);
          color: #1a1408;
          font-weight: 700;
          font-size: 1rem;
        }
        .primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
