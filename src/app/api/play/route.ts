import { NextResponse } from "next/server";
import { join, reportWork, send, setTamper, submitNonce, trade } from "@/lib/game";

import { errorResponse } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const b = await req.json();
    switch (b.type) {
      case "join":
        return NextResponse.json(await join(b.name));
      case "send":
        return NextResponse.json(await send(b.id, b.token, b.to, b.amount));
      case "work":
        return NextResponse.json(await reportWork(b.id, b.token, b.roundId, b.hashes));
      case "submit":
        return NextResponse.json(await submitNonce(b.id, b.token, b.roundId, b.nonce));
      case "tamper":
        return NextResponse.json(await setTamper(b.id, b.token, b.on));
      case "trade":
        return NextResponse.json(await trade(b.id, b.token, b.side, b.fraction));
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) {
    return errorResponse(e, "play");
  }
}
