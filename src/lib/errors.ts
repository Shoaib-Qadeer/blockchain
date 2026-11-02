import { NextResponse } from "next/server";
import { GameError } from "./game";

/** What players see when something breaks on the server. Never includes config or database details. */
export const PUBLIC_DOWN = "The game server is having trouble. Please wait a moment and try again.";

/**
 * Game rule messages ("Not enough AIR") are safe to show.
 * Anything else (database, config) is logged privately — visible in Vercel → Logs — and replaced with a generic message.
 */
export function errorResponse(e: unknown, where: string) {
  if (e instanceof GameError) {
    return NextResponse.json({ error: e.message }, { status: e.status, headers: { "Cache-Control": "no-store" } });
  }
  console.error(`[aircoin] ${where} failed:`, e instanceof Error ? e.message : e);
  return NextResponse.json({ error: PUBLIC_DOWN }, { status: 500, headers: { "Cache-Control": "no-store" } });
}
