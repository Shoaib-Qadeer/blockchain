"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Game, Player, Tx } from "@/lib/types";

type Pos = { x: number; y: number };
type Ripple = { id: string; x: number; y: number; color: string; big: boolean };

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** Sunflower layout: every node gets a stable spot, the network grows outward as people join. */
function layout(n: number, w: number, h: number): Pos[] {
  const cx = w / 2;
  const cy = h / 2;
  const rx = w * 0.43;
  const ry = h * 0.4;
  return Array.from({ length: n }, (_, i) => {
    if (n === 1) return { x: cx, y: cy };
    const r = Math.sqrt((i + 0.6) / n);
    const a = i * GOLDEN - Math.PI / 2;
    return { x: cx + Math.cos(a) * r * rx, y: cy + Math.sin(a) * r * ry };
  });
}

function neighbours(pos: Pos[], k: number) {
  const seen = new Set<string>();
  const edges: [number, number][] = [];
  pos.forEach((p, i) => {
    pos
      .map((q, j) => ({ j, d: (p.x - q.x) ** 2 + (p.y - q.y) ** 2 }))
      .filter((o) => o.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, k)
      .forEach(({ j }) => {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (!seen.has(key)) {
          seen.add(key);
          edges.push([Math.min(i, j), Math.max(i, j)]);
        }
      });
  });
  return edges;
}

export function NetworkMap({
  game,
  players,
  meId,
  compact = false,
  showWork = false,
}: {
  game: Game;
  players: Player[];
  meId?: string;
  compact?: boolean;
  showWork?: boolean;
}) {
  const W = compact ? 420 : 1000;
  const H = compact ? 300 : 600;
  const pos = useMemo(() => layout(players.length, W, H), [players.length, W, H]);
  const index = useMemo(() => new Map(players.map((p, i) => [p._id, i])), [players]);
  const edges = useMemo(() => neighbours(pos, players.length > 14 ? 3 : 2), [pos, players.length]);
  const r = compact ? (players.length > 20 ? 11 : 15) : players.length > 30 ? 20 : players.length > 14 ? 26 : 34;

  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [confirmed, setConfirmed] = useState<Tx[]>([]);
  const seenTx = useRef<Set<string> | null>(null);
  const lastBlock = useRef<number | null>(null);

  const addRipple = (rp: Ripple, ms = 2200) => {
    setRipples((l) => [...l.slice(-12), rp]);
    setTimeout(() => setRipples((l) => l.filter((x) => x.id !== rp.id)), ms);
  };

  // a new transaction ripples out from its sender (it is broadcast to everyone)
  useEffect(() => {
    const all = [...game.pending, ...(game.mining?.status === "open" ? game.mining.txs : [])];
    if (!seenTx.current) {
      seenTx.current = new Set(all.map((t) => t.id));
      return;
    }
    for (const t of all) {
      if (seenTx.current.has(t.id)) continue;
      seenTx.current.add(t.id);
      const i = index.get(t.from);
      if (i === undefined || !pos[i]) continue;
      addRipple({ id: `tx-${t.id}`, ...pos[i], color: players[i].color, big: false }, 1600);
    }
  }, [game.pending, game.mining, index, pos, players]);

  // a new block floods the whole network from the miner
  useEffect(() => {
    const last = game.chain[game.chain.length - 1];
    if (lastBlock.current === null) {
      lastBlock.current = last.index;
      return;
    }
    if (last.index <= lastBlock.current) {
      lastBlock.current = last.index;
      return;
    }
    lastBlock.current = last.index;
    const i = index.get(last.miner);
    if (i !== undefined && pos[i]) addRipple({ id: `blk-${last.index}`, ...pos[i], color: "#109c6c", big: true }, 2600);
    setConfirmed(last.txs);
    const t = setTimeout(() => setConfirmed([]), 2600);
    return () => clearTimeout(t);
  }, [game.chain, index, pos]);

  const openTxs = game.mining?.status === "open" ? game.mining.txs : [];
  const work = game.mining?.status === "open" ? game.mining.work : {};
  const maxWork = Math.max(1, ...Object.values(work));

  const flowing = game.phase === "send" || game.phase === "mine";
  const recent = new Set(game.pending.slice(-5).map((t) => t.id));
  const line = (t: Tx, kind: "pending" | "sealing" | "done") => {
    const a = index.get(t.from);
    const b = index.get(t.to);
    if (a === undefined || b === undefined || !pos[a] || !pos[b]) return null;
    const p = pos[a];
    const q = pos[b];
    const mx = (p.x + q.x) / 2;
    const my = (p.y + q.y) / 2 - Math.hypot(q.x - p.x, q.y - p.y) * 0.18;
    const d = `M${p.x},${p.y} Q${mx},${my} ${q.x},${q.y}`;
    const color = kind === "done" ? "var(--color-ok)" : kind === "sealing" ? "var(--color-hl-pink)" : players[a].color;
    return (
      <motion.g
        key={`${kind}-${t.id}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.6 } }}
      >
        <motion.path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={compact ? 2 : kind === "done" ? 5 : 3.5}
          strokeLinecap="round"
          className={kind === "done" ? "" : "marching"}
          initial={{ pathLength: kind === "done" ? 1 : 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        />
        {!compact && (kind !== "pending" || recent.has(t.id)) && (
          <g transform={`translate(${(p.x + 2 * mx + q.x) / 4},${(p.y + 2 * my + q.y) / 4})`}>
            <rect x={-26} y={-15} width={52} height={28} rx={6} fill="#fff3a6" stroke="var(--color-ink)" strokeWidth={1.5} />
            <text textAnchor="middle" y={5} fontSize={15} fontWeight={750} fill="var(--color-ink)" className="mono">
              {t.amount}
            </text>
          </g>
        )}
      </motion.g>
    );
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full overflow-visible" role="img" aria-label={`Network of ${players.length} nodes`}>
      {/* peer links */}
      <g>
        {edges.map(([i, j]) => {
          const bad = players[i]?.tampered || players[j]?.tampered;
          return (
            <motion.line
              key={`${players[i]?._id}-${players[j]?._id}`}
              x1={pos[i].x}
              y1={pos[i].y}
              x2={pos[j].x}
              y2={pos[j].y}
              stroke={bad ? "var(--color-bad)" : "var(--color-ink-faint)"}
              strokeWidth={compact ? 1 : 1.6}
              strokeDasharray={bad ? "4 6" : undefined}
              initial={{ opacity: 0 }}
              animate={{ opacity: bad ? 0.9 : 0.55 }}
              transition={{ duration: 0.8 }}
            />
          );
        })}
      </g>

      {/* ripples: broadcasts and new blocks */}
      <AnimatePresence>
        {ripples.map((rp) => (
          <motion.circle
            key={rp.id}
            cx={rp.x}
            cy={rp.y}
            fill="none"
            stroke={rp.color}
            strokeWidth={rp.big ? 6 : 3}
            initial={{ r: r, opacity: 0.9 }}
            animate={{ r: rp.big ? W : r * 4, opacity: 0 }}
            transition={{ duration: rp.big ? 2.4 : 1.4, ease: "easeOut" }}
          />
        ))}
      </AnimatePresence>

      {/* money on the move */}
      <AnimatePresence>
        {flowing && game.pending.slice(-14).map((t) => line(t, "pending"))}
        {flowing && openTxs.map((t) => line(t, "sealing"))}
        {flowing && confirmed.map((t) => line(t, "done"))}
      </AnimatePresence>

      {/* nodes */}
      {players.map((p, i) => {
        const { x, y } = pos[i];
        const me = p._id === meId;
        const share = (work[p._id] ?? 0) / maxWork;
        return (
          <motion.g
            key={p._id}
            initial={{ opacity: 0, scale: 0.2, x, y }}
            animate={{ opacity: 1, scale: 1, x, y }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
          >
            {showWork && share > 0 && (
              <motion.circle
                r={r * (1.15 + share * 0.9)}
                fill={p.color}
                animate={{ opacity: [0.18, 0.38, 0.18] }}
                transition={{ duration: 0.9, repeat: Infinity }}
              />
            )}
            {me && (
              <motion.circle
                r={r + 9}
                fill="none"
                stroke="var(--color-hl-pink)"
                strokeWidth={4}
                animate={{ r: [r + 6, r + 12, r + 6] }}
                transition={{ duration: 1.6, repeat: Infinity }}
              />
            )}
            <circle r={r} fill={p.tampered ? "#ffe3e5" : "#fff"} stroke={p.tampered ? "var(--color-bad)" : p.color} strokeWidth={compact ? 2.5 : 4} />
            <text textAnchor="middle" dominantBaseline="central" fontSize={r * 1.05} y={1}>
              {p.emoji}
            </text>
            {p.tampered && (
              <g>
                <motion.text
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={r * 1.8}
                  fill="var(--color-bad)"
                  fontWeight={800}
                  initial={{ scale: 2, opacity: 0 }}
                  animate={{ scale: 1, opacity: 0.85 }}
                >
                  ✕
                </motion.text>
              </g>
            )}
            {(!compact || players.length <= 16 || me) && (
              <text
                y={r + (compact ? 13 : 22)}
                textAnchor="middle"
                fontSize={compact ? 11 : players.length > 30 ? 15 : 18}
                fontWeight={me ? 800 : 650}
                fill={p.tampered ? "var(--color-bad)" : "var(--color-ink)"}
                paintOrder="stroke"
                stroke="var(--color-paper)"
                strokeWidth={5}
              >
                {p.name}
              </text>
            )}
          </motion.g>
        );
      })}
    </svg>
  );
}
