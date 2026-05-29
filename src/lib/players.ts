import type { PlayerId } from "./types";

export interface PlayerModelConfig {
  id: PlayerId;
  label: string;
  openRouterModel: string;
  voiceEnvKey: string;
  color: string;
  seatIndex: number;
}

export const PLAYERS: PlayerModelConfig[] = [
  {
    id: "chatgpt",
    label: "ChatGPT",
    openRouterModel:
      process.env.OPENROUTER_MODEL_CHATGPT ?? "openai/gpt-4o",
    voiceEnvKey: "ELEVENLABS_VOICE_CHATGPT",
    color: "#10a37f",
    seatIndex: 0,
  },
  {
    id: "claude",
    label: "Claude",
    openRouterModel:
      process.env.OPENROUTER_MODEL_CLAUDE ?? "anthropic/claude-sonnet-4",
    voiceEnvKey: "ELEVENLABS_VOICE_CLAUDE",
    color: "#d97757",
    seatIndex: 1,
  },
  {
    id: "gemini",
    label: "Gemini",
    openRouterModel:
      process.env.OPENROUTER_MODEL_GEMINI ?? "google/gemini-2.0-flash-001",
    voiceEnvKey: "ELEVENLABS_VOICE_GEMINI",
    color: "#4285f4",
    seatIndex: 2,
  },
  {
    id: "grok",
    label: "Grok",
    openRouterModel:
      process.env.OPENROUTER_MODEL_GROK ?? "x-ai/grok-4.3",
    voiceEnvKey: "ELEVENLABS_VOICE_GROK",
    color: "#f97316",
    seatIndex: 3,
  },
];

export function getPlayer(id: PlayerId) {
  const p = PLAYERS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown player: ${id}`);
  return p;
}

export function getVoiceId(playerId: PlayerId): string | undefined {
  const key = getPlayer(playerId).voiceEnvKey;
  return process.env[key];
}
