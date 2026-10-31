"use client";

import { AdminDock } from "@/components/AdminDock";
import { currentPrice, fmt, useLive } from "@/lib/client";
import { PHASES } from "@/lib/types";

/** Presenter remote for a teammate's phone: the projector shows /screen, this one drives it. */
export default function RemotePage() {
  const { live, error, refresh } = useLive(800);
  if (!live) return <main className="seyes grid min-h-dvh place-items-center p-6 font-bold">{error ?? "Connecting…"}</main>;
  const { game, players } = live;
  const phase = PHASES.find((p) => p.id === game.phase)!;
  return (
    <main className="seyes min-h-dvh p-4 pl-[72px] pb-80">
      <h1 className="display text-4xl font-extrabold">Remote</h1>
      <div className="sheet mt-4 flex flex-col gap-1 p-4 text-lg">
        <div>
          Step: <b>{phase.label}</b>
        </div>
        <div>
          Nodes: <b className="mono">{players.length}</b>
        </div>
        <div>
          Blocks: <b className="mono">{game.chain.length}</b>, waiting payments: <b className="mono">{game.pending.length}</b>
        </div>
        {game.mining && (
          <div>
            Mining: <b>{game.mining.status === "open" ? `block ${game.mining.index} open` : `block ${game.mining.index} sealed by ${game.mining.winner?.name}`}</b>
          </div>
        )}
        {game.market && (
          <div>
            Price: <b className="mono">€{fmt(currentPrice(game))}</b> (high €{fmt(game.market.high)}, low €{fmt(game.market.low)})
          </div>
        )}
      </div>
      <AdminDock live={live} refresh={refresh} />
    </main>
  );
}
