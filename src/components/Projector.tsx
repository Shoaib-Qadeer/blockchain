"use client";

import { AnimatePresence, motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useMemo, useRef, useState } from "react";
import { verifyChain } from "@/lib/chain";
import { currentPrice, fmt, fmtAir, netWorth, useLive, useNow, type Live } from "@/lib/client";
import { celebrate } from "@/lib/confetti";
import { PHASES, type Block } from "@/lib/types";
import { AdminDock } from "./AdminDock";
import { Chain, LeadingZeros } from "./Chain";
import { NewsFlash, PriceChart, PriceTicker, TradeFeed } from "./Market";
import { Mempool } from "./Mempool";
import { easeFactor } from "./MinerPad";
import { NetworkMap } from "./NetworkMap";
import { Countdown, RoundBanner } from "./Rounds";

export function Projector({ admin = false }: { admin?: boolean }) {
  const { live, error, refresh } = useLive(600);
  if (!live) {
    return (
      <main className="seyes grid min-h-dvh place-items-center">
        <p className="display text-4xl font-extrabold">{error ? "Can’t reach the game server. Check Vercel → Logs for the reason." : "Starting the network…"}</p>
      </main>
    );
  }
  return <Stage live={live} admin={admin} refresh={refresh} />;
}

function useOrigin() {
  const [o, setO] = useState("");
  useEffect(() => setO(window.location.origin), []);
  return o;
}

function Stage({ live, admin, refresh }: { live: Live; admin: boolean; refresh: () => void }) {
  const { game, players } = live;
  const now = useNow(live.offset, 200);
  const origin = useOrigin();
  const host = origin.replace(/^https?:\/\//, "");
  const phaseIdx = PHASES.findIndex((p) => p.id === game.phase);

  // confetti on the big screen whenever a block is sealed
  const lastIdx = useRef(game.chain.length);
  useEffect(() => {
    if (game.chain.length > lastIdx.current) celebrate(true);
    lastIdx.current = game.chain.length;
  }, [game.chain.length]);

  return (
    <main className="seyes-plain relative flex h-dvh flex-col overflow-hidden" style={{ paddingBottom: "var(--dock-h, 0px)" }}>
      <header className="flex items-center gap-6 px-8 pt-5">
        <div className="flex items-center gap-3">
          <span className="text-5xl">🪙</span>
          <span className="display text-5xl font-extrabold">AIRcoin</span>
        </div>
        <ol className="flex flex-1 items-center gap-1.5">
          {PHASES.map((p, i) => (
            <li
              key={p.id}
              className={`flex items-center gap-2 rounded-full border-2 px-3.5 py-1 text-lg font-bold transition-colors ${
                i === phaseIdx ? "border-ink bg-ink text-paper" : i < phaseIdx ? "border-ink/40 text-ink/50" : "border-ink/25 text-ink/40"
              }`}
            >
              <span className="mono text-sm">{i + 1}</span>
              {p.label}
            </li>
          ))}
        </ol>
        <Countdown endsAt={game.phaseEndsAt} startedAt={game.phaseStartedAt} now={now} big />
        {game.phase !== "lobby" && (
          <div className="text-right text-lg font-semibold leading-tight">
            <div>
              <span className="mono font-extrabold">{players.length}</span> nodes
            </div>
            <div className="mono text-ink-soft">{host}</div>
          </div>
        )}
        {!live.online && <span className="rounded-full bg-bad px-3 py-1 font-bold text-white">offline</span>}
      </header>

      <AnimatePresence mode="wait">
        <motion.div
          key={game.phase}
          className="flex min-h-0 flex-1 flex-col"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -24 }}
          transition={{ duration: 0.35 }}
        >
          {game.phase === "lobby" && <LobbyStage live={live} origin={origin} host={host} />}
          {game.phase === "send" && <SendStage live={live} />}
          {game.phase === "mine" && <MineStage live={live} now={now} />}
          {game.phase === "tamper" && <TamperStage live={live} />}
          {game.phase === "market" && game.market && <MarketStage live={live} now={now} />}
          {game.phase === "results" && <ResultsStage live={live} />}
        </motion.div>
      </AnimatePresence>

      <NewsFlash news={game.news} now={now} big />
      <RoundBanner phase={game.phase} startedAt={game.phaseStartedAt} now={now} big />
      {admin && <AdminDock live={live} refresh={refresh} />}
    </main>
  );
}

function Caption({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="max-w-[46ch]">
      <h2 className="display text-6xl font-extrabold">{title}</h2>
      {children && <p className="mt-3 text-2xl leading-snug">{children}</p>}
    </div>
  );
}

/* ---------------------------------------------------------------- lobby */

function LobbyStage({ live, origin, host }: { live: Live; origin: string; host: string }) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(380px,32%)_1fr] gap-6 px-8 pb-8">
      <div className="flex flex-col justify-center gap-8">
        <Caption title="Join the network">Scan with your phone. You become a node with your own copy of the ledger and 100 AIR.</Caption>
        <motion.div initial={{ rotate: -6, scale: 0.8 }} animate={{ rotate: -2, scale: 1 }} transition={{ type: "spring" }} className="sheet tape relative w-fit p-5">
          {origin && <QRCodeSVG value={origin} size={260} fgColor="#1b2559" bgColor="#ffffff" marginSize={1} />}
          <div className="mono mt-3 text-center text-2xl font-extrabold">{host}</div>
        </motion.div>
      </div>
      <div className="relative min-h-0">
        <div className="absolute top-2 right-4 text-right">
          <motion.div key={live.players.length} initial={{ scale: 1.5 }} animate={{ scale: 1 }} className="display text-[120px] font-extrabold leading-none">
            {live.players.length}
          </motion.div>
          <div className="text-2xl font-bold">nodes connected</div>
        </div>
        {live.players.length === 0 ? (
          <div className="grid h-full place-items-center text-3xl font-semibold text-ink-soft">Waiting for the first node…</div>
        ) : (
          <NetworkMap game={live.game} players={live.players} />
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- send */

function SendStage({ live }: { live: Live }) {
  const { game, players } = live;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_minmax(380px,30%)] gap-6 px-8">
        <div className="min-h-0">
          <NetworkMap game={game} players={players} />
        </div>
        <aside className="flex min-h-0 flex-col gap-4 pt-4">
          <Caption title="Pay someone">Payments are shouted to every node — but they’re not final yet.</Caption>
          <div className="flex items-baseline gap-3">
            <h3 className="text-2xl font-extrabold">Waiting room</h3>
            <span className="mono text-xl font-bold text-ink-soft">{game.pending.length}</span>
          </div>
          <div className="min-h-0 overflow-hidden">
            {game.pending.length ? <Mempool txs={[...game.pending].reverse()} max={9} /> : <p className="text-xl text-ink-soft">Empty — send something!</p>}
          </div>
        </aside>
      </div>
      <ChainDock blocks={game.chain} />
    </div>
  );
}

function ChainDock({ blocks, onPickTx, big = false }: { blocks: Block[]; onPickTx?: (b: number, t: number) => void; big?: boolean }) {
  return (
    <div className="shrink-0 border-t-2 border-ink/80 bg-paper/70 backdrop-blur-[1px]">
      <div className="flex items-center gap-3 px-8 pt-2">
        <span className="text-lg font-extrabold">The ledger</span>
        <span className="text-base text-ink-soft">{onPickTx ? "click any payment to edit this copy" : "every node holds this exact copy"}</span>
      </div>
      <Chain blocks={blocks} compact={!big} wide={big} onPickTx={onPickTx} />
    </div>
  );
}

/* ----------------------------------------------------------------- mine */

function MineStage({ live, now }: { live: Live; now: number }) {
  const { game, players } = live;
  const m = game.mining;
  const work = m?.work ?? {};
  const total = Object.values(work).reduce((s, v) => s + v, 0);
  const top = Object.entries(work)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, w]) => ({ p: live.byId.get(id), w }))
    .filter((x) => x.p);
  const maxW = Math.max(1, ...top.map((t) => t.w));
  const secs = m ? Math.max(0, Math.floor(((m.status === "won" ? m.wonAt ?? now : now) - m.openedAt) / 1000)) : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_minmax(440px,36%)] gap-6 px-8">
        <div className="min-h-0">
          <NetworkMap game={game} players={players} showWork />
        </div>
        <aside className="flex min-h-0 flex-col gap-4 pt-4">
          {!m ? (
            <Caption title="Mining">Waiting for a block to open…</Caption>
          ) : m.status === "open" ? (
            <>
              <Caption title={`Sealing block ${m.index}`}>
                Everyone is guessing numbers until one gives a fingerprint starting with{" "}
                <span className="mono hl font-extrabold">{"0".repeat(m.zeros)}</span>.
              </Caption>
              <div className="flex gap-6">
                <BigStat label="guesses so far" value={total.toLocaleString("en-US")} />
                <BigStat label="seconds" value={String(secs)} />
                {easeFactor(m.openedAt, now) * m.boost > 1 && <BigStat label="faster machines" value={`×${easeFactor(m.openedAt, now) * m.boost}`} />}
              </div>
              <div className="sheet flex flex-col gap-2 p-4">
                <div className="text-lg font-extrabold">Most guesses = best odds</div>
                {top.length === 0 && <div className="text-lg text-ink-soft">Start tapping!</div>}
                {top.map(({ p, w }) => (
                  <div key={p!._id} className="flex items-center gap-3">
                    <span className="w-36 truncate text-lg font-bold">
                      {p!.emoji} {p!.name}
                    </span>
                    <div className="h-5 flex-1 overflow-hidden rounded-full border-2 border-ink bg-sheet">
                      <motion.div className="h-full" style={{ background: p!.color }} animate={{ width: `${(w / maxW) * 100}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
                    </div>
                    <span className="mono w-20 text-right font-bold">{w.toLocaleString("en-US")}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <motion.div initial={{ scale: 0.7, rotate: -8, opacity: 0 }} animate={{ scale: 1, rotate: -2, opacity: 1 }} transition={{ type: "spring", stiffness: 220, damping: 13 }} className="sheet !bg-hl-mint p-6">
              <div className="text-xl font-bold">Block {m.index} sealed by</div>
              <div className="display mt-1 text-7xl font-extrabold">
                {live.byId.get(m.winner!.id)?.emoji} {m.winner!.name}
              </div>
              <div className="mt-4 text-xl">
                lucky number <span className="mono font-extrabold">{m.winner!.nonce}</span>
              </div>
              <div className="text-2xl">
                <LeadingZeros hash={m.winner!.hash} zeros={m.zeros} />
              </div>
              <div className="mt-3 text-lg">
                after {total.toLocaleString("en-US")} guesses in {secs} seconds. Reward: +5 AIR.
              </div>
            </motion.div>
          )}
          <div className="text-lg text-ink-soft">{game.pending.length} payment{game.pending.length === 1 ? "" : "s"} waiting for the next block</div>
        </aside>
      </div>
      <ChainDock blocks={game.chain} />
    </div>
  );
}

function BigStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mono text-5xl font-extrabold tabular-nums">{value}</div>
      <div className="text-lg font-semibold text-ink-soft">{label}</div>
    </div>
  );
}

/* --------------------------------------------------------------- tamper */

function TamperStage({ live }: { live: Live }) {
  const { game, players } = live;
  const [demo, setDemo] = useState<Block[] | null>(null);
  const cheaters = players.filter((p) => p.tampered).length;
  const honest = players.length - cheaters;
  const blocks = demo ?? game.chain;
  const broken = useMemo(() => verifyChain(blocks).some((c) => !c.valid), [blocks]);

  const hack = (bi: number, ti: number) => {
    const copy = blocks.map((b) => ({ ...b, txs: [...b.txs] }));
    const t = copy[bi].txs[ti];
    copy[bi].txs[ti] = { ...t, id: `hack-${t.id}`, toName: "the presenter", to: "presenter", amount: 1000 };
    setDemo(copy);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_minmax(440px,36%)] gap-6 px-8">
        <div className="min-h-0">
          <NetworkMap game={game} players={players} />
        </div>
        <aside className="flex flex-col gap-5 pt-4">
          <Caption title="Try to cheat">On your phone, rewrite an old payment so it pays you 1000 AIR.</Caption>
          <div className="sheet p-5">
            <div className="flex items-end justify-between text-xl font-bold">
              <span className="text-ok">{honest} honest copies</span>
              <span className="text-bad">{cheaters} edited</span>
            </div>
            <div className="mt-2 flex h-8 overflow-hidden rounded-full border-2 border-ink">
              <motion.div className="bg-ok" animate={{ width: `${players.length ? (honest / players.length) * 100 : 100}%` }} />
              <motion.div className="bg-bad" animate={{ width: `${players.length ? (cheaters / players.length) * 100 : 0}%` }} />
            </div>
            <p className="mt-3 text-lg leading-snug">
              Any edit changes a fingerprint, so it no longer matches everyone else. The network keeps the version most nodes agree on.
            </p>
          </div>
          {broken && (
            <button type="button" onClick={() => setDemo(null)} className="btn w-fit bg-hl-mint px-5 py-2 text-lg">
              Restore the honest ledger
            </button>
          )}
        </aside>
      </div>
      <ChainDock blocks={blocks} onPickTx={hack} big />
    </div>
  );
}

/* --------------------------------------------------------------- market */

function MarketStage({ live, now }: { live: Live; now: number }) {
  const { game, players } = live;
  const market = game.market!;
  const price = currentPrice(game);
  const rich = [...players].sort((a, b) => netWorth(b, price) - netWorth(a, price)).slice(0, 5);
  const frozen = market.frozenUntil > now;
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[1fr_minmax(380px,28%)] gap-6 px-8 pb-6">
      <div className="flex min-h-0 flex-col">
        <div className="flex items-end justify-between gap-6 pt-3">
          <div>
            <div className="text-2xl font-bold text-ink-soft">1 AIR =</div>
            <PriceTicker price={price} first={market.first} className="[&>div:first-child]:text-[110px] [&>div:last-child]:text-2xl" />
          </div>
          <div className="flex gap-8 pb-2">
            <BigStat label="highest" value={`€${fmt(market.high)}`} />
            <BigStat label="lowest" value={`€${fmt(market.low)}`} />
            <BigStat label="trades" value={String(market.trades)} />
          </div>
        </div>
        <div className="sheet relative mt-4 min-h-0 flex-1 p-3">
          <PriceChart market={market} now={now} />
          <AnimatePresence>
            {frozen && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 grid place-items-center bg-[#dff3ff]/85">
                <div className="text-center">
                  <div className="text-8xl">🧊</div>
                  <div className="display text-6xl font-extrabold">Trading frozen for {Math.ceil((market.frozenUntil - now) / 1000)}s</div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <aside className="flex min-h-0 flex-col gap-5 pt-2">
        <div className="sheet p-4">
          <div className="text-xl font-extrabold">Richest right now</div>
          <ol className="mt-2 flex flex-col gap-1.5">
            <AnimatePresence initial={false}>
              {rich.map((p, i) => (
                <motion.li key={p._id} layout className="flex items-center gap-2 text-xl">
                  <span className="mono w-6 text-ink-soft">{i + 1}</span>
                  <span>{p.emoji}</span>
                  <span className="flex-1 truncate font-bold">{p.name}</span>
                  <span className="mono font-extrabold">€{fmt(netWorth(p, price), 0)}</span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        </div>
        <div className="sheet min-h-0 flex-1 overflow-hidden p-4">
          <div className="mb-2 text-xl font-extrabold">Live trades</div>
          <TradeFeed market={market} max={10} />
        </div>
        <p className="text-lg leading-snug text-ink-soft">
          Only {fmtAir(market.pool.air)} AIR left for sale. No new coins can be made, so every buy pushes the price up.
        </p>
      </aside>
    </div>
  );
}

/* -------------------------------------------------------------- results */

const LESSONS = [
  { emoji: "📒", title: "Shared ledger", text: "Everyone kept the same notebook. No bank decided who owned what." },
  { emoji: "🎲", title: "Proof of work", text: "Sealing a block meant guessing millions of numbers. Hard to do, instant to check." },
  { emoji: "🔗", title: "Linked fingerprints", text: "Each block carries the fingerprint of the one before. Edit one and the chain snaps." },
  { emoji: "🎢", title: "Price is belief", text: "Fixed supply plus news plus herding: AIR swung wildly while nothing about it changed." },
];

function ResultsStage({ live }: { live: Live }) {
  const { game, players } = live;
  const price = currentPrice(game);
  const m = game.market;
  const ranked = [...players].sort((a, b) => (m ? netWorth(b, price) - netWorth(a, price) : b.air - a.air));
  const podium = [ranked[1], ranked[0], ranked[2]];
  const heights = ["h-40", "h-56", "h-28"];
  const places = [2, 1, 3];
  const swing = m ? m.high / m.low : 1;

  useEffect(() => {
    celebrate(true);
    const t = setTimeout(() => celebrate(true), 1200);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[1fr_1fr] gap-10 px-10 pb-8">
      <div className="flex flex-col justify-center">
        <div className="flex items-end justify-center gap-4">
          {podium.map((p, i) =>
            p ? (
              <motion.div
                key={p._id}
                initial={{ y: 200, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: [0.6, 1.2, 0.2][i], type: "spring", stiffness: 140, damping: 14 }}
                className="flex w-52 flex-col items-center"
              >
                <div className="text-7xl">{p.emoji}</div>
                <div className="display mt-1 w-full truncate text-center text-4xl font-extrabold">{p.name}</div>
                <div className="mono text-2xl font-bold">{m ? `€${fmt(netWorth(p, price), 0)}` : `${fmtAir(p.air)} AIR`}</div>
                <div className={`sheet mt-2 flex w-full items-start justify-center pt-3 ${heights[i]} ${places[i] === 1 ? "!bg-hl-yellow" : ""}`}>
                  <span className="display text-6xl font-extrabold">{places[i]}</span>
                </div>
              </motion.div>
            ) : (
              <div key={i} className="w-52" />
            )
          )}
        </div>
        {m && (
          <div className="sheet mt-8 p-5 text-2xl leading-snug">
            AIR went from <b className="mono">€1.00</b> up to <b className="mono text-ok">€{fmt(m.high)}</b> and down to{" "}
            <b className="mono text-bad">€{fmt(m.low)}</b> — a <b className="hl">{fmt(swing, 1)}×</b> swing in a few minutes, with {m.trades} trades. Bitcoin lost about 77% between its
            2021 peak and its 2022 low.
          </div>
        )}
      </div>
      <div className="flex flex-col justify-center gap-4">
        <h2 className="display text-6xl font-extrabold">What just happened</h2>
        {LESSONS.map((l, i) => (
          <motion.div
            key={l.title}
            initial={{ x: 80, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 1.6 + i * 0.25 }}
            className="sheet flex items-center gap-5 p-4"
          >
            <span className="text-5xl">{l.emoji}</span>
            <div>
              <div className="text-2xl font-extrabold">{l.title}</div>
              <div className="text-xl leading-snug">{l.text}</div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
