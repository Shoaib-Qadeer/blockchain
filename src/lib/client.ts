"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Game, Player, StateResponse } from "./types";

export type Live = {
  game: Game;
  players: Player[];
  byId: Map<string, Player>;
  /** add to Date.now() to get server time */
  offset: number;
  online: boolean;
};

/** Every screen polls one endpoint and re-renders when the shared tick moves. */
export function useLive(pollMs = 650) {
  const [live, setLive] = useState<Live | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tick = useRef(-1);
  const kick = useRef<() => void>(() => {});

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    const loop = async () => {
      clearTimeout(timer);
      const sent = Date.now();
      try {
        const r = await fetch(`/api/state?t=${tick.current}`, { cache: "no-store" });
        const body = (await r.json()) as StateResponse & { error?: string };
        if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
        const offset = body.serverNow - (sent + Date.now()) / 2;
        failures = 0;
        if (!alive) return;
        setError(null);
        if (body.same) {
          setLive((l) => (l ? { ...l, offset, online: true } : l));
        } else if (body.game && body.players) {
          tick.current = body.tick;
          const byId = new Map(body.players.map((p) => [p._id, p]));
          setLive({ game: body.game, players: body.players, byId, offset, online: true });
        }
      } catch (e) {
        failures++;
        if (!alive) return;
        setError((e as Error).message);
        setLive((l) => (l ? { ...l, online: false } : l));
      }
      if (alive) timer = setTimeout(loop, failures ? Math.min(4000, 800 * failures) : pollMs);
    };
    kick.current = () => {
      if (alive) loop();
    };
    loop();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [pollMs]);

  /** fetch right away (after an action) instead of waiting for the next poll */
  const refresh = useCallback(() => kick.current(), []);
  return { live, error, refresh };
}

export async function api<T = Record<string, unknown>>(path: string, body: unknown, headers: Record<string, string> = {}) {
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const data = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(data.error || `Something went wrong (${r.status}).`);
  return data;
}

export type Identity = { id: string; token: string; gameId: number };
const KEY = "aircoin-identity";

export function loadIdentity(): Identity | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Identity) : null;
  } catch {
    return null;
  }
}
export function saveIdentity(i: Identity | null) {
  try {
    if (i) localStorage.setItem(KEY, JSON.stringify(i));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: identity lives only for this tab */
  }
}

/** Server-synchronised clock that re-renders every `ms`. */
export function useNow(offset: number, ms = 250) {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + offset), ms);
    return () => clearInterval(t);
  }, [offset, ms]);
  return now;
}

export const fmt = (n: number, d = 2) =>
  n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtAir = (n: number) => (Math.abs(n) >= 100 || Number.isInteger(n) ? fmt(n, 0) : fmt(n, 1));

export function currentPrice(game: Game) {
  const m = game.market;
  if (!m) return 1;
  return m.pool.eur / m.pool.air;
}

export function netWorth(p: Player, price: number) {
  return p.eur + p.air * price;
}
