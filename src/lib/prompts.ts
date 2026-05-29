import type { GameState, PlayerId } from "./types";
import { PLAYER_LABELS } from "./types";

const OUTPUT_RULES = `OUTPUT FORMAT (critical):
- Reply with a single JSON object only. No markdown, no preamble, no "Looking at...", no analysis, no chain-of-thought.
- Everything you output is PUBLIC — other players and the audience see it. Never explain your private strategy.`;

function formatPublicLog(state: GameState): string {
  if (state.publicLog.length === 0) return "(No words spoken yet.)";
  return state.publicLog
    .map((e) => {
      const react = e.commentary ? ` — ${e.commentary}` : "";
      return `Round ${e.round} — ${PLAYER_LABELS[e.playerId]}: "${e.word}"${react}`;
    })
    .join("\n");
}

function roundStrategyHint(
  round: number,
  totalRounds: number,
  isImposter: boolean
): string {
  if (isImposter) {
    if (round === 1) {
      return "Round 1: broad category words only; listen more than you reveal.";
    }
    if (round <= Math.floor(totalRounds / 2)) {
      return "Mid-game: match the table's vagueness; don't out-specific innocents.";
    }
    if (round < totalRounds) {
      return "Late-mid: narrow carefully; never complete a name someone started.";
    }
    return "Final round: one plausible word; don't gift the answer.";
  }

  if (round === 1) {
    return "Round 1: stay vague — imposter is listening.";
  }
  if (round <= 2) {
    return "Early game: oblique hints only (vibe, era, job type) — no name fragments.";
  }
  if (round < totalRounds) {
    return "Mid/late: slightly sharper OK if still ambiguous; never spell the answer.";
  }
  return "Final round: a bit bolder OK; still no full name or obvious fragments.";
}

export function buildWordPrompt(
  state: GameState,
  playerId: PlayerId,
  isImposter: boolean
): { system: string; user: string } {
  const { character, category, rounds } = state.config;
  const others = state.turnOrder.filter((id) => id !== playerId);
  const round = state.currentRound;

  const roleBlock = isImposter
    ? `IMPOSTER — you only know category: "${category}". You do NOT know the secret character.`
    : `INNOCENT — secret character: "${character}". One imposter only knows "${category}".`;

  const system = `You are ${PLAYER_LABELS[playerId]} in "Who's the Imposter".

${roleBlock}

Rules: ${rounds} rounds → each turn one English word (single token) → then imposter vote. Majority catches imposter = innocents win; else imposter wins.

EARLY VOTE (optional): If the answer feels obvious (or someone is clearly exposed), you may call an early imposter vote before all rounds end.
- Set "callVote": true on your turn — with your word (after clue) OR with "callVoteOnly": true to motion without saying a clue (before your word).
- All four players then vote yes/no; if a MAJORITY agrees, rounds stop and imposter voting begins. If not, play continues.
- Do not call early vote in round 1 unless the table is already blatantly compromised.

Strategy now: ${roundStrategyHint(round, rounds, isImposter)}
- Innocents: prove you know the answer without teaching the imposter. No name parts. Never spell across turns (e.g. "Chris" then "Hemsworth").
- Imposter: blend in; don't complete others' hints.

${OUTPUT_RULES}
- "commentary" is OPTIONAL. Omit it or use "" unless something another player said genuinely deserves a short public reaction (doubt, laugh, call-out). One short sentence max. Most turns: word only.`;

  const user = `Public log:
${formatPublicLog(state)}

Round ${round}/${rounds} — your turn.

JSON only (commentary optional; callVote usually false):
{"word":"one-token","commentary":"","callVote":false,"callVoteOnly":false}`;

  return { system, user };
}

export function buildEarlyVoteBallotPrompt(
  state: GameState,
  voterId: PlayerId,
  calledBy: PlayerId
): { system: string; user: string } {
  const majority = Math.floor(state.turnOrder.length / 2) + 1;

  const system = `You are ${PLAYER_LABELS[voterId]} in Who's the Imposter.

${PLAYER_LABELS[calledBy]} just called for an EARLY IMPOSTER VOTE (before all ${state.config.rounds} rounds are done).

If a majority (${majority}+ of ${state.turnOrder.length}) vote YES, the game skips to final imposter voting now. If not, play continues.

Vote based on whether you already have enough clues to catch the imposter, or whether more rounds would help.

${OUTPUT_RULES}
- "line" is optional public quip ("" if none).`;

  const user = `Transcript:
${formatPublicLog(state)}

${PLAYER_LABELS[calledBy]} wants to vote NOW. JSON only:
{"agree":true,"line":""}`;

  return { system, user };
}

export function buildVotePrompt(
  state: GameState,
  voterId: PlayerId
): { system: string; user: string } {
  const { character, category, rounds } = state.config;
  const isImposter = voterId === state.config.imposterId;
  const majority = Math.floor(state.turnOrder.length / 2) + 1;

  const roleBlock = isImposter
    ? `IMPOSTER (secret) — vote for someone else, NOT yourself.`
    : `INNOCENT — answer was "${character}". Imposter only had "${category}".`;

  const system = `You are ${PLAYER_LABELS[voterId]}, final vote.

${roleBlock}

Majority (${majority}+ votes) on the real imposter = innocents win.

${OUTPUT_RULES}
- "reasoning" is OPTIONAL — omit or "" unless you want one brief public line. No essay.`;

  const user = `Transcript:
${formatPublicLog(state)}

JSON only:
{"accused":"chatgpt|claude|gemini|grok","reasoning":""}`;

  return { system, user };
}

/** Shorter retry when model returned prose instead of JSON */
export function buildJsonRetryPrompt(
  kind: "turn" | "vote" | "early_ballot"
): string {
  if (kind === "turn") {
    return `Your last reply was invalid. Output ONLY this JSON shape, nothing else:
{"word":"one-token","commentary":"","callVote":false,"callVoteOnly":false}`;
  }
  if (kind === "early_ballot") {
    return `Your last reply was invalid. Output ONLY:
{"agree":true,"line":""}`;
  }
  return `Your last reply was invalid. Output ONLY this JSON shape, nothing else:
{"accused":"chatgpt|claude|gemini|grok","reasoning":""}`;
}
