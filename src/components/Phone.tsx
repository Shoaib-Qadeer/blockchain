"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { verifyChain } from "@/lib/chain";
import { api, currentPrice, fmt, fmtAir, loadIdentity, netWorth, saveIdentity, useLive, useNow, type Identity, type Live } from "@/lib/client";
import { buzz, celebrate } from "@/lib/confetti";
import { PHASES, type Block, type Player } from "@/lib/types";
import { Chain } from "./Chain";
import { Mempool } from "./Mempool";
import { MinerPad } from "./MinerPad";
import { NetworkMap } from "./NetworkMap";
import { NewsFlash, PriceChart, PriceTicker } from "./Market";

type Toast = { id: number; text: string; tone: "ok" | "bad" };

export function Phone() {
  const { live, error, refresh } = useLive(650);
  const [ident, setIdent] = useState<Identity | null>(null);
  const [ready, setReady] = useState(false);
  const missing = useRef(0);

  useEffect(() => {
    setIdent(loadIdentity());
    setReady(true);
  }, []);

  // forget an identity that belongs to an older game, or a node that was removed
  useEffect(() => {
    if (!live || !ident) return;
    if (live.game.createdAt !== ident.gameId) {
      saveIdentity(null);
      setIdent(null);
      return;
    }
    if (!live.byId.has(ident.id)) {
      missing.current++;
      if (missing.current > 2) {
        saveIdentity(null);
        setIdent(null);
      }
    } else missing.current = 0;
  }, [live, ident]);

  if (!ready || !live) {
    return (
      <Shell>
        <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-3 text-center">
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.4, ease: "linear" }} className="text-5xl">
            🪙
          </motion.div>
          <p className="font-semibold">{error ? `Can't reach the network: ${error}` : "Connecting to the network…"}</p>
        </div>
      </Shell>
    );
  }

  const me = ident ? live.byId.get(ident.id) : undefined;
  if (!ident || !me) {
    return (
      <Shell>
        <Join
          live={live}
          onJoined={(i) => {
            saveIdentity(i);
            setIdent(i);
            buzz([20, 40, 20]);
            refresh();
          }}
        />
      </Shell>
    );
  }

  return <Playing live={live} me={me} ident={ident} refresh={refresh} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="seyes min-h-dvh">
      <div className="mx-auto w-full max-w-md px-4 pt-5 pb-10 pl-[70px]">{children}</div>
    </main>
  );
}

/* ----------------------------------------------------------------- join */

function Join({ live, onJoined }: { live: Live; onJoined: (i: Identity) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await api<Identity>("/api/play", { type: "join", name });
      onJoined(r);
    } catch (e) {
      setErr((e as Error).message);
      buzz([30, 30, 30]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex min-h-[85dvh] flex-col justify-center gap-6">
      <div>
        <motion.div initial={{ rotate: -20, scale: 0 }} animate={{ rotate: -6, scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 12 }} className="text-7xl">
          🪙
        </motion.div>
        <h1 className="display mt-3 text-6xl font-extrabold">AIRcoin</h1>
        <p className="mt-3 text-lg leading-snug">
          A tiny money network that lives on everyone’s phone in this room. No bank, no boss — just {live.players.length || "a few"} notebooks that must agree.
        </p>
      </div>
      <form onSubmit={submit} className="sheet tape relative flex flex-col gap-3 p-5">
        <label htmlFor="name" className="font-bold">
          Your name in the network
        </label>
        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={14}
          autoComplete="off"
          autoCapitalize="words"
          placeholder="e.g. Sara"
          className="rounded-lg border-2 border-ink bg-paper px-3 py-3 text-xl font-semibold outline-none"
        />
        {err && <p className="text-sm font-semibold text-bad">{err}</p>}
        <button disabled={busy || name.trim().length < 2} className="btn bg-hl-yellow py-3.5 text-xl">
          {busy ? "Joining…" : "Join the network"}
        </button>
        <p className="text-sm text-ink-soft">You’ll get 100 AIR to start.</p>
      </form>
    </div>
  );
}

/* -------------------------------------------------------------- playing */

function Playing({ live, me, ident, refresh }: { live: Live; me: Player; ident: Identity; refresh: () => void }) {
  const { game, players } = live;
  const now = useNow(live.offset, 250);
  const [toast, setToast] = useState<Toast | null>(null);
  const say = (text: string, tone: Toast["tone"] = "ok") => {
    setToast({ id: Date.now(), text, tone });
  };
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  const phase = PHASES.find((p) => p.id === game.phase)!;
  const price = currentPrice(game);

  return (
    <main className="seyes min-h-dvh">
      <div className="mx-auto w-full max-w-md px-4 pt-3 pb-12 pl-[70px]">
        <header className="sticky top-0 z-30 -mx-4 -mt-3 mb-4 flex items-center gap-3 bg-paper/90 px-4 py-2.5 backdrop-blur">
          <div className="grid h-11 w-11 place-items-center rounded-full border-[3px] bg-sheet text-2xl" style={{ borderColor: me.color }}>
            {me.emoji}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-extrabold">{me.name}</div>
            <div className="text-xs font-semibold text-ink-soft">{phase.hint}</div>
          </div>
          <div className="text-right">
            <motion.div key={Math.round(me.air * 100)} initial={{ scale: 1.25, color: "#109c6c" }} animate={{ scale: 1, color: "#1b2559" }} className="mono text-lg font-extrabold">
              {fmtAir(me.air)} AIR
            </motion.div>
            {game.market && <div className="mono text-xs font-bold text-ink-soft">€{fmt(me.eur)}</div>}
          </div>
        </header>

        {!live.online && (
          <div className="mb-3 rounded-lg border-2 border-bad bg-sheet px-3 py-2 text-sm font-semibold text-bad">Reconnecting to the network…</div>
        )}

        <AnimatePresence mode="wait">
          <motion.section
            key={game.phase}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.28 }}
          >
            {game.phase === "lobby" && <LobbyView live={live} me={me} />}
            {game.phase === "send" && <SendView live={live} me={me} ident={ident} say={say} refresh={refresh} />}
            {game.phase === "mine" && (
              <div className="flex flex-col gap-5">
                <MinerPad game={game} me={me} ident={ident} now={now} />
                <details className="sheet p-4">
                  <summary className="cursor-pointer font-bold">Send more AIR</summary>
                  <div className="mt-3">
                    <SendForm live={live} me={me} ident={ident} say={say} refresh={refresh} />
                  </div>
                </details>
              </div>
            )}
            {game.phase === "tamper" && <TamperView live={live} me={me} ident={ident} />}
            {game.phase === "market" && game.market && <MarketView live={live} me={me} ident={ident} now={now} say={say} refresh={refresh} />}
            {game.phase === "results" && <ResultsView players={players} me={me} price={price} hasMarket={!!game.market} />}
          </motion.section>
        </AnimatePresence>
      </div>

      <NewsFlash news={game.news} now={now} />

      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className={`fixed inset-x-4 bottom-5 z-50 mx-auto max-w-sm rounded-xl border-2 border-ink px-4 py-3 text-center font-bold shadow-[0_4px_0_var(--color-ink)] ${
              toast.tone === "ok" ? "bg-hl-mint" : "bg-hl-pink"
            }`}
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

/* ---------------------------------------------------------------- lobby */

function LobbyView({ live, me }: { live: Live; me: Player }) {
  const n = live.players.findIndex((p) => p._id === me._id) + 1;
  return (
    <div className="flex flex-col gap-4">
      <div className="sheet tape relative p-5">
        <div className="text-sm font-semibold text-ink-soft">You joined as node {n}</div>
        <h2 className="display mt-1 text-4xl font-extrabold">You’re on the network</h2>
        <p className="mt-2 leading-snug">
          Your phone now keeps its own copy of the ledger — the notebook of who paid whom. Nobody is in charge. Look up at the big screen.
        </p>
      </div>
      <div className="sheet aspect-[4/3] p-2">
        <NetworkMap game={live.game} players={live.players} meId={me._id} compact />
      </div>
      <p className="text-center font-semibold text-ink-soft">{live.players.length} nodes connected</p>
    </div>
  );
}

/* ----------------------------------------------------------------- send */

function incoming(live: Live, meId: string) {
  const open = live.game.mining?.status === "open" ? live.game.mining.txs : [];
  const all = [...live.game.pending, ...open];
  return {
    in: all.filter((t) => t.to === meId).reduce((s, t) => s + t.amount, 0),
    out: all.filter((t) => t.from === meId).reduce((s, t) => s + t.amount, 0),
  };
}

function SendView(props: { live: Live; me: Player; ident: Identity; say: (t: string, tone?: "ok" | "bad") => void; refresh: () => void }) {
  const { live, me } = props;
  const flow = incoming(live, me._id);
  const mine = live.game.pending.filter((t) => t.from === me._id || t.to === me._id);
  return (
    <div className="flex flex-col gap-4">
      <div className="sheet p-4">
        <div className="text-sm font-semibold text-ink-soft">Your wallet</div>
        <div className="display text-5xl font-extrabold">{fmtAir(me.air)} AIR</div>
        {(flow.in > 0 || flow.out > 0) && (
          <div className="mt-2 flex flex-col gap-0.5 text-sm">
            {flow.in > 0 && (
              <span>
                <span className="hl font-bold" style={{ ["--hl" as string]: "var(--color-hl-mint)" }}>
                  +{flow.in} on its way to you
                </span>{" "}
                — arrives when a block is sealed
              </span>
            )}
            {flow.out > 0 && <span className="text-ink-soft">{flow.out} you sent is waiting to be sealed</span>}
          </div>
        )}
      </div>
      <div className="sheet p-4">
        <SendForm {...props} />
      </div>
      {mine.length > 0 && (
        <div>
          <h3 className="mb-2 font-bold">In the waiting room</h3>
          <Mempool txs={mine} small max={6} meId={me._id} />
        </div>
      )}
    </div>
  );
}

function SendForm({ live, me, ident, say, refresh }: { live: Live; me: Player; ident: Identity; say: (t: string, tone?: "ok" | "bad") => void; refresh: () => void }) {
  const others = live.players.filter((p) => p._id !== me._id);
  const [to, setTo] = useState<string | null>(null);
  const [amount, setAmount] = useState(10);
  const [busy, setBusy] = useState(false);
  const target = to ? live.byId.get(to) : undefined;

  const send = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await api("/api/play", { type: "send", ...ident, to: target._id, amount });
      buzz(25);
      say(`Sent ${amount} AIR to ${target.name} — waiting to be sealed in a block`);
      setTo(null);
      refresh();
    } catch (e) {
      say((e as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  };

  if (!others.length) return <p className="font-semibold text-ink-soft">Nobody else has joined yet.</p>;

  return (
    <div className="flex flex-col gap-3">
      <div className="font-bold">Pay someone</div>
      <div className="no-scrollbar -mx-1 flex max-h-60 flex-wrap gap-2 overflow-y-auto px-1 py-1 pb-6 [mask-image:linear-gradient(to_bottom,black_80%,transparent)]">
        {others.map((p) => (
          <button
            key={p._id}
            type="button"
            onClick={() => setTo(p._id)}
            className="chip flex items-center gap-1.5 bg-sheet py-1.5 pr-3 pl-1.5 text-sm"
            data-on={to === p._id}
          >
            <span className="grid h-7 w-7 place-items-center rounded-full bg-sheet text-base" style={{ boxShadow: `0 0 0 2px ${p.color}` }}>
              {p.emoji}
            </span>
            {p.name}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        {[5, 10, 25].map((a) => (
          <button key={a} type="button" onClick={() => setAmount(a)} className="chip mono flex-1 bg-sheet py-2 text-lg" data-on={amount === a}>
            {a}
          </button>
        ))}
      </div>
      <button type="button" onClick={send} disabled={!target || busy || me.air < amount} className="btn bg-hl-yellow py-3.5 text-lg">
        {target ? `Send ${amount} AIR to ${target.name}` : "Pick who to pay"}
      </button>
    </div>
  );
}

/* --------------------------------------------------------------- tamper */

function TamperView({ live, me, ident }: { live: Live; me: Player; ident: Identity }) {
  const [hacked, setHacked] = useState<Block[] | null>(null);
  const blocks = hacked ?? live.game.chain;
  const checks = useMemo(() => verifyChain(blocks), [blocks]);
  const firstBad = checks.findIndex((c) => !c.valid);
  const honest = live.players.filter((p) => !p.tampered).length;
  const others = Math.max(1, live.players.length - 1);
  const redo = firstBad >= 0 ? blocks.length - firstBad : 0;
  const oddsExp = redo * Math.log10(others);

  const hack = (bi: number, ti: number) => {
    const copy: Block[] = blocks.map((b) => ({ ...b, txs: [...b.txs] }));
    const t = copy[bi].txs[ti];
    if (t.id.startsWith("hack")) return;
    copy[bi].txs[ti] = { ...t, id: `hack-${t.id}`, to: me._id, toName: me.name, amount: 1000 };
    setHacked(copy);
    buzz([60, 40, 60, 40, 200]);
    api("/api/play", { type: "tamper", ...ident, on: true }).catch(() => {});
  };
  const undo = () => {
    setHacked(null);
    api("/api/play", { type: "tamper", ...ident, on: false }).catch(() => {});
    celebrate();
  };

  return (
    <div className="flex flex-col gap-4">
      <AnimatePresence mode="wait">
        {!hacked ? (
          <motion.div key="ask" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="sheet tape relative p-5">
            <h2 className="display text-4xl font-extrabold">Try to cheat</h2>
            <p className="mt-2 leading-snug">
              This is <b>your</b> copy of the ledger. Tap any payment below and rewrite it to send <span className="mono hl font-bold">1000</span> AIR to you.
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="caught"
            initial={{ scale: 1.3, opacity: 0, rotate: 4 }}
            animate={{ scale: 1, opacity: 1, rotate: -1 }}
            transition={{ type: "spring", stiffness: 260, damping: 14 }}
            className="sheet !border-bad p-5 !shadow-[3px_3px_0_var(--color-bad)]"
          >
            <h2 className="display text-4xl font-extrabold text-bad">Rejected</h2>
            <p className="mt-2 leading-snug">
              Changing one payment changed that block’s fingerprint, which broke the link to every block after it. Your copy no longer matches the other{" "}
              <b>{honest}</b> honest copies, so the network ignores it.
            </p>
            <p className="mt-2 text-sm leading-snug text-ink-soft">
              To win, you’d have to redo the guessing for <b>{redo}</b> block{redo === 1 ? "" : "s"} faster than the other {others} nodes combined. Your chance is
              roughly <span className="mono font-bold text-ink">1 in {oddsExp < 9 ? Math.round(10 ** oddsExp).toLocaleString("en-US") : `10^${Math.round(oddsExp)}`}</span>.
            </p>
            <button type="button" onClick={undo} className="btn mt-4 w-full bg-hl-mint py-3 text-lg">
              Give up and copy the honest ledger
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <Chain blocks={blocks} vertical onPickTx={hack} />
    </div>
  );
}

/* --------------------------------------------------------------- market */

function MarketView({
  live,
  me,
  ident,
  now,
  say,
  refresh,
}: {
  live: Live;
  me: Player;
  ident: Identity;
  now: number;
  say: (t: string, tone?: "ok" | "bad") => void;
  refresh: () => void;
}) {
  const market = live.game.market!;
  const price = currentPrice(live.game);
  const [fraction, setFraction] = useState(0.25);
  const [busy, setBusy] = useState<"buy" | "sell" | null>(null);
  const frozen = market.frozenUntil > now;

  const trade = async (side: "buy" | "sell") => {
    setBusy(side);
    try {
      const r = await api<{ paid: number; got: number }>("/api/play", { type: "trade", ...ident, side, fraction });
      buzz(15);
      say(side === "buy" ? `Bought ${fmtAir(r.got)} AIR for €${fmt(r.paid)}` : `Sold ${fmtAir(r.paid)} AIR for €${fmt(r.got)}`);
      refresh();
    } catch (e) {
      say((e as Error).message, "bad");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="sheet relative overflow-hidden p-4">
        <div className="text-sm font-semibold text-ink-soft">1 AIR costs</div>
        <PriceTicker price={price} first={market.first} className="[&>div:first-child]:text-6xl" />
        <div className="mt-2 h-32">
          <PriceChart market={market} now={now} compact />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Cash" value={`€${fmt(me.eur)}`} />
        <Stat label="AIR" value={fmtAir(me.air)} />
        <Stat label="Worth" value={`€${fmt(netWorth(me, price))}`} strong />
      </div>

      <div className="flex gap-2">
        {[
          [0.25, "25%"],
          [0.5, "Half"],
          [1, "All in"],
        ].map(([f, l]) => (
          <button key={l} type="button" onClick={() => setFraction(f as number)} className="chip flex-1 bg-sheet py-2 font-bold" data-on={fraction === f}>
            {l}
          </button>
        ))}
      </div>

      <div className="relative grid grid-cols-2 gap-3">
        <button type="button" disabled={!!busy || frozen || me.eur < 0.01} onClick={() => trade("buy")} className="btn bg-hl-mint py-6 text-3xl">
          {busy === "buy" ? "…" : "Buy"}
          <span className="block text-xs font-semibold">with {fraction === 1 ? "all your €" : `${fraction * 100}% of your €`}</span>
        </button>
        <button type="button" disabled={!!busy || frozen || me.air < 0.01} onClick={() => trade("sell")} className="btn bg-hl-pink py-6 text-3xl">
          {busy === "sell" ? "…" : "Sell"}
          <span className="block text-xs font-semibold">{fraction === 1 ? "all your AIR" : `${fraction * 100}% of your AIR`}</span>
        </button>
        <AnimatePresence>
          {frozen && (
            <motion.div
              initial={{ opacity: 0, scale: 1.2 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 grid place-items-center rounded-2xl border-2 border-dashed border-ink bg-[#dff3ff]/95 text-center"
            >
              <div>
                <div className="text-4xl">🧊</div>
                <div className="display text-2xl font-extrabold">Trading frozen</div>
                <div className="mono font-bold">{Math.ceil((market.frozenUntil - now) / 1000)}s</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <p className="text-center text-sm text-ink-soft">
        There are only {fmtAir(market.pool.air)} AIR for sale. Every buy makes the next one pricier.
      </p>
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`sheet px-1.5 py-2 ${strong ? "!bg-hl-yellow" : ""}`}>
      <div className="text-xs font-semibold text-ink-soft">{label}</div>
      <div className="mono truncate text-base font-extrabold">{value}</div>
    </div>
  );
}

/* -------------------------------------------------------------- results */

function ResultsView({ players, me, price, hasMarket }: { players: Player[]; me: Player; price: number; hasMarket: boolean }) {
  const ranked = [...players].sort((a, b) => (hasMarket ? netWorth(b, price) - netWorth(a, price) : b.air - a.air));
  const rank = ranked.findIndex((p) => p._id === me._id) + 1;
  useEffect(() => {
    if (rank > 0 && rank <= 3) celebrate(true);
  }, [rank]);
  return (
    <div className="flex flex-col gap-4">
      <div className={`sheet tape relative p-5 text-center ${rank <= 3 ? "!bg-hl-yellow" : ""}`}>
        <div className="text-sm font-semibold">You finished</div>
        <div className="display text-7xl font-extrabold">#{rank}</div>
        <div className="mono mt-1 text-lg font-bold">{hasMarket ? `worth €${fmt(netWorth(me, price))}` : `${fmtAir(me.air)} AIR`}</div>
      </div>
      <ol className="sheet flex flex-col divide-y divide-dashed divide-rule-strong p-3">
        {ranked.slice(0, 8).map((p, i) => (
          <li key={p._id} className={`flex items-center gap-2 py-1.5 ${p._id === me._id ? "font-extrabold" : ""}`}>
            <span className="mono w-6 text-ink-soft">{i + 1}</span>
            <span className="text-lg">{p.emoji}</span>
            <span className="flex-1 truncate">{p.name}</span>
            <span className="mono font-bold">{hasMarket ? `€${fmt(netWorth(p, price))}` : `${fmtAir(p.air)}`}</span>
          </li>
        ))}
      </ol>
      <p className="text-center font-semibold">Look up — we’ll talk about what just happened.</p>
    </div>
  );
}
