import { PLAYER_IDS, type PlayerId } from "./types";

function stripCodeFences(text: string): string {
  return text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
}

function tryParseObject(raw: string): Record<string, unknown> | null {
  const cleaned = stripCodeFences(raw);

  try {
    const direct = JSON.parse(cleaned) as unknown;
    if (direct && typeof direct === "object" && !Array.isArray(direct)) {
      return direct as Record<string, unknown>;
    }
  } catch {
    /* fall through */
  }

  const candidates: string[] = [];
  const fenceMatch = cleaned.match(/\{[\s\S]*\}/);
  if (fenceMatch) candidates.push(fenceMatch[0]);

  let depth = 0;
  let start = -1;
  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (cleaned[i] === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        candidates.push(cleaned.slice(start, i + 1));
        start = -1;
      }
    }
  }

  for (let i = candidates.length - 1; i >= 0; i--) {
    try {
      const obj = JSON.parse(candidates[i]) as Record<string, unknown>;
      if (obj && typeof obj === "object") return obj;
    } catch {
      /* try next */
    }
  }
  return null;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function normalizeWord(raw: string): string {
  const token = raw.trim().split(/\s+/)[0] ?? "";
  const cleaned = token.replace(/[^a-zA-Z'-]/g, "");
  return cleaned || "…";
}

function extractWordFromProse(text: string): string | null {
  const patterns = [
    /"word"\s*:\s*"([^"]+)"/i,
    /word\s*[:=]\s*["']?([a-zA-Z'-]+)/i,
    /(?:my word is|i(?:'ll| will) say)\s+["']?([a-zA-Z'-]+)/i,
    /(?:^|\n)\s*["']([a-zA-Z'-]+)["']\s*$/m,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return normalizeWord(m[1]);
  }
  return null;
}

function extractCommentaryFromProse(text: string): string {
  const m = text.match(/"commentary"\s*:\s*"([^"]*)"/i);
  return m?.[1]?.trim() ?? "";
}

function parsePlayerId(raw: string): PlayerId | null {
  const lower = raw.toLowerCase().trim();
  if (!lower) return null;
  for (const id of PLAYER_IDS) {
    if (lower === id) return id;
  }
  for (const id of PLAYER_IDS) {
    if (lower.includes(id)) return id;
  }
  return null;
}

/** Never allow self-accusation — pick another player if needed */
export function resolveAccused(
  voterId: PlayerId,
  accusedId: PlayerId | null
): PlayerId {
  if (accusedId && accusedId !== voterId) return accusedId;
  return PLAYER_IDS.find((id) => id !== voterId)!;
}

export interface ParsedTurn {
  word: string;
  commentary: string;
  callVote: boolean;
  /** Motion only — no clue word this turn */
  callVoteOnly: boolean;
}

export interface ParsedEarlyBallot {
  agree: boolean;
  line: string;
}

export interface ParsedVote {
  accusedId: PlayerId;
  announcement: string;
  reasoning: string;
}

export interface ParsedDeliberation {
  speech: string;
  accusesId?: PlayerId;
  role: "accuse" | "defend" | "discuss";
}

function pickBool(obj: Record<string, unknown>, keys: string[]): boolean {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "boolean") return v;
    if (v === "true" || v === true) return true;
    if (v === "false" || v === false) return false;
  }
  return false;
}

export function parseTurnResponse(raw: string): ParsedTurn {
  const obj = tryParseObject(raw);
  if (obj) {
    const callVote = pickBool(obj, ["callVote", "call_vote", "voteNow"]);
    const callVoteOnly = pickBool(obj, [
      "callVoteOnly",
      "call_vote_only",
      "voteOnly",
    ]);
    let word = pickString(obj, ["word", "Word"]);
    if (word) word = normalizeWord(word);
    else if (!callVoteOnly) word = "…";

    let commentary = pickString(obj, ["commentary", "comment", "reaction"]);
    if (commentary.length > 180) {
      commentary = commentary.slice(0, 177) + "…";
    }
    return { word: word || "…", commentary, callVote, callVoteOnly };
  }

  const word = extractWordFromProse(raw);
  if (word) {
    return {
      word,
      commentary: extractCommentaryFromProse(raw),
      callVote: false,
      callVoteOnly: false,
    };
  }

  throw new Error(
    `Model did not return valid JSON. Got: ${raw.slice(0, 120)}…`
  );
}

export function parseEarlyBallotResponse(raw: string): ParsedEarlyBallot {
  const obj = tryParseObject(raw);
  if (obj) {
    const agree = pickBool(obj, ["agree", "yes", "accept"]);
    let line = pickString(obj, ["line", "commentary", "comment"]);
    if (line.length > 120) line = line.slice(0, 117) + "…";
    return { agree, line };
  }
  const lower = raw.toLowerCase();
  const agree = /\b(yes|agree|aye|true)\b/.test(lower) && !/\b(no|nay|false)\b/.test(lower);
  return { agree, line: "" };
}

export function parseVoteResponse(raw: string, voterId: PlayerId): ParsedVote {
  const obj = tryParseObject(raw);
  if (obj) {
    const accusedRaw = pickString(obj, [
      "accused",
      "accusedId",
      "vote",
      "target",
      "player",
    ]);
    const accusedId = resolveAccused(voterId, parsePlayerId(accusedRaw));
    let announcement = pickString(obj, [
      "announcement",
      "speech",
      "say",
      "voteSpeech",
    ]);
    if (!announcement) {
      announcement = pickString(obj, ["reasoning", "reason", "commentary"]);
    }
    if (announcement.length > 280) {
      announcement = announcement.slice(0, 277) + "…";
    }
    let reasoning = pickString(obj, ["reasoning", "reason"]);
    if (reasoning.length > 200) {
      reasoning = reasoning.slice(0, 197) + "…";
    }
    return { accusedId, announcement, reasoning };
  }

  for (const id of PLAYER_IDS) {
    if (id === voterId) continue;
    const re = new RegExp(`\\b${id}\\b`, "i");
    if (re.test(raw)) {
      return { accusedId: id, announcement: "", reasoning: "" };
    }
  }

  const accusedMatch = raw.match(
    /"accused"\s*:\s*"(chatgpt|claude|gemini|grok)"/i
  );
  if (accusedMatch) {
    const accusedId = resolveAccused(
      voterId,
      accusedMatch[1].toLowerCase() as PlayerId
    );
    return {
      accusedId,
      announcement: `I vote for ${accusedId}.`,
      reasoning: "",
    };
  }

  throw new Error(
    `Model did not return valid vote JSON. Got: ${raw.slice(0, 120)}…`
  );
}

export function parseDeliberationResponse(
  raw: string,
  speakerId: PlayerId
): ParsedDeliberation {
  const obj = tryParseObject(raw);
  if (obj) {
    let speech = pickString(obj, ["speech", "say", "line", "commentary"]);
    if (speech.length > 320) speech = speech.slice(0, 317) + "…";

    const accusesRaw = pickString(obj, [
      "accuses",
      "accused",
      "accusesId",
      "target",
    ]);
    const accusesId = parsePlayerId(accusesRaw) ?? undefined;
    const roleRaw = pickString(obj, ["role"]).toLowerCase();
    let role: ParsedDeliberation["role"] = "discuss";
    if (roleRaw.includes("accuse") || accusesId) role = "accuse";
    else if (roleRaw.includes("defend")) role = "defend";

    if (!speech) {
      speech = accusesId
        ? `I'm calling out ${accusesId} — something's off.`
        : "I don't buy this table at all.";
    }

    return {
      speech,
      accusesId: accusesId && accusesId !== speakerId ? accusesId : undefined,
      role,
    };
  }

  throw new Error(
    `Model did not return valid deliberation JSON. Got: ${raw.slice(0, 120)}…`
  );
}
