import { NextResponse } from "next/server";
import { ease, GameError, kick, openRound, pushNews, reset, setPhase, whale } from "@/lib/game";
import { PHASES, type Phase } from "@/lib/types";

import { errorResponse } from "@/lib/errors";

export const dynamic = "force-dynamic";

const passcode = () => process.env.ADMIN_PASSCODE || "aire";

export async function POST(req: Request) {
  if (req.headers.get("x-admin-key") !== passcode()) {
    return NextResponse.json({ error: "Wrong passcode." }, { status: 401 });
  }
  try {
    const b = await req.json();
    switch (b.action) {
      case "check":
        break;
      case "phase":
        if (!PHASES.some((p) => p.id === b.phase)) throw new GameError("Unknown phase.");
        await setPhase(b.phase as Phase);
        break;
      case "openRound":
        await openRound(true);
        break;
      case "ease":
        await ease();
        break;
      case "news":
        await pushNews(String(b.cardId));
        break;
      case "whale":
        await whale(b.side === "sell" ? "sell" : "buy");
        break;
      case "kick":
        await kick(String(b.id));
        break;
      case "reset":
        await reset();
        break;
      default:
        throw new GameError("Unknown action.");
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e, "admin");
  }
}
