"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GameState, PlayerId } from "@/lib/types";
import { PLAYER_LABELS, PLAYER_COLORS } from "@/lib/types";
import { waitForTurnAudio, playAudioAndWait } from "@/lib/play-audio";

const SofaScene = dynamic(() => import("./SofaScene"), { ssr: false });

interface Props {
  initialState: GameState;
  hideImposterUntilReveal?: boolean;
  onReset: () => void;
}

interface TurnResponse {
  state: GameState;
  word?: string;
  commentary?: string;
  audioBase64?: string;
  earlyVote?: GameState["earlyVoteHistory"][0];
  earlyVoteAudio?: { playerId: PlayerId; base64: string }[];
  earlyVoteDenied?: boolean;
  done?: boolean;
  error?: string;
}

interface DeliberationResponse {
  state: GameState;
  speech: string;
  audioBase64?: string;
}

interface VoteTurnResponse {
  state: GameState;
  announcement: string;
  accusedId: PlayerId;
  audioBase64?: string;
  revealed?: boolean;
}

export default function GameBoard({
  initialState,
  hideImposterUntilReveal = true,
  onReset,
}: Props) {
  const [state, setState] = useState<GameState>({
    ...initialState,
    deliberation: initialState.deliberation ?? [],
  });
  const [busy, setBusy] = useState(false);
  const [speakingPlayer, setSpeakingPlayer] = useState<PlayerId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastLine, setLastLine] = useState<{
    word: string;
    commentary: string;
    playerId: PlayerId;
    mode: "word" | "speech" | "vote";
  } | null>(null);
  const autoPlay = useRef(false);

  const applyTurnResult = useCallback(async (data: TurnResponse) => {
    if (data.done) {
      setState({
        ...data.state,
        deliberation: data.state.deliberation ?? [],
      });
      setSpeakingPlayer(null);
      return data.state;
    }

    const entry = data.state.publicLog[data.state.publicLog.length - 1];
    const playerId = entry?.playerId;
    const word = data.word ?? entry?.word ?? "";
    const commentary = data.commentary ?? entry?.commentary ?? "";

    if (playerId) {
      setLastLine({ word, commentary, playerId, mode: "word" });
      setSpeakingPlayer(playerId);
    }
    setState(data.state);

    await waitForTurnAudio(word, commentary, data.audioBase64);

    if (data.earlyVoteAudio?.length) {
      for (const clip of data.earlyVoteAudio) {
        setSpeakingPlayer(clip.playerId);
        await playAudioAndWait(clip.base64);
      }
    }

    setSpeakingPlayer(null);

    if (data.earlyVoteDenied) {
      setError(
        "Early vote called too soon — need at least one full round of words first."
      );
    }

    return data.state;
  }, []);

  const applyDeliberation = useCallback(async (data: DeliberationResponse) => {
    const playerId =
      data.state.deliberation[data.state.deliberation.length - 1]?.playerId;
    if (playerId) {
      setLastLine({
        word: data.speech,
        commentary: "",
        playerId,
        mode: "speech",
      });
      setSpeakingPlayer(playerId);
    }
    setState(data.state);
    if (data.audioBase64) await playAudioAndWait(data.audioBase64);
    setSpeakingPlayer(null);
    return data.state;
  }, []);

  const applyVoteTurn = useCallback(async (data: VoteTurnResponse) => {
    const voterId = data.state.votes[data.state.votes.length - 1]?.voterId;
    if (voterId) {
      setLastLine({
        word: data.announcement,
        commentary: `→ ${PLAYER_LABELS[data.accusedId]}`,
        playerId: voterId,
        mode: "vote",
      });
      setSpeakingPlayer(voterId);
    }
    setState(data.state);
    if (data.audioBase64) await playAudioAndWait(data.audioBase64);
    setSpeakingPlayer(null);
    return data.state;
  }, []);

  const fetchTurn = useCallback(async (s: GameState): Promise<TurnResponse> => {
    const res = await fetch("/api/game/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: s }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Turn failed");
    return data;
  }, []);

  const fetchDeliberation = useCallback(
    async (s: GameState): Promise<DeliberationResponse> => {
      const res = await fetch("/api/game/deliberate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: s }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Discussion failed");
      return data;
    },
    []
  );

  const fetchVoteTurn = useCallback(
    async (s: GameState): Promise<VoteTurnResponse> => {
      const res = await fetch("/api/game/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: s }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Vote failed");
      return data;
    },
    []
  );

  const fetchAllVoting = useCallback(async (s: GameState): Promise<GameState> => {
    const res = await fetch("/api/game/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: s, all: true }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Voting failed");
    return data.state;
  }, []);

  const runNextTurn = useCallback(async () => {
    if (busy || state.phase !== "playing") return;
    setBusy(true);
    setError(null);
    try {
      const data = await fetchTurn(state);
      await applyTurnResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setSpeakingPlayer(null);
    } finally {
      setBusy(false);
    }
  }, [busy, state, fetchTurn, applyTurnResult]);

  const runNextDeliberation = useCallback(async () => {
    if (busy || state.phase !== "deliberation") return;
    setBusy(true);
    setError(null);
    try {
      const data = await fetchDeliberation(state);
      await applyDeliberation(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setSpeakingPlayer(null);
    } finally {
      setBusy(false);
    }
  }, [busy, state, fetchDeliberation, applyDeliberation]);

  const runNextVote = useCallback(async () => {
    if (busy || state.phase !== "final_vote") return;
    setBusy(true);
    setError(null);
    try {
      const data = await fetchVoteTurn(state);
      await applyVoteTurn(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setSpeakingPlayer(null);
    } finally {
      setBusy(false);
    }
  }, [busy, state, fetchVoteTurn, applyVoteTurn]);

  const runAllVoting = useCallback(async () => {
    if (busy || (state.phase !== "deliberation" && state.phase !== "final_vote"))
      return;
    setBusy(true);
    setError(null);
    try {
      const next = await fetchAllVoting(state);
      setState(next);
      setLastLine(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }, [busy, state, fetchAllVoting]);

  const runFullGame = useCallback(async () => {
    autoPlay.current = true;
    setBusy(true);
    setError(null);
    let s = state;

    try {
      while (autoPlay.current && s.phase === "playing") {
        const data = await fetchTurn(s);
        s = await applyTurnResult(data);
        if (data.done || s.phase === "deliberation") break;
      }

      while (autoPlay.current && s.phase === "deliberation") {
        const d = await fetchDeliberation(s);
        s = await applyDeliberation(d);
      }

      while (autoPlay.current && s.phase === "final_vote") {
        const v = await fetchVoteTurn(s);
        s = await applyVoteTurn(v);
        if (v.revealed) break;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setSpeakingPlayer(null);
    } finally {
      setBusy(false);
    }
  }, [
    state,
    fetchTurn,
    applyTurnResult,
    fetchDeliberation,
    applyDeliberation,
    fetchVoteTurn,
    applyVoteTurn,
  ]);

  useEffect(() => {
    return () => {
      autoPlay.current = false;
    };
  }, []);

  const showImposter =
    !hideImposterUntilReveal || state.phase === "revealed";

  const activeSpeaker = speakingPlayer ?? state.activeSpeaker;

  const deliberation = state.deliberation ?? [];

  return (
    <div className="board">
      <div className="scene-wrap">
        <SofaScene activeSpeaker={activeSpeaker} turnOrder={state.turnOrder} />
      </div>

      {lastLine && (
        <div className="bubble" style={{ borderColor: PLAYER_COLORS[lastLine.playerId] }}>
          <strong>{PLAYER_LABELS[lastLine.playerId]}</strong>
          {lastLine.mode === "word" ? (
            <span className="word">&ldquo;{lastLine.word}&rdquo;</span>
          ) : (
            <p className="speech">{lastLine.word}</p>
          )}
          {lastLine.commentary && <p>{lastLine.commentary}</p>}
        </div>
      )}

      <div className="status-bar">
        {state.phase === "playing" && (
          <span>
            Round {Math.min(state.currentRound, state.config.rounds)} /{" "}
            {state.config.rounds}
          </span>
        )}
        <span className="phase">{state.phase.replace("_", " ")}</span>
        {speakingPlayer && (
          <span className="speaking">
            🔊 {PLAYER_LABELS[speakingPlayer]} speaking…
          </span>
        )}
        <span>Character: {state.config.character}</span>
        {showImposter && (
          <span>Imposter: {PLAYER_LABELS[state.config.imposterId]}</span>
        )}
      </div>

      <div className="log">
        {state.publicLog.map((e, i) => (
          <div key={i} className="log-row">
            <span className="tag" style={{ color: PLAYER_COLORS[e.playerId] }}>
              R{e.round} {PLAYER_LABELS[e.playerId]}
            </span>
            <span className="w">{e.word}</span>
            {e.calledEarlyVote && (
              <span className="motion">calls vote</span>
            )}
            {e.commentary && <span className="c">{e.commentary}</span>}
          </div>
        ))}
        {deliberation.map((d, i) => (
          <div key={`d-${i}`} className="log-row discuss">
            <span className="tag" style={{ color: PLAYER_COLORS[d.playerId] }}>
              💬 {PLAYER_LABELS[d.playerId]}
            </span>
            <span className="c">{d.speech}</span>
            {d.accusesId && (
              <span className="motion">→ {PLAYER_LABELS[d.accusesId]}</span>
            )}
          </div>
        ))}
        {state.votes.map((v) => (
          <div key={v.voterId} className="log-row vote">
            <span className="tag" style={{ color: PLAYER_COLORS[v.voterId] }}>
              🗳️ {PLAYER_LABELS[v.voterId]}
            </span>
            <span className="c">{v.announcement}</span>
          </div>
        ))}
        {(state.earlyVoteHistory ?? []).map((ev, i) => (
          <div key={`ev-${i}`} className="log-row event">
            <span className="tag">
              Vote motion — {PLAYER_LABELS[ev.calledBy]}
            </span>
            <span className="c">
              {ev.passed
                ? "Majority agreed → discussion!"
                : "Denied — game continues."}{" "}
              (
              {ev.ballots
                .map(
                  (b) =>
                    `${PLAYER_LABELS[b.playerId]}: ${b.agree ? "yes" : "no"}`
                )
                .join(", ")}
              )
            </span>
          </div>
        ))}
      </div>

      {state.phase === "revealed" && (
        <div className={`result ${state.winner}`}>
          <h2>
            {state.winner === "innocents"
              ? "Innocents win — imposter caught!"
              : "Imposter wins — fooled everyone!"}
          </h2>
          <p>
            The imposter was {PLAYER_LABELS[state.config.imposterId]}.
          </p>
          <p className="tally-hint">
            Plurality rules — most votes on the imposter wins it for innocents.
          </p>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <div className="actions">
        {state.phase === "playing" && (
          <>
            <button type="button" disabled={busy} onClick={runNextTurn}>
              {busy ? (speakingPlayer ? "Speaking…" : "Thinking…") : "Next word"}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={runFullGame}
            >
              Auto-play to end
            </button>
          </>
        )}
        {state.phase === "deliberation" && (
          <>
            <button type="button" disabled={busy} onClick={runNextDeliberation}>
              {busy ? "Speaking…" : "Next statement"}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={runAllVoting}
            >
              Auto-play discussion & votes
            </button>
          </>
        )}
        {state.phase === "final_vote" && (
          <>
            <button type="button" disabled={busy} onClick={runNextVote}>
              {busy ? "Speaking…" : "Next locked vote"}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={runAllVoting}
            >
              Finish all votes
            </button>
          </>
        )}
        <button type="button" className="ghost" onClick={onReset}>
          New game
        </button>
      </div>

      <style jsx>{`
        .board {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
          padding: 1rem;
          max-width: 1200px;
          margin: 0 auto;
        }
        @media (max-width: 900px) {
          .board {
            grid-template-columns: 1fr;
          }
        }
        .scene-wrap {
          grid-row: span 2;
          min-height: 360px;
          background: #0a090d;
          border-radius: 12px;
          border: 1px solid var(--border);
        }
        .bubble {
          grid-column: 2;
          padding: 1rem;
          border-left: 4px solid;
          background: var(--surface);
          border-radius: 8px;
        }
        .bubble .word {
          display: block;
          font-size: 1.5rem;
          font-weight: 700;
          margin: 0.35rem 0;
        }
        .bubble .speech {
          margin: 0.35rem 0;
          line-height: 1.45;
        }
        .bubble p {
          color: var(--muted);
          font-size: 0.9rem;
          line-height: 1.45;
        }
        .status-bar {
          grid-column: 2;
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
          font-size: 0.8rem;
          color: var(--muted);
        }
        .phase {
          text-transform: uppercase;
          color: var(--accent);
        }
        .speaking {
          color: var(--text);
        }
        .log {
          grid-column: 2;
          max-height: 280px;
          overflow-y: auto;
          background: var(--surface);
          border-radius: 8px;
          padding: 0.75rem;
          border: 1px solid var(--border);
        }
        .log-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          padding: 0.35rem 0;
          border-bottom: 1px solid var(--border);
          font-size: 0.85rem;
        }
        .log-row:last-child {
          border: none;
        }
        .tag {
          font-weight: 600;
          min-width: 7rem;
        }
        .w {
          font-weight: 700;
        }
        .c {
          color: var(--muted);
          flex: 1;
        }
        .motion {
          font-size: 0.75rem;
          color: var(--accent);
          font-weight: 600;
        }
        .log-row.event,
        .log-row.discuss,
        .log-row.vote {
          background: rgba(201, 162, 39, 0.06);
        }
        .result {
          grid-column: 1 / -1;
          padding: 1.25rem;
          border-radius: 12px;
          border: 1px solid var(--border);
        }
        .result.innocents {
          background: #1a2e22;
        }
        .result.imposter {
          background: #2e1a22;
        }
        .tally-hint {
          color: var(--muted);
          font-size: 0.85rem;
          margin-top: 0.35rem;
        }
        .error {
          grid-column: 1 / -1;
          color: #f87171;
        }
        .actions {
          grid-column: 1 / -1;
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        button {
          padding: 0.65rem 1.1rem;
          border-radius: 8px;
          border: none;
          background: linear-gradient(135deg, #c9a227, #a67c00);
          color: #1a1408;
          font-weight: 600;
        }
        button:disabled {
          opacity: 0.5;
        }
        .secondary {
          background: var(--surface2);
          color: var(--text);
          border: 1px solid var(--border);
        }
        .ghost {
          background: transparent;
          color: var(--muted);
          border: 1px solid var(--border);
        }
      `}</style>
    </div>
  );
}
