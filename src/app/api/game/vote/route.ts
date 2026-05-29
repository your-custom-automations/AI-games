import { NextResponse } from "next/server";
import { runVotePhase } from "@/lib/game-engine";
import type { GameState } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const { state } = (await req.json()) as { state: GameState };

    if (!state || state.phase !== "voting") {
      return NextResponse.json({ error: "Game must be in voting phase" }, { status: 400 });
    }

    const next = await runVotePhase(state);
    return NextResponse.json({ state: next });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Vote failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
