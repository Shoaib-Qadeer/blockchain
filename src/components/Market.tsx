"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { fmt, fmtAir } from "@/lib/client";
import { newsById } from "@/lib/news";
import type { Market, NewsEvent } from "@/lib/types";

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 600, h: 300 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      if (width > 0 && height > 0) setSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

export function PriceChart({ market, now, compact = false }: { market: Market; now: number; compact?: boolean }) {
  const [ref, { w: W, h: H }] = useSize<HTMLDivElement>();
  return (
    <div ref={ref} className="relative h-full w-full overflow-hidden">
      <ChartSvg market={market} now={now} compact={compact} W={W} H={H} />
    </div>
  );
}

function ChartSvg({ market, now, compact, W, H }: { market: Market; now: number; compact: boolean; W: number; H: number }) {
  const pad = { l: compact ? 6 : 64, r: compact ? 16 : 28, t: 18, b: compact ? 10 : 18 };
  const pts = market.prices;
  const t0 = market.startedAt;
  const t1 = Math.max(now, t0 + 30_000, pts[pts.length - 1]?.[0] ?? 0);
  const prices = pts.map((p) => p[1]);
  const lo = Math.min(1, ...prices) * 0.85;
  const hi = Math.max(1, ...prices) * 1.12;
  // log scale: a doubling looks the same size as a halving
  const ly = (v: number) => Math.log(v);
  const x = (t: number) => pad.l + ((t - t0) / (t1 - t0)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (ly(v) - ly(lo)) / (ly(hi) - ly(lo))) * (H - pad.t - pad.b);

  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1] ?? [t0, 1];
  const ext = `${line} L${x(now).toFixed(1)},${y(last[1]).toFixed(1)}`;
  const area = `${ext} L${x(now).toFixed(1)},${H - pad.b} L${pad.l},${H - pad.b} Z`;
  const up = last[1] >= market.first;

  const ticks = useMemo(() => {
    const out: number[] = [];
    const cands = [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 3, 5, 10, 20, 50, 100];
    for (const c of cands) if (c > lo && c < hi) out.push(c);
    return out;
  }, [lo, hi]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="absolute inset-0" role="img" aria-label={`AIR price chart, now €${fmt(last[1])}`}>
      <defs>
        <pattern id="hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <rect width="10" height="10" fill={up ? "#e7fbf2" : "#ffeef0"} />
          <line x1="0" y1="0" x2="0" y2="10" stroke={up ? "#7ff0c4" : "#ffb3bb"} strokeWidth="5" />
        </pattern>
      </defs>
      {!compact &&
        ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--color-rule-strong)" strokeDasharray={v === 1 ? "0" : "3 6"} strokeWidth={v === 1 ? 2 : 1} />
            <text x={pad.l - 10} y={y(v) + 5} textAnchor="end" fontSize={16} fill="var(--color-ink-soft)" className="mono">
              €{v}
            </text>
          </g>
        ))}
      {compact && <line x1={pad.l} x2={W - pad.r} y1={y(1)} y2={y(1)} stroke="var(--color-rule-strong)" strokeDasharray="4 6" strokeWidth={2} />}
      <path d={area} fill="url(#hatch)" opacity={0.9} />
      <path d={ext} fill="none" stroke="var(--color-ink)" strokeWidth={compact ? 3 : 4.5} strokeLinejoin="round" strokeLinecap="round" />
      <g transform={`translate(${x(now)},${y(last[1])})`}>
        <motion.circle r={14} fill={up ? "var(--color-ok)" : "var(--color-bad)"} animate={{ r: [8, 20, 8], opacity: [0.5, 0, 0.5] }} transition={{ duration: 1.2, repeat: Infinity }} />
        <circle r={7} fill={up ? "var(--color-ok)" : "var(--color-bad)"} stroke="#fff" strokeWidth={2} />
      </g>
    </svg>
  );
}

/** Big ticking price number that flashes green or red when it moves. */
export function PriceTicker({ price, first, className = "" }: { price: number; first: number; className?: string }) {
  const prev = useRef(price);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  useEffect(() => {
    if (price > prev.current * 1.0005) setFlash("up");
    else if (price < prev.current * 0.9995) setFlash("down");
    prev.current = price;
    const t = setTimeout(() => setFlash(null), 450);
    return () => clearTimeout(t);
  }, [price]);
  const change = (price / first - 1) * 100;
  return (
    <div className={className}>
      <motion.div
        key={flash ? `${flash}-${price}` : "still"}
        initial={flash ? { scale: 1.08 } : false}
        animate={{ scale: 1 }}
        className={`display font-extrabold tabular-nums transition-colors duration-300 ${
          flash === "up" ? "text-ok" : flash === "down" ? "text-bad" : ""
        }`}
      >
        €{fmt(price, price < 0.1 ? 3 : 2)}
      </motion.div>
      <div className={`mono font-bold ${change >= 0 ? "text-ok" : "text-bad"}`}>
        {change >= 0 ? "▲" : "▼"} {fmt(Math.abs(change), 1)}% since launch
      </div>
    </div>
  );
}

export function TradeFeed({ market, max = 8 }: { market: Market; max?: number }) {
  return (
    <ul className="flex flex-col gap-1.5">
      <AnimatePresence initial={false}>
        {market.feed.slice(0, max).map((f) => (
          <motion.li
            key={`${f.at}-${f.name}-${f.air}`}
            layout
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-between gap-2 border-b border-dashed border-rule-strong pb-1 text-sm"
          >
            <span className="truncate font-semibold">{f.name}</span>
            <span className={`mono shrink-0 font-bold ${f.side === "buy" ? "text-ok" : "text-bad"}`}>
              {f.side === "buy" ? "bought" : "sold"} {fmtAir(f.air)} AIR
            </span>
          </motion.li>
        ))}
      </AnimatePresence>
      {market.feed.length === 0 && <li className="text-sm text-ink-soft">No trades yet. Who goes first?</li>}
    </ul>
  );
}

/** Breaking news slapped onto the screen like a sticky note. */
export function NewsFlash({ news, now, big = false }: { news: NewsEvent | null; now: number; big?: boolean }) {
  const card = news ? newsById(news.cardId) : undefined;
  const visible = !!(news && card && now - news.at < (big ? 7000 : 5000) && now - news.at > -2000);
  return (
    <AnimatePresence>
      {visible && card && (
        <motion.div
          key={news!.id}
          className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center p-6"
          initial={{ backgroundColor: "rgba(27,37,89,0)" }}
          animate={{ backgroundColor: "rgba(27,37,89,0.35)" }}
          exit={{ backgroundColor: "rgba(27,37,89,0)", transition: { duration: 0.4 } }}
        >
          <motion.div
            initial={{ scale: 2.2, rotate: -14, opacity: 0 }}
            animate={{ scale: 1, rotate: card.mood === "good" ? -2.5 : 2.5, opacity: 1 }}
            exit={{ y: 300, rotate: 25, opacity: 0, transition: { duration: 0.5 } }}
            transition={{ type: "spring", stiffness: 420, damping: 17 }}
            className={`note relative rounded-sm ${big ? "w-[min(900px,90vw)] p-12" : "w-full max-w-sm p-6"}`}
          >
            <div
              className={`absolute -top-4 left-6 rounded-full border-2 border-ink px-3 py-0.5 font-extrabold ${big ? "text-2xl" : "text-sm"} ${
                card.mood === "good" ? "bg-hl-mint" : "bg-hl-pink"
              }`}
            >
              Breaking news
            </div>
            <div className={big ? "text-[120px] leading-none" : "text-6xl"}>{card.emoji}</div>
            <div className={`display mt-3 font-extrabold ${big ? "text-7xl" : "text-3xl"}`}>{card.title}</div>
            <div className={`mt-3 font-semibold text-ink-soft ${big ? "text-3xl" : "text-lg"}`}>{card.sub}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
