"use client";

import { AnimatePresence, motion } from "framer-motion";
import { sha256 } from "js-sha256";
import { useCallback, useEffect, useRef, useState } from "react";
import { headerPrefix, meetsTarget } from "@/lib/chain";
import { api, type Identity } from "@/lib/client";
import { buzz, celebrate } from "@/lib/confetti";
import type { Game, Player } from "@/lib/types";
import { LeadingZeros } from "./Chain";

function leading(h: string) {
  let n = 0;
  while (h[n] === "0") n++;
  return n;
}

/** Real proof of work: every tap hashes the block with random numbers until one fingerprint starts with enough zeros. */
export function easeFactor(openedAt: number, now: number) {
  return 2 ** Math.min(6, Math.max(0, Math.floor((now - openedAt - 14_000) / 4_000)));
}

export function MinerPad({ game, me, ident, now }: { game: Game; me: Player; ident: Identity; now: number }) {
  const m = game.mining;
  const [tries, setTries] = useState(0);
  const [last, setLast] = useState<string>("");
  const [best, setBest] = useState<string>("");
  const [sprays, setSprays] = useState<{ id: number; h: string; x: number }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const nonce = useRef(0);
  const pendingWork = useRef(0);
  const round = useRef<string | null>(null);
  const sprayId = useRef(0);
  const celebrated = useRef<string | null>(null);

  // new round → fresh counters and a random starting point for this miner
  useEffect(() => {
    if (!m || m.roundId === round.current) return;
    round.current = m.roundId;
    nonce.current = Math.floor(Math.random() * 1e9);
    setTries(0);
    setLast("");
    setBest("");
    setSubmitting(false);
  }, [m]);

  // report hashing power every second so the big screen can show it
  useEffect(() => {
    const t = setInterval(() => {
      const hashes = pendingWork.current;
      if (!hashes || !round.current) return;
      pendingWork.current = 0;
      api("/api/play", { type: "work", ...ident, roundId: round.current, hashes }).catch(() => {});
    }, 1000);
    return () => clearInterval(t);
  }, [ident]);

  // celebrate whoever wins
  useEffect(() => {
    if (m?.status === "won" && m.winner && celebrated.current !== m.roundId) {
      celebrated.current = m.roundId;
      if (m.winner.id === me._id) {
        celebrate(true);
        buzz([40, 60, 40, 60, 120]);
      } else buzz(30);
    }
  }, [m, me._id]);

  const open = m?.status === "open";
  const perTap = m ? Math.round(m.hashesPerTap * m.boost * easeFactor(m.openedAt, now)) : 0;

  const tap = useCallback(async () => {
    if (!m || m.status !== "open" || submitting) return;
    buzz(8);
    const prefix = headerPrefix(m.index, m.prevHash, m.txs, me._id);
    const count = Math.round(m.hashesPerTap * m.boost * easeFactor(m.openedAt, Date.now()));
    let bestHere = "";
    let found: { nonce: number; hash: string } | null = null;
    const shown: string[] = [];
    for (let i = 0; i < count; i++) {
      const n = nonce.current++;
      const h = sha256(prefix + n);
      if (i % Math.max(1, Math.floor(count / 3)) === 0) shown.push(h);
      if (!bestHere || leading(h) > leading(bestHere)) bestHere = h;
      if (meetsTarget(h, m.zeros)) {
        found = { nonce: n, hash: h };
        break;
      }
    }
    pendingWork.current += count;
    setTries((t) => t + count);
    setLast(found?.hash ?? shown[shown.length - 1] ?? bestHere);
    setBest((b) => (!b || leading(bestHere) > leading(b) ? bestHere : b));
    setSprays((s) => [
      ...s.slice(-6),
      ...shown.slice(0, 2).map((h) => ({ id: sprayId.current++, h, x: Math.random() * 80 - 40 })),
    ]);

    if (found) {
      setSubmitting(true);
      try {
        await api("/api/play", { type: "submit", ...ident, roundId: m.roundId, nonce: found.nonce });
      } catch {
        setSubmitting(false);
      }
    }
  }, [m, me._id, ident, submitting]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        tap();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tap]);

  if (!m) {
    return (
      <div className="sheet p-5 text-center">
        <div className="text-4xl">⏳</div>
        <p className="mt-2 font-semibold">Waiting for the host to open a block…</p>
      </div>
    );
  }

  const target = "0".repeat(m.zeros);
  const won = m.status === "won" && m.winner;

  return (
    <div className="flex flex-col gap-4">
      <div className="sheet tape relative p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="display text-3xl font-extrabold">Block {m.index}</h2>
          <span className="text-sm font-semibold text-ink-soft">{m.txs.length} payments inside</span>
        </div>
        <p className="mt-2 text-[15px] leading-snug">
          Seal it by finding a fingerprint that starts with{" "}
          <span className="mono hl font-extrabold">{target}</span>. There is no trick — only guessing.
        </p>
        <div className="mt-3 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 text-sm">
          <span className="text-ink-soft">last guess</span>
          <LeadingZeros hash={last || "––––––––––––"} zeros={m.zeros} className="text-base" />
          <span className="text-ink-soft">your best</span>
          <LeadingZeros hash={best || "––––––––––––"} zeros={m.zeros} className="text-base" />
          <span className="text-ink-soft">guesses</span>
          <span className="mono font-bold">{tries.toLocaleString("en-US")}</span>
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {won ? (
          <motion.div
            key={`won-${m.roundId}`}
            initial={{ scale: 0.6, opacity: 0, rotate: -6 }}
            animate={{ scale: 1, opacity: 1, rotate: -1.5 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 300, damping: 15 }}
            className={`sheet flex min-h-44 flex-col justify-center p-4 text-center ${m.winner!.id === me._id ? "!bg-hl-mint" : ""}`}
          >
            <div className="display text-4xl font-extrabold">
              {m.winner!.id === me._id ? "You sealed it! +5 AIR" : `${m.winner!.name} sealed block ${m.index}`}
            </div>
            <div className="mt-2 text-sm">
              lucky number <span className="mono font-bold">{m.winner!.nonce}</span> gave{" "}
              <LeadingZeros hash={m.winner!.hash} zeros={m.zeros} />
            </div>
            <div className="mt-2 text-sm text-ink-soft">
              {game.pending.length ? "Next block opens in a moment…" : "Send more AIR to fill the next block."}
            </div>
          </motion.div>
        ) : (
          <motion.div key={`pad-${m.roundId}`} className="relative" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <AnimatePresence>
              {sprays.map((s) => (
                <motion.span
                  key={s.id}
                  className="mono pointer-events-none absolute left-1/2 top-2 z-10 rounded bg-sheet/90 px-1.5 text-xs text-ink-soft"
                  initial={{ x: s.x, y: 0, opacity: 1 }}
                  animate={{ x: s.x * 2.4, y: -110, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.9, ease: "easeOut" }}
                  onAnimationComplete={() => setSprays((l) => l.filter((x) => x.id !== s.id))}
                >
                  {s.h.slice(0, 8)}
                </motion.span>
              ))}
            </AnimatePresence>
            <motion.button
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                tap();
              }}
              disabled={!open || submitting}
              whileTap={{ scale: 0.94, rotate: -1.5 }}
              className="btn flex h-44 w-full flex-col items-center justify-center bg-hl-yellow text-ink"
            >
              <span className="display text-5xl font-extrabold">{submitting ? "Found it!" : "Tap to guess"}</span>
              {!submitting && <span className="mt-2 text-sm font-semibold">each tap tries {perTap.toLocaleString("en-US")} random numbers</span>}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
