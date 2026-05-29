import { chatAsPlayer } from "./openrouter";
import { synthesizeSpeech, bufferToBase64 } from "./elevenlabs";
import {
  buildWordPrompt,
  buildVotePrompt,
  buildDeliberationPrompt,
  buildEarlyVoteBallotPrompt,
  buildJsonRetryPrompt,
} from "./prompts";
import {
  parseTurnResponse,
  parseVoteResponse,
  parseDeliberationResponse,
  parseEarlyBallotResponse,
} from "./parse-model";
import { isWordTooRevealing, buildVaguenessRetryLine } from "./clue-guard";
import type {
  GameConfig,
  GameState,
  PlayerId,
  TurnResult,
  VoteEntry,
  EarlyVoteEvent,
  EarlyVoteBallotEntry,
  DeliberationEntry,
  DeliberationResult,
  VoteTurnResult,
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
    deliberation: [],
    votes: [],
    activeSpeaker: null,
  };
}

export function getCurrentPlayer(state: GameState): PlayerId {
  return state.turnOrder[state.turnIndex];
}

/** Early-vote motion: need most players to agree to skip rounds */
export function majorityNeeded(playerCount: number): number {
  return Math.floor(playerCount / 2) + 1;
}

/** Final vote: innocents win if the imposter got the most accusations (plurality), not 3/4 of all votes */
export function didInnocentsWinFinalVote(
  tallies: Map<PlayerId, number>,
  imposterId: PlayerId
): boolean {
  if (tallies.size === 0) return false;

  let maxVotes = 0;
  for (const count of tallies.values()) {
    if (count > maxVotes) maxVotes = count;
  }
  if (maxVotes === 0) return false;

  const leaders = Array.from(tallies.entries())
    .filter(([, count]) => count === maxVotes)
    .map(([id]) => id);

  return leaders.length === 1 && leaders[0] === imposterId;
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

  if (currentRound > state.config.rounds) {
    return {
      ...state,
      turnIndex: 0,
      currentRound: state.config.rounds,
      phase: "deliberation",
      activeSpeaker: null,
    };
  }

  return {
    ...state,
    turnIndex,
    currentRound,
    phase: state.phase,
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
    phase: passed ? "deliberation" : state.phase,
    turnIndex: passed ? 0 : state.turnIndex,
    deliberation: passed ? [] : state.deliberation,
    votes: passed ? [] : state.votes,
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
  const allowCommentary = Math.random() < 0.5;
  const { system, user } = buildWordPrompt(
    state,
    playerId,
    isImposter,
    allowCommentary
  );

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

  if (
    !parsed.callVoteOnly &&
    !isImposter &&
    isWordTooRevealing(
      parsed.word,
      state.config.character,
      state.currentRound,
      state.config.rounds,
      false
    )
  ) {
    raw = await chatAsPlayer(
      playerId,
      system,
      `${user}\n\n${buildVaguenessRetryLine(parsed.word, state.currentRound, state.config.rounds)}`,
      { jsonMode: true }
    );
    parsed = parseTurnResponse(raw);
  }

  const callVote = parsed.callVote || parsed.callVoteOnly;
  const word = parsed.callVoteOnly ? "" : parsed.word;
  const commentary = allowCommentary ? parsed.commentary : "";

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

function advanceVotingTurn(state: GameState): GameState {
  let turnIndex = state.turnIndex + 1;
  let phase = state.phase;

  if (turnIndex >= state.turnOrder.length) {
    turnIndex = 0;
    if (phase === "deliberation") {
      phase = "final_vote";
    }
  }

  return { ...state, turnIndex, phase, activeSpeaker: null };
}

function finalizeVotes(state: GameState): GameState {
  const tallies = new Map<PlayerId, number>();
  for (const v of state.votes) {
    tallies.set(v.accusedId, (tallies.get(v.accusedId) ?? 0) + 1);
  }

  const innocentsWin = didInnocentsWinFinalVote(
    tallies,
    state.config.imposterId
  );

  return {
    ...state,
    phase: "revealed",
    winner: innocentsWin ? "innocents" : "imposter",
    activeSpeaker: null,
  };
}

export async function runDeliberationTurn(
  state: GameState
): Promise<DeliberationResult> {
  if (state.phase !== "deliberation") {
    throw new Error("Not in deliberation phase");
  }

  const playerId = getCurrentPlayer(state);
  const isImposter = playerId === state.config.imposterId;
  const { system, user } = buildDeliberationPrompt(state, playerId, isImposter);

  let raw = await chatAsPlayer(playerId, system, user, { jsonMode: true });
  let parsed;
  try {
    parsed = parseDeliberationResponse(raw, playerId);
  } catch {
    raw = await chatAsPlayer(
      playerId,
      system,
      `${user}\n\n${buildJsonRetryPrompt("deliberation")}`,
      { jsonMode: true }
    );
    parsed = parseDeliberationResponse(raw, playerId);
  }

  const entry: DeliberationEntry = {
    playerId,
    speech: parsed.speech,
    accusesId: parsed.accusesId,
    role: parsed.role,
  };

  let audioBase64: string | undefined;
  const audio = await synthesizeSpeech(playerId, parsed.speech);
  if (audio) audioBase64 = bufferToBase64(audio);

  const withEntry = {
    ...state,
    deliberation: [...state.deliberation, entry],
    activeSpeaker: playerId,
  };

  const next = advanceVotingTurn(withEntry);

  return { state: next, speech: parsed.speech, audioBase64 };
}

export async function runFinalVoteTurn(
  state: GameState
): Promise<VoteTurnResult> {
  if (state.phase !== "final_vote") {
    throw new Error("Not in final vote phase");
  }

  const voterId = getCurrentPlayer(state);
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

  const announcement =
    parsed.announcement ||
    `I vote for ${parsed.accusedId}. ${parsed.reasoning}`.trim();

  let audioBase64: string | undefined;
  const audio = await synthesizeSpeech(voterId, announcement);
  if (audio) audioBase64 = bufferToBase64(audio);

  const vote: VoteEntry = {
    voterId,
    accusedId: parsed.accusedId,
    announcement,
    reasoning: parsed.reasoning,
  };

  const withVote = {
    ...state,
    votes: [...state.votes, vote],
    activeSpeaker: voterId,
  };

  let next = advanceVotingTurn(withVote);

  let revealed = false;
  if (next.votes.length >= state.turnOrder.length) {
    next = finalizeVotes(next);
    revealed = true;
  }

  return {
    state: next,
    announcement,
    accusedId: parsed.accusedId,
    audioBase64,
    revealed,
  };
}

/** Run all remaining deliberation + final votes (auto-play) */
export async function runFullVotingSequence(
  state: GameState
): Promise<GameState> {
  let s = state;
  while (s.phase === "deliberation") {
    const r = await runDeliberationTurn(s);
    s = r.state;
  }
  while (s.phase === "final_vote") {
    const r = await runFinalVoteTurn(s);
    s = r.state;
    if (r.revealed) break;
  }
  return s;
}

export function tallyVotes(state: GameState): Map<PlayerId, number> {
  const m = new Map<PlayerId, number>();
  for (const v of state.votes) {
    m.set(v.accusedId, (m.get(v.accusedId) ?? 0) + 1);
  }
  return m;
}
