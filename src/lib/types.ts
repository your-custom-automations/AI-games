export type PlayerId = "chatgpt" | "claude" | "gemini" | "grok";

export const PLAYER_IDS: PlayerId[] = ["chatgpt", "claude", "gemini", "grok"];

export const PLAYER_LABELS: Record<PlayerId, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  grok: "Grok",
};

export const PLAYER_COLORS: Record<PlayerId, string> = {
  chatgpt: "#10a37f",
  claude: "#d97757",
  gemini: "#4285f4",
  grok: "#f97316",
};

export interface WordEntry {
  playerId: PlayerId;
  word: string;
  round: number;
  commentary?: string;
  /** Player asked to end rounds early and go to imposter vote */
  calledEarlyVote?: boolean;
}

export interface EarlyVoteBallotEntry {
  playerId: PlayerId;
  agree: boolean;
  line?: string;
}

export interface EarlyVoteEvent {
  calledBy: PlayerId;
  round: number;
  ballots: EarlyVoteBallotEntry[];
  passed: boolean;
}

export interface VoteEntry {
  voterId: PlayerId;
  accusedId: PlayerId;
  /** What they said out loud when locking their vote */
  announcement: string;
  reasoning: string;
}

/** Public accusation / defense before final votes */
export interface DeliberationEntry {
  playerId: PlayerId;
  speech: string;
  /** Who they are accusing in this speech, if anyone */
  accusesId?: PlayerId;
  role: "accuse" | "defend" | "discuss";
}

export type GamePhase =
  | "setup"
  | "playing"
  | "deliberation"
  | "final_vote"
  | "revealed";

export interface GameConfig {
  character: string;
  category: string;
  imposterId: PlayerId;
  rounds: number;
}

export interface GameState {
  id: string;
  config: GameConfig;
  phase: GamePhase;
  /** Order of play; rotates each round */
  turnOrder: PlayerId[];
  currentRound: number;
  /** Index into turnOrder for whose turn it is (within current round) */
  turnIndex: number;
  /** Public transcript — everyone sees this */
  publicLog: WordEntry[];
  /** Early-vote motions (call vote before all rounds finish) */
  earlyVoteHistory: EarlyVoteEvent[];
  /** Public discussion before locked votes */
  deliberation: DeliberationEntry[];
  votes: VoteEntry[];
  /** Last speaker for 3D animation */
  activeSpeaker: PlayerId | null;
  winner?: "innocents" | "imposter";
}

export interface TurnResult {
  state: GameState;
  word: string;
  commentary: string;
  audioBase64?: string;
  /** Set when this turn triggered an early-vote ballot */
  earlyVote?: EarlyVoteEvent;
  /** TTS for ballot lines (agree/decline) */
  earlyVoteAudio?: { playerId: PlayerId; base64: string }[];
  /** Called for vote but table wasn't ready (need at least one full round of words) */
  earlyVoteDenied?: boolean;
}

export interface DeliberationResult {
  state: GameState;
  speech: string;
  audioBase64?: string;
}

export interface VoteTurnResult {
  state: GameState;
  announcement: string;
  accusedId: PlayerId;
  audioBase64?: string;
  revealed?: boolean;
}
