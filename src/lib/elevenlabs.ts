import { getVoiceId } from "./players";
import type { PlayerId } from "./types";

const TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech";

export async function synthesizeSpeech(
  playerId: PlayerId,
  text: string
): Promise<ArrayBuffer | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = getVoiceId(playerId);

  if (!apiKey || !voiceId) {
    return null;
  }

  const res = await fetch(`${TTS_URL}/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.75,
        style: 0.35,
        use_speaker_boost: true,
      },
    }),
  });

  if (!res.ok) {
    console.warn(`ElevenLabs TTS failed for ${playerId}:`, await res.text());
    return null;
  }

  return res.arrayBuffer();
}

export function bufferToBase64(buffer: ArrayBuffer): string {
  return Buffer.from(buffer).toString("base64");
}
