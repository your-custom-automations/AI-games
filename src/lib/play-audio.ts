/** Play TTS audio and resolve only after playback ends (or on error). */
export function playAudioAndWait(base64: string): Promise<void> {
  return new Promise((resolve) => {
    const audio = new Audio(`data:audio/mpeg;base64,${base64}`);
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(safety);
      resolve();
    };
    const safety = setTimeout(finish, 45_000);
    audio.addEventListener("ended", finish);
    audio.addEventListener("error", finish);
    audio.play().catch(finish);
  });
}

/** Fallback pause when TTS is unavailable — scales with line length. */
export function pauseForReading(word: string, commentary: string): Promise<void> {
  const ms = Math.min(5000, 900 + (word.length + commentary.length) * 45);
  return new Promise((r) => setTimeout(r, ms));
}

export async function waitForTurnAudio(
  word: string,
  commentary: string,
  audioBase64?: string
): Promise<void> {
  if (audioBase64) {
    await playAudioAndWait(audioBase64);
  } else {
    await pauseForReading(word, commentary);
  }
}
