"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Live } from "@/lib/client";
import { NEWS } from "@/lib/news";
import { PHASES, type Phase } from "@/lib/types";

const KEY = "aircoin-admin";

/** The presenter's remote: floats over the projector view, or works on a teammate's phone. Press H to hide. */
export function AdminDock({ live, refresh }: { live: Live; refresh: () => void }) {
  const [key, setKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [people, setPeople] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // reserve room at the bottom of the projector so the dock never hides the ledger or the chart
  useEffect(() => {
    const root = document.documentElement;
    const el = box.current;
    if (!open || !el) {
      root.style.setProperty("--dock-h", "0px");
      return;
    }
    const ro = new ResizeObserver(() => root.style.setProperty("--dock-h", `${el.offsetHeight + 24}px`));
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.setProperty("--dock-h", "0px");
    };
  }, [open, key]);

  useEffect(() => {
    try {
      setKey(localStorage.getItem(KEY));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "h" || e.key === "H") setOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const run = useCallback(
    async (label: string, body: Record<string, unknown>) => {
      if (!key) return;
      setBusy(label);
      setErr("");
      try {
        await api("/api/admin", body, { "x-admin-key": key });
        refresh();
      } catch (e) {
        setErr((e as Error).message);
        if ((e as Error).message.includes("passcode")) {
          setKey(null);
          localStorage.removeItem(KEY);
        }
      } finally {
        setBusy(null);
      }
    },
    [key, refresh]
  );

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api("/api/admin", { action: "check" }, { "x-admin-key": draft });
      localStorage.setItem(KEY, draft);
      setKey(draft);
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const { game } = live;
  const idx = PHASES.findIndex((p) => p.id === game.phase);
  const go = (p: Phase) => run(`phase-${p}`, { action: "phase", phase: p });

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="fixed right-4 bottom-4 z-50 h-10 w-10 rounded-full border-2 border-ink bg-sheet text-lg opacity-30 hover:opacity-100" aria-label="Show controls">
        ⚙
      </button>
    );
  }

  return (
    <motion.div
      ref={box}
      initial={{ y: 120 }}
      animate={{ y: 0 }}
      className="fixed inset-x-2 bottom-2 z-50 mx-auto max-w-5xl rounded-2xl border-2 border-ink bg-sheet/95 p-3 shadow-[0_6px_0_var(--color-ink)] backdrop-blur sm:inset-x-4 sm:bottom-4"
    >
      {!key ? (
        <form onSubmit={unlock} className="flex flex-wrap items-center gap-2">
          <span className="font-bold">Presenter controls</span>
          <input
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Passcode"
            className="min-w-0 flex-1 rounded-lg border-2 border-ink px-3 py-2"
          />
          <button className="btn bg-hl-yellow px-4 py-2">Unlock</button>
          {err && <span className="w-full text-sm font-semibold text-bad">{err}</span>}
        </form>
      ) : (
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={idx <= 0 || !!busy}
              onClick={() => go(PHASES[idx - 1].id)}
              className="btn bg-sheet px-3 py-1.5 text-sm"
              aria-label="Previous step"
            >
              ←
            </button>
            {PHASES.map((p, i) => (
              <button
                key={p.id}
                type="button"
                disabled={!!busy}
                onClick={() => go(p.id)}
                className={`chip px-3 py-1.5 text-sm ${i === idx ? "" : "bg-sheet"}`}
                data-on={i === idx}
              >
                {i + 1}. {p.label}
              </button>
            ))}
            <button
              type="button"
              disabled={idx >= PHASES.length - 1 || !!busy}
              onClick={() => go(PHASES[idx + 1].id)}
              className="btn bg-hl-yellow px-4 py-1.5 text-sm"
            >
              Next: {PHASES[Math.min(idx + 1, PHASES.length - 1)].label}
            </button>
            <span className="flex-1" />
            <button type="button" onClick={() => setPeople((v) => !v)} className="chip bg-sheet px-3 py-1.5 text-sm" data-on={people}>
              {live.players.length} nodes
            </button>
            <button type="button" onClick={() => setOpen(false)} className="chip bg-sheet px-3 py-1.5 text-sm" title="Hide (H)">
              Hide
            </button>
          </div>

          {game.phase === "mine" && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <button type="button" disabled={!!busy || game.mining?.status === "open"} onClick={() => run("round", { action: "openRound" })} className="btn bg-hl-mint px-3 py-1.5">
                Open next block
              </button>
              <button type="button" disabled={!!busy || game.mining?.status !== "open"} onClick={() => run("ease", { action: "ease" })} className="btn bg-sheet px-3 py-1.5">
                Make it 4× easier
              </button>
              <span className="text-ink-soft">
                {game.mining?.status === "open" ? "Block open — it gets easier by itself after 15s." : `${game.pending.length} payments waiting. Blocks open automatically when there are payments.`}
              </span>
            </div>
          )}

          {game.phase === "market" && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-1.5">
                {NEWS.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    disabled={!!busy}
                    onClick={() => run(`news-${n.id}`, { action: "news", cardId: n.id })}
                    className={`btn px-2.5 py-1 text-sm ${n.mood === "good" ? "bg-hl-mint" : "bg-hl-pink"}`}
                    title={n.title}
                  >
                    {n.emoji} {n.title.length > 26 ? `${n.title.slice(0, 24)}…` : n.title}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <button type="button" disabled={!!busy} onClick={() => run("wb", { action: "whale", side: "buy" })} className="btn bg-sheet px-3 py-1.5">
                  🐋 Whale buys
                </button>
                <button type="button" disabled={!!busy} onClick={() => run("ws", { action: "whale", side: "sell" })} className="btn bg-sheet px-3 py-1.5">
                  🐋 Whale dumps
                </button>
                <span className="text-ink-soft">News is only information — the class decides what it does to the price.</span>
              </div>
            </div>
          )}

          <AnimatePresence>
            {people && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto border-t border-dashed border-rule-strong pt-2">
                  {live.players.map((p) => (
                    <span key={p._id} className="chip flex items-center gap-1 bg-sheet py-0.5 pr-1 pl-2 text-sm">
                      {p.emoji} {p.name}
                      <button type="button" onClick={() => run(`kick-${p._id}`, { action: "kick", id: p._id })} className="rounded-full px-1.5 text-bad hover:bg-bad/10" aria-label={`Remove ${p.name}`}>
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm">
                  {!confirmReset ? (
                    <button type="button" onClick={() => setConfirmReset(true)} className="btn bg-sheet px-3 py-1.5 text-bad">
                      Reset game
                    </button>
                  ) : (
                    <>
                      <span className="font-bold">Remove every node and start over?</span>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmReset(false);
                          run("reset", { action: "reset" });
                        }}
                        className="btn bg-bad px-3 py-1.5 text-white"
                      >
                        Reset
                      </button>
                      <button type="button" onClick={() => setConfirmReset(false)} className="btn bg-sheet px-3 py-1.5">
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {err && <div className="text-sm font-semibold text-bad">{err}</div>}
        </div>
      )}
    </motion.div>
  );
}
