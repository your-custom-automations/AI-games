/** Block clues that gift the answer too early (innocents only). */
export function isWordTooRevealing(
  word: string,
  character: string,
  round: number,
  totalRounds: number,
  isImposter: boolean
): boolean {
  if (isImposter) return false;

  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w || w.length < 3 || w === "…") return false;

  const charLower = character.toLowerCase();
  const parts = charLower.split(/[\s,.'-]+/).filter((p) => p.length > 2);

  for (const part of parts) {
    if (w === part || w.includes(part) || part.includes(w)) {
      return true;
    }
  }

  const compact = charLower.replace(/[^a-z]/g, "");
  if (round < totalRounds && compact.includes(w) && w.length >= 4) {
    return true;
  }

  return false;
}

export function buildVaguenessRetryLine(
  word: string,
  round: number,
  totalRounds: number
): string {
  return `REJECTED: "${word}" is too specific for round ${round}/${totalRounds}. The imposter must NOT be able to guess the answer from that. Pick a vaguer one-token clue that could fit many possibilities in the category. JSON only.`;
}
