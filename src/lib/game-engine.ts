import { chatAsPlayer } from "./openrouter";
import { synthesizeSpeech, bufferToBase64 } from "./elevenlabs";
import {
  buildWordPrompt,
  buildVotePrompt,
  buildEarlyVoteBallotPrompt,
  buildJsonRetryPrompt,
} from "./prompts";
import {
  parseTurnResponse,
  parseVoteResponse,
  parseEarlyBallotResponse,
} from "./parse-model";
import type {
  GameConfig,
  GameState,
  PlayerId,
  TurnResult,
  VoteEntry,
  EarlyVoteEvent,
  EarlyVoteBallotEntry,
} from "./types";
import { PLAYER_IDS } from "./types";

function randomId(): string {
  return Math.random().toString(36).slice(2, 11);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createGame(config: GameConfig): GameState {
  return {
    id: randomId(),
    config,
    phase: "playing",
    turnOrder: shuffle(PLAYER_IDS),
    currentRound: 1,
    turnIndex: 0,
    publicLog: [],
    earlyVoteHistory: [],
    votes: [],
    activeSpeaker: null,
  };
}

export function getCurrentPlayer(state: GameState): PlayerId {
  return state.turnOrder[state.turnIndex];
}

export function majorityNeeded(playerCount: number): number {
  return Math.floor(playerCount / 2) + 1;
}

export function canRequestEarlyVote(state: GameState): boolean {
  const realWords = state.publicLog.filter(
    (e) => e.word && e.word !== "…" && e.word !== "—"
  ).length;
  return realWords >= 4 || state.currentRound >= 2;
}

export function isGamePlayComplete(state: GameState): boolean {
  return (
    state.phase === "playing" &&
    state.currentRound > state.config.rounds
  );
}

function advanceTurn(state: GameState): GameState {
  let turnIndex = state.turnIndex + 1;
  let currentRound = state.currentRound;

  if (turnIndex >= state.turnOrder.length) {
    turnIndex = 0;
    currentRound += 1;
  }

  const phase =
    currentRound > state.config.rounds ? "voting" : state.phase;

  return {
    ...state,
    turnIndex,
    currentRound,
    phase,
    activeSpeaker: null,
  };
}

async function runEarlyVoteBallot(
  state: GameState,
  calledBy: PlayerId
): Promise<{
  state: GameState;
  event: EarlyVoteEvent;
  audioClips: { playerId: PlayerId; base64: string }[];
}> {
  const ballots: EarlyVoteBallotEntry[] = [];
  const audioClips: { playerId: PlayerId; base64: string }[] = [];

  for (const voterId of state.turnOrder) {
    const { system, user } = buildEarlyVoteBallotPrompt(state, voterId, calledBy);
    let raw = await chatAsPlayer(voterId, system, user, { jsonMode: true });
    let parsed;
    try {
      parsed = parseEarlyBallotResponse(raw);
    } catch {
      raw = await chatAsPlayer(
        voterId,
        system,
        `${user}\n\n${buildJsonRetryPrompt("early_ballot")}`,
        { jsonMode: true }
      );
      parsed = parseEarlyBallotResponse(raw);
    }

    ballots.push({
      playerId: voterId,
      agree: parsed.agree,
      line: parsed.line || undefined,
    });

    const speakText = parsed.line
      ? parsed.agree
        ? `Yes. ${parsed.line}`
        : `No. ${parsed.line}`
      : parsed.agree
        ? "Yes, let's vote now."
        : "No, keep playing.";

    const audio = await synthesizeSpeech(voterId, speakText);
    if (audio) {
      audioClips.push({
        playerId: voterId,
        base64: bufferToBase64(audio),
      });
    }
  }

  const yesCount = ballots.filter((b) => b.agree).length;
  const passed = yesCount >= majorityNeeded(state.turnOrder.length);

  const event: EarlyVoteEvent = {
    calledBy,
    round: state.currentRound,
    ballots,
    passed,
  };

  const nextState: GameState = {
    ...state,
    earlyVoteHistory: [...state.earlyVoteHistory, event],
    phase: passed ? "voting" : state.phase,
    activeSpeaker: null,
  };

  return { state: nextState, event, audioClips };
}

export async function runTurn(state: GameState): Promise<TurnResult> {
  if (state.phase !== "playing") {
    throw new Error("Game is not in playing phase");
  }
  if (isGamePlayComplete(state)) {
    throw new Error("All rounds complete — start voting");
  }

  const playerId = getCurrentPlayer(state);
  const isImposter = playerId === state.config.imposterId;
  const { system, user } = buildWordPrompt(state, playerId, isImposter);

  let raw = await chatAsPlayer(playerId, system, user, { jsonMode: true });
  let parsed;
  try {
    parsed = parseTurnResponse(raw);
  } catch {
    raw = await chatAsPlayer(
      playerId,
      system,
      `${user}\n\n${buildJsonRetryPrompt("turn")}`,
      { jsonMode: true }
    );
    parsed = parseTurnResponse(raw);
  }

  const callVote = parsed.callVote || parsed.callVoteOnly;
  const word = parsed.callVoteOnly ? "" : parsed.word;
  const commentary = parsed.commentary;

  let audioBase64: string | undefined;
  let workingState = state;

  if (!parsed.callVoteOnly) {
    const entry = {
      playerId,
      word: word || "…",
      round: state.currentRound,
      commentary,
      calledEarlyVote: parsed.callVote || undefined,
    };

    const speakText = [
      commentary ? `${entry.word}. ${commentary}` : entry.word,
      parsed.callVote ? "I call for a vote." : "",
    ]
      .filter(Boolean)
      .join(" ");

    const audio = await synthesizeSpeech(playerId, speakText);
    if (audio) audioBase64 = bufferToBase64(audio);

    workingState = {
      ...state,
      publicLog: [...state.publicLog, entry],
      activeSpeaker: playerId,
    };
  } else if (callVote) {
    const speakText = commentary
      ? `Vote now. ${commentary}`
      : "I call for a vote now.";
    const audio = await synthesizeSpeech(playerId, speakText);
    if (audio) audioBase64 = bufferToBase64(audio);
    workingState = { ...state, activeSpeaker: playerId };
  }

  let next = advanceTurn(workingState);

  let earlyVote: EarlyVoteEvent | undefined;
  let earlyVoteAudio: { playerId: PlayerId; base64: string }[] | undefined;

  let earlyVoteDenied = false;
  if (callVote) {
    if (canRequestEarlyVote(workingState)) {
      const ballot = await runEarlyVoteBallot(next, playerId);
      next = ballot.state;
      earlyVote = ballot.event;
      earlyVoteAudio = ballot.audioClips;
    } else {
      earlyVoteDenied = true;
    }
  }

  return {
    state: next,
    word: parsed.callVoteOnly ? "—" : word || "…",
    commentary,
    audioBase64,
    earlyVote,
    earlyVoteAudio,
    earlyVoteDenied,
  };
}

export async function runVotePhase(state: GameState): Promise<GameState> {
  if (state.phase !== "voting") {
    throw new Error("Not in voting phase");
  }

  const votes: VoteEntry[] = [];

  for (const voterId of state.turnOrder) {
    const { system, user } = buildVotePrompt(state, voterId);
    let raw = await chatAsPlayer(voterId, system, user, { jsonMode: true });
    let parsed;
    try {
      parsed = parseVoteResponse(raw, voterId);
    } catch {
      raw = await chatAsPlayer(
        voterId,
        system,
        `${user}\n\n${buildJsonRetryPrompt("vote")}`,
        { jsonMode: true }
      );
      parsed = parseVoteResponse(raw, voterId);
    }

    votes.push({
      voterId,
      accusedId: parsed.accusedId,
      reasoning: parsed.reasoning,
    });
  }

  const tallies = new Map<PlayerId, number>();
  for (const v of votes) {
    tallies.set(v.accusedId, (tallies.get(v.accusedId) ?? 0) + 1);
  }

  const imposterVotes = tallies.get(state.config.imposterId) ?? 0;
  const needed = majorityNeeded(state.turnOrder.length);
  const innocentsWin = imposterVotes >= needed;

  return {
    ...state,
    votes,
    phase: "revealed",
    winner: innocentsWin ? "innocents" : "imposter",
    activeSpeaker: null,
  };
}

export function tallyVotes(state: GameState): Map<PlayerId, number> {
  const m = new Map<PlayerId, number>();
  for (const v of state.votes) {
    m.set(v.accusedId, (m.get(v.accusedId) ?? 0) + 1);
  }
  return m;
}
