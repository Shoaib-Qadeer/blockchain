import { NextResponse } from "next/server";
import { autoAdvance, getGame, listPlayers } from "@/lib/game";
import type { StateResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store, max-age=0" };

export async function GET(req: Request) {
  try {
    const t = Number(new URL(req.url).searchParams.get("t") ?? -1);
    let game = await getGame();
    if (await autoAdvance(game)) game = await getGame();
    if (game.tick === t) {
      const same: StateResponse = { same: true, serverNow: Date.now(), tick: game.tick };
      return NextResponse.json(same, { headers: noStore });
    }
    const players = await listPlayers();
    const body: StateResponse = { serverNow: Date.now(), tick: game.tick, game, players };
    return NextResponse.json(body, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
