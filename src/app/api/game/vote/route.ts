import { NextResponse } from "next/server";
import {
  runFinalVoteTurn,
  runFullVotingSequence,
} from "@/lib/game-engine";
import type { GameState } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const { state, all } = (await req.json()) as {
      state: GameState;
      all?: boolean;
    };

    if (!state) {
      return NextResponse.json({ error: "Invalid game state" }, { status: 400 });
    }

    if (all) {
      if (
        state.phase !== "deliberation" &&
        state.phase !== "final_vote"
      ) {
        return NextResponse.json(
          { error: "Not in voting sequence" },
          { status: 400 }
        );
      }
      const next = await runFullVotingSequence(state);
      return NextResponse.json({ state: next });
    }

    if (state.phase !== "final_vote") {
      return NextResponse.json(
        { error: "Finish discussion first, or use deliberate endpoint" },
        { status: 400 }
      );
    }

    const result = await runFinalVoteTurn(state);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Vote failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
