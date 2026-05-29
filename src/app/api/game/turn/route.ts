import { NextResponse } from "next/server";
import { runTurn, isGamePlayComplete } from "@/lib/game-engine";
import type { GameState } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const { state } = (await req.json()) as { state: GameState };

    if (!state || state.phase !== "playing") {
      return NextResponse.json({ error: "Invalid game state" }, { status: 400 });
    }

    if (isGamePlayComplete(state)) {
      return NextResponse.json({
        state: { ...state, phase: "voting" as const },
        done: true,
      });
    }

    const result = await runTurn(state);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Turn failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
