import { NextResponse } from "next/server";
import { createGame } from "@/lib/game-engine";
import type { GameConfig } from "@/lib/types";
import { PLAYER_IDS } from "@/lib/types";
import { z } from "zod";

const schema = z.object({
  character: z.string().min(1).max(120),
  category: z.string().min(1).max(120),
  imposterId: z.enum(["chatgpt", "claude", "gemini", "grok"]),
  rounds: z.number().int().min(1).max(10).optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.parse(body);
    const config: GameConfig = {
      character: parsed.character,
      category: parsed.category,
      imposterId: parsed.imposterId,
      rounds: parsed.rounds ?? 3,
    };

    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: "OPENROUTER_API_KEY missing — copy .env.example to .env" },
        { status: 500 }
      );
    }

    const state = createGame(config);
    return NextResponse.json({ state });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({
    players: PLAYER_IDS,
    defaultRounds: 3,
  });
}
