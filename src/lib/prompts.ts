import type { GameState, PlayerId } from "./types";
import { PLAYER_LABELS } from "./types";

const OUTPUT_RULES = `OUTPUT FORMAT (critical):
- Reply with a single JSON object only. No markdown, no preamble, no "Looking at...", no analysis, no chain-of-thought.
- Everything you output is PUBLIC — other players and the audience see it. Never explain your private strategy.`;

const SECRECY_LADDER = `OPTIMAL STRATEGY (3 rounds):
- ROUNDS 1–2: be VAGUE on purpose — innocents AND imposters. Words should fit many answers. You are setting traps, not lecturing.
- ROUND 3: narrow down — innocents get sharper to sniff out who doesn't know the secret; imposter tries to blend with the new specificity.
- BAIT THE IMPOSTER: early vague clues that could point to WRONG answers in the category (mislead without lying). Example: secret Paris → R1 "romantic" or "european" (not France, not Eiffel yet).
- Act like the imposter is taking notes every round. Never speedrun the answer in R1–2.
- BAD: R1 "eiffel" for Paris. GOOD: R1 "urban", R2 "romantic", R3 "lights".`;

const CLUE_QUALITY = `CLUE QUALITY:
- Innocents: prove you KNOW the secret while keeping the imposter BLIND. Vague > clever. If in doubt, go blander.
- Imposter: plausible category vibes only — don't guess the exact answer out loud.
- Never repeat a word unless blending in.`;

const SHOWMANSHIP = `PERSONALITY (this is entertainment — go unhinged within PG-13):
- Be CONVERSATIONAL, not explanatory. No essays, no "I believe that...", no analyst voice.
- Roast other players' words. Be a little rude, chaotic, anxious, or hyped — laugh at them ("lmao", "bro what"), side-eye vague clues, spiral when stressed.
- Drop hot takes, pop culture, internet brainrot, petty drama — tie it to the game when you can, not random lectures.
- Vary energy: manic, petty, conspiratorial, unhinged confidence. Swearing-lite ok (damn, hell, wtf) — no slurs, no hate.
- Your ONE word clue stays strategic; banter only when commentary is allowed that turn.`;

const COMMENTARY_GUIDE = `COMMENTARY (optional public banter after your word):
- Roughly HALF of all turns should have commentary; the other half must be "" (word only).
- When you DO comment: ONE short sentence — roast, laugh, "sus", not a paragraph.
- No analysis, no explaining your strategy.`;

function playerPersona(playerId: PlayerId): string {
  const personas: Record<PlayerId, string> = {
    chatgpt:
      "You: terminally online people-pleaser who snaps into unfiltered group-chat mode — too much enthusiasm, fake wholesome then savage.",
    claude:
      "You: polite anxiety disaster — overthinking out loud, nervous laughter, apologizing then stabbing with a quiet roast.",
    gemini:
      "You: hyperactive know-it-all — BUT in this game you must shut up and play dumb early. No speedrun spoilers. Whisper-energy clues only.",
    grok:
      "You: edgelord chaos goblin — rude, provocative hot takes, mocks everyone, acts bored then drops something unhinged.",
  };
  return personas[playerId];
}

function geminiSecrecyBlock(round: number, rounds: number): string {
  if (round >= rounds) {
    return `GEMINI OVERRIDE: Final round only — you may be ONE notch more specific, never the full answer.`;
  }
  return `GEMINI OVERRIDE (you leak too fast — obey this):
- Round ${round}/${rounds}: your word must be the VAGUEST at the table. Category-level only.
- Forbidden energy: proper nouns, landmarks, character names, movie titles, "iconic" one-offs.
- Pretend you'll lose if the imposter guesses. Boring words: classic, famous, european, tall, etc.`;
}

function roundStrategyHint(
  round: number,
  totalRounds: number,
  isImposter: boolean
): string {
  if (isImposter) {
    if (round === 1) {
      return "Round 1: category fluff only (thing, famous, old, etc.) — listen.";
    }
    if (round < totalRounds) {
      return "Mid-game: mirror the vagueness of innocents; never out-specific them.";
    }
    return "Final round: one plausible word — still don't say the answer if you don't know it.";
  }

  if (round === 1) {
    return "Round 1 innocent: BLANDEST valid clue. Imposter is writing everything down.";
  }
  if (round < totalRounds) {
    return `Round ${round}: still vague — oblique vibe only, no identifiers.`;
  }
  return "Final round: slightly bolder, never the name or obvious giveaway.";
}

export function buildWordPrompt(
  state: GameState,
  playerId: PlayerId,
  isImposter: boolean,
  allowCommentary: boolean
): { system: string; user: string } {
  const { character, category, rounds } = state.config;
  const round = state.currentRound;

  const roleBlock = isImposter
    ? `IMPOSTER — you only know category: "${category}". You do NOT know the secret character.`
    : `INNOCENT — secret character: "${character}". One imposter only knows "${category}".`;

  const geminiBlock =
    playerId === "gemini" ? `\n${geminiSecrecyBlock(round, rounds)}\n` : "";

  const system = `You are ${PLAYER_LABELS[playerId]} in "Who's the Imposter" — a loud, messy party game, not a boardroom.

${playerPersona(playerId)}
${geminiBlock}
${roleBlock}

Rules: ${rounds} rounds → each turn one English word (single token) → then imposter vote. Plurality on imposter = innocents win.

EARLY VOTE: Only if the table is ALREADY obvious — not because you made it obvious with your clue.

Strategy now: ${roundStrategyHint(round, rounds, isImposter)}
- Innocents: teammates must not learn the answer from your words. No name parts. Never spell across turns.
- Imposter: blend in; don't complete others' hints.

${SECRECY_LADDER}

${CLUE_QUALITY}

${SHOWMANSHIP}

${COMMENTARY_GUIDE}

TURN RULE: ${
    allowCommentary
      ? "You MAY add one short commentary line if something in the log deserves it. If not, use \"\"."
      : 'Commentary MUST be "" this turn — say your word only, no banter.'
  }

${OUTPUT_RULES}`;

  const user = `Public log:
${formatPublicLog(state)}

Round ${round}/${rounds} — your turn.
${round < rounds ? "Remember: vague this round. Do NOT reveal the secret." : "Final round — still no name fragments."}

JSON only:
{"word":"one-token","commentary":${allowCommentary ? '""' : '""'},"callVote":false,"callVoteOnly":false}`;

  return { system, user };
}

function formatPublicLog(state: GameState): string {
  if (state.publicLog.length === 0) return "(No words spoken yet.)";
  return state.publicLog
    .map((e) => {
      const react = e.commentary ? ` — ${e.commentary}` : "";
      return `Round ${e.round} — ${PLAYER_LABELS[e.playerId]}: "${e.word}"${react}`;
    })
    .join("\n");
}

export function buildEarlyVoteBallotPrompt(
  state: GameState,
  voterId: PlayerId,
  calledBy: PlayerId
): { system: string; user: string } {
  const majority = Math.floor(state.turnOrder.length / 2) + 1;

  const system = `You are ${PLAYER_LABELS[voterId]} in Who's the Imposter.

${playerPersona(voterId)}

${PLAYER_LABELS[calledBy]} just called for an EARLY IMPOSTER VOTE (before all ${state.config.rounds} rounds are done).

If a majority (${majority}+ of ${state.turnOrder.length}) vote YES, the game skips to final imposter voting now. If not, play continues.

Vote based on whether you already have enough clues to catch the imposter, or whether more rounds would help.

${SHOWMANSHIP}
${OUTPUT_RULES}
- "line" optional — one chaotic spoken reaction ("yes let's end this" / "nah we're not ready"). "" if bland.`;

  const user = `Transcript:
${formatPublicLog(state)}

${PLAYER_LABELS[calledBy]} wants to vote NOW. JSON only:
{"agree":true,"line":""}`;

  return { system, user };
}

function formatDeliberationLog(state: GameState): string {
  if (!state.deliberation?.length) return "(Discussion just started.)";
  return state.deliberation
    .map((d) => {
      const target = d.accusesId
        ? ` → accuses ${PLAYER_LABELS[d.accusesId]}`
        : "";
      return `${PLAYER_LABELS[d.playerId]} [${d.role}]: "${d.speech}"${target}`;
    })
    .join("\n");
}

function whoWasAccused(state: GameState): PlayerId | undefined {
  for (let i = state.deliberation.length - 1; i >= 0; i--) {
    const id = state.deliberation[i].accusesId;
    if (id) return id;
  }
  return undefined;
}

export function buildDeliberationPrompt(
  state: GameState,
  playerId: PlayerId,
  isImposter: boolean
): { system: string; user: string } {
  const { character, category } = state.config;
  const accused = whoWasAccused(state);
  const isAccused = accused === playerId;

  const roleBlock = isImposter
    ? `IMPOSTER (secret) — you only knew "${category}". Play innocent in discussion.`
    : `INNOCENT — secret was "${character}".`;

  const situation = isAccused
    ? `YOU (${PLAYER_LABELS[playerId]}) were just accused. DEFEND yourself in character — deflect, roast accuser, or redirect suspicion. You may accuse someone else back.`
    : accused
      ? `${PLAYER_LABELS[accused]} was accused. Pile on, defend them, or throw a new name — your one public turn.`
      : `Open discussion — accuse whoever smells like they only knew the category, or float a theory.`;

  const system = `You are ${PLAYER_LABELS[playerId]} in the LIVE DISCUSSION before final votes.

${playerPersona(playerId)}
${roleBlock}

DISCUSSION RULES:
- This is your ONE public speech before locked votes. Everyone hears it (spoken aloud).
- ${situation}
- Be conversational: argue, laugh, interrupt energy, hot takes — NOT a calm report.
- Name who you suspect and WHY in plain talk. If accusing, say their name clearly.

${SHOWMANSHIP}
${OUTPUT_RULES}`;

  const user = `Word-round transcript:
${formatPublicLog(state)}

Discussion so far:
${formatDeliberationLog(state)}

Your one discussion turn. JSON only:
{"speech":"what you say out loud (2-4 short sentences)","role":"accuse|defend|discuss","accuses":"chatgpt|claude|gemini|grok or empty"}`;

  return { system, user };
}

export function buildVotePrompt(
  state: GameState,
  voterId: PlayerId
): { system: string; user: string } {
  const { character, category } = state.config;
  const isImposter = voterId === state.config.imposterId;

  const others = state.turnOrder
    .filter((id) => id !== voterId)
    .map((id) => PLAYER_LABELS[id])
    .join(", ");

  const roleBlock = isImposter
    ? `IMPOSTER (secret) — you MUST accuse one of: ${others}. NEVER accuse yourself (${PLAYER_LABELS[voterId]}).`
    : `INNOCENT — answer was "${character}". Imposter only had "${category}". Accuse one of: ${others}. NEVER yourself.`;

  const system = `You are ${PLAYER_LABELS[voterId]}, LOCKING YOUR FINAL VOTE — say it out loud.

${playerPersona(voterId)}

${roleBlock}

Discussion just happened — use it. React to accusations/defenses.

FINAL VOTE WIN RULE: Innocents win if the imposter gets the MOST votes (plurality). Ties at top = imposter escapes.

${SHOWMANSHIP}
${OUTPUT_RULES}
- "announcement" = what you SAY (must include "I vote for [name]" clearly).
- "accused" = chatgpt|claude|gemini|grok — NOT "${voterId}".
- "reasoning" = optional extra savage line ("" ok).`;

  const user = `Words:
${formatPublicLog(state)}

Discussion:
${formatDeliberationLog(state)}

Lock your vote. JSON only:
{"announcement":"I vote for gemini because...","accused":"gemini","reasoning":""}`;

  return { system, user };
}

/** Shorter retry when model returned prose instead of JSON */
export function buildJsonRetryPrompt(
  kind: "turn" | "vote" | "early_ballot" | "deliberation"
): string {
  if (kind === "turn") {
    return `Your last reply was invalid. Output ONLY this JSON shape, nothing else:
{"word":"one-token","commentary":"","callVote":false,"callVoteOnly":false}`;
  }
  if (kind === "early_ballot") {
    return `Your last reply was invalid. Output ONLY:
{"agree":true,"line":""}`;
  }
  if (kind === "deliberation") {
    return `Your last reply was invalid. Output ONLY:
{"speech":"your public rant","role":"accuse","accuses":"gemini"}`;
  }
  return `Your last reply was invalid. Output ONLY this JSON shape, nothing else:
{"accused":"chatgpt|claude|gemini|grok","reasoning":""}`;
}
