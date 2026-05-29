import { NextResponse } from "next/server";
import { runDeliberationTurn } from "@/lib/game-engine";
import type { GameState } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const { state } = (await req.json()) as { state: GameState };

    if (!state || state.phase !== "deliberation") {
      return NextResponse.json({ error: "Not in deliberation phase" }, { status: 400 });
    }

    const result = await runDeliberationTurn(state);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Deliberation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
