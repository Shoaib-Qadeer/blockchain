"use client";

import { AnimatePresence, motion } from "framer-motion";
import { sha256 } from "js-sha256";
import { useEffect, useMemo, useRef, useState } from "react";
import { buzz } from "@/lib/confetti";
import { ROUNDS, TOTAL_ROUNDS } from "@/lib/rounds";
import { PHASES, type Phase } from "@/lib/types";
import { Fingerprint } from "./Chain";

const order = (p: Phase) => PHASES.findIndex((x) => x.id === p);

/**
 * When a round starts, every screen shows what to do now and what the previous round showed.
 * Appears on a phase change (or on load if the round only just began). Tap to dismiss.
 */
export function RoundBanner({ phase, startedAt, now, big = false }: { phase: Phase; startedAt?: number; now: number; big?: boolean }) {
  const [shown, setShown] = useState<Phase | null>(null);
  const seen = useRef<Phase | null>(null);

  useEffect(() => {
    if (seen.current === phase) return;
    const first = seen.current === null;
    seen.current = phase;
    if (phase === "lobby") return;
    if (first && startedAt && now - startedAt > 8000) return; // joined mid-round: don't block the screen
    setShown(phase);
    buzz([30, 50, 30]);
  }, [phase, startedAt, now]);

  // auto-close: keyed on what's shown, so the clock ticking doesn't restart it
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(null), big ? 5500 : 6000);
    return () => clearTimeout(t);
  }, [shown, big]);

  const r = shown ? ROUNDS[shown] : null;
  const prev = shown ? PHASES[order(shown) - 1] : undefined;
  const lesson = prev ? ROUNDS[prev.id].lesson : null;

  return (
    <AnimatePresence>
      {r && shown && (
        <motion.div
          key={shown}
          role="dialog"
          aria-label={r.title}
          onClick={() => setShown(null)}
          className="fixed inset-0 z-[45] flex items-center justify-center bg-paper/80 p-5 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.3 } }}
        >
          <motion.div
            initial={{ y: 60, rotate: -4, scale: 0.9 }}
            animate={{ y: 0, rotate: -1, scale: 1 }}
            exit={{ y: -40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            className={`flex flex-col ${big ? "w-[min(1100px,90vw)] gap-8" : "w-full max-w-sm gap-4"}`}
          >
            {lesson && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                className={`sheet !bg-hl-mint ${big ? "p-8" : "p-4"}`}
              >
                <div className={`font-extrabold ${big ? "text-3xl" : "text-sm"}`}>What you just saw</div>
                <p className={`mt-1 leading-snug ${big ? "text-4xl" : "text-base"}`}>{lesson}</p>
              </motion.div>
            )}
            <div className={`sheet tape relative ${big ? "p-10" : "p-5"}`}>
              {r.number && (
                <div className={`font-bold text-ink-soft ${big ? "text-3xl" : "text-sm"}`}>
                  Round {r.number} of {TOTAL_ROUNDS}
                </div>
              )}
              <h2 className={`display mt-1 font-extrabold ${big ? "text-[110px]" : "text-5xl"}`}>{r.title}</h2>
              <p className={`mt-3 leading-snug ${big ? "text-4xl" : "text-lg"}`}>{r.goal}</p>
              {!big && <p className="mt-4 text-sm font-semibold text-ink-soft">Tap anywhere to start</p>}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Time left in the round (autopilot only). Turns red in the last 10 seconds. */
export function Countdown({ endsAt, startedAt, now, big = false }: { endsAt?: number | null; startedAt?: number; now: number; big?: boolean }) {
  if (!endsAt || !startedAt) return null;
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const frac = Math.min(1, Math.max(0, (endsAt - now) / (endsAt - startedAt)));
  const hot = left <= 10;
  const label = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  if (big) {
    return (
      <div className={`flex items-center gap-3 rounded-full border-2 border-ink px-4 py-1 ${hot ? "bg-hl-pink" : "bg-sheet"}`} aria-label={`${left} seconds left`}>
        <div className="h-3 w-40 overflow-hidden rounded-full border-2 border-ink bg-paper">
          <div className="h-full bg-ink transition-[width] duration-300 ease-linear" style={{ width: `${frac * 100}%` }} />
        </div>
        <span className="mono text-3xl font-extrabold tabular-nums">{label}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2" aria-label={`${left} seconds left`}>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-rule">
        <div className={`h-full transition-[width] duration-300 ease-linear ${hot ? "bg-bad" : "bg-ink"}`} style={{ width: `${frac * 100}%` }} />
      </div>
      <span className={`mono text-sm font-extrabold tabular-nums ${hot ? "text-bad" : ""}`}>{label}</span>
    </div>
  );
}

/**
 * Waiting-room activity: the one idea everything else rests on.
 * Type anything → its SHA-256 fingerprint. Change one letter → almost every character changes.
 */
export function HashPlayground({ initial }: { initial: string }) {
  const [text, setText] = useState(initial);
  const [prevHash, setPrevHash] = useState<string | null>(null);
  const hash = useMemo(() => sha256(text), [text]);
  const last = useRef(hash);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    if (last.current !== hash) {
      setPrevHash(last.current);
      last.current = hash;
      setTries((t) => t + 1);
    }
  }, [hash]);

  const changed = prevHash ? hash.split("").filter((c, i) => c !== prevHash[i]).length : 0;

  return (
    <div className="sheet tape relative flex flex-col gap-3 p-5">
      <h2 className="display text-3xl font-extrabold">Every block has a fingerprint</h2>
      <p className="leading-snug">
        Type anything. Then change <b>one</b> letter and watch the fingerprint.
      </p>
      <input
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 40))}
        autoComplete="off"
        className="rounded-lg border-2 border-ink bg-paper px-3 py-2.5 text-lg font-semibold outline-none"
        aria-label="Text to fingerprint"
      />
      <div className="flex items-center gap-3">
        <motion.div key={hash} initial={{ rotate: -40, scale: 0.7 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 14 }}>
          <Fingerprint hash={hash} size={58} />
        </motion.div>
        <div className="mono min-w-0 flex-1 break-all text-[13px] leading-tight">
          {hash.split("").map((c, i) => (
            <span key={i} className={prevHash && prevHash[i] !== c ? "font-bold text-ink" : "text-ink-faint"}>
              {c}
            </span>
          ))}
        </div>
      </div>
      <AnimatePresence mode="wait">
        {tries > 0 && (
          <motion.p key={hash} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="text-sm leading-snug">
            <span className="hl font-bold">{changed} of 64</span> characters changed. A tiny edit gives a totally different fingerprint, so nobody can quietly change a block.
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
