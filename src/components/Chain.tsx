"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef } from "react";
import { hashHue, shortHash, verifyChain, type BlockCheck } from "@/lib/chain";
import type { Block } from "@/lib/types";

/** A hash drawn as a coloured rubber stamp, so a change is visible without reading hex. */
export function Fingerprint({ hash, bad, size = 44 }: { hash: string; bad?: boolean; size?: number }) {
  const hue = hashHue(hash);
  const bits = hash.slice(0, 16).split("").map((c) => parseInt(c, 16));
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden className="shrink-0">
      <circle cx={20} cy={20} r={18} fill={`hsl(${hue} 85% 92%)`} stroke={bad ? "var(--color-bad)" : `hsl(${hue} 70% 38%)`} strokeWidth={2.5} />
      {bits.map((b, i) => {
        const a = (i / bits.length) * Math.PI * 2;
        const len = 4 + (b / 15) * 9;
        return (
          <line
            key={i}
            x1={20 + Math.cos(a) * 4}
            y1={20 + Math.sin(a) * 4}
            x2={20 + Math.cos(a) * (4 + len)}
            y2={20 + Math.sin(a) * (4 + len)}
            stroke={bad ? "var(--color-bad)" : `hsl(${(hue + b * 9) % 360} 70% 40%)`}
            strokeWidth={2}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

export function LeadingZeros({ hash, zeros, className = "" }: { hash: string; zeros: number; className?: string }) {
  let lead = 0;
  while (lead < hash.length && hash[lead] === "0") lead++;
  const hit = lead >= zeros;
  return (
    <span className={`mono ${className}`}>
      <span className={hit ? "text-ok font-bold" : lead ? "text-ok" : ""}>{hash.slice(0, lead)}</span>
      <span>{hash.slice(lead, 12)}</span>
      <span className="text-ink-faint">…</span>
    </span>
  );
}

export function BlockCard({
  block,
  check,
  order = 0,
  onPickTx,
  compact = false,
  fresh = false,
  wide = false,
}: {
  wide?: boolean;
  block: Block;
  check: BlockCheck;
  order?: number;
  onPickTx?: (txIndex: number) => void;
  compact?: boolean;
  fresh?: boolean;
}) {
  const bad = !check.valid;
  const genesis = block.index === 0;
  const shown = compact ? block.txs.slice(0, 2) : block.txs.slice(0, onPickTx ? 8 : 4);
  const more = block.txs.length - shown.length;
  return (
    <motion.article
      layout
      initial={fresh ? { y: -80, rotate: -8, opacity: 0, scale: 1.2 } : { opacity: 0, y: 16 }}
      animate={{
        y: 0,
        opacity: 1,
        scale: 1,
        rotate: bad ? [0, -2.5, 2.5, -1.5, 0] : order % 2 ? 0.8 : -0.8,
        backgroundColor: bad ? "#fff0f1" : "#ffffff",
      }}
      transition={{
        type: "spring",
        stiffness: 220,
        damping: 16,
        delay: bad ? 0.35 * order : 0,
        backgroundColor: { delay: bad ? 0.35 * order : 0 },
      }}
      className={`sheet tape relative flex shrink-0 flex-col ${compact ? "w-[210px] gap-1.5 p-3" : wide ? "w-[290px] gap-2 p-4" : "w-full gap-2 p-4"} ${
        bad ? "!border-bad !shadow-[3px_3px_0_var(--color-bad)]" : ""
      }`}
    >
      <header className="flex items-baseline justify-between gap-2">
        <h3 className={`display font-extrabold ${compact ? "text-xl" : "text-2xl"}`}>
          {genesis ? "Genesis" : `Block ${block.index}`}
        </h3>
        <span className="truncate text-xs font-semibold text-ink-soft">
          {genesis ? "the first page" : `sealed by ${block.minerName}`}
        </span>
      </header>

      <ul className="flex flex-col gap-1 border-y border-dashed border-rule-strong py-1.5">
        {shown.length === 0 && <li className="text-sm text-ink-faint italic">no payments — just the reward</li>}
        {shown.map((t, i) => {
          const hacked = t.id.startsWith("hack");
          const Row = onPickTx ? "button" : "div";
          return (
            <li key={t.id + i}>
              <Row
                {...(onPickTx ? { onClick: () => onPickTx(i), type: "button" as const } : {})}
                className={`flex w-full items-center justify-between gap-2 rounded px-1 text-left ${compact ? "text-xs" : "text-sm"} ${
                  onPickTx && !hacked ? "hover:bg-hl-yellow/60 active:bg-hl-yellow" : ""
                } ${hacked ? "bg-bad/10 text-bad" : ""}`}
              >
                <span className="truncate font-semibold">
                  {t.fromName} → {t.toName}
                </span>
                <span className={`mono font-bold ${hacked ? "line-through-none" : ""}`}>
                  {t.amount.toLocaleString("en-US")}
                  {onPickTx && !hacked && <span className="ml-1 text-ink-faint">✎</span>}
                </span>
              </Row>
            </li>
          );
        })}
        {more > 0 && <li className="text-xs text-ink-soft">+ {more} more</li>}
      </ul>

      <div className="flex items-center gap-2">
        <Fingerprint hash={check.actual} bad={bad} size={compact ? 34 : 44} />
        <div className="min-w-0 text-[11px] leading-tight">
          <div className="text-ink-soft">fingerprint</div>
          <div className={`mono truncate font-bold ${check.edited ? "text-bad" : ""}`}>{shortHash(check.actual, 6)}</div>
          {!genesis && (
            <div className={`mono truncate ${check.linkBroken ? "text-bad" : "text-ink-soft"}`}>
              ↖ {shortHash(block.prevHash, 4)}
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {bad && (
          <motion.div
            initial={{ scale: 2.4, opacity: 0, rotate: -18 }}
            animate={{ scale: 1, opacity: 1, rotate: -12 }}
            transition={{ delay: 0.35 * order + 0.15, type: "spring", stiffness: 300, damping: 14 }}
            className="pointer-events-none absolute right-2 bottom-12 rounded border-[3px] border-bad px-2 py-0.5 text-sm font-extrabold tracking-wide text-bad"
          >
            {check.edited ? "CHANGED" : "BROKEN LINK"}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

function Link({ broken, vertical }: { broken: boolean; vertical?: boolean }) {
  return (
    <div className={`flex shrink-0 items-center justify-center ${vertical ? "h-14 w-full" : "w-10 self-center"}`} aria-hidden>
      <svg width="34" height="22" viewBox="0 0 34 22" className={vertical ? "rotate-90" : ""}>
        <rect x={2} y={5} width={16} height={12} rx={6} fill="none" stroke={broken ? "var(--color-bad)" : "var(--color-ink)"} strokeWidth={3} />
        <rect
          x={16}
          y={5}
          width={16}
          height={12}
          rx={6}
          fill="none"
          stroke={broken ? "var(--color-bad)" : "var(--color-ink)"}
          strokeWidth={3}
          transform={broken ? "rotate(28 24 11) translate(5 -3)" : undefined}
        />
      </svg>
    </div>
  );
}

/** The ledger. Each viewer verifies it themselves — exactly what a node does. */
export function Chain({
  blocks,
  vertical = false,
  onPickTx,
  compact = false,
  wide = false,
}: {
  wide?: boolean;
  blocks: Block[];
  vertical?: boolean;
  onPickTx?: (blockIndex: number, txIndex: number) => void;
  compact?: boolean;
}) {
  const checks = useMemo(() => verifyChain(blocks), [blocks]);
  const firstBad = checks.findIndex((c) => !c.valid);
  const scroller = useRef<HTMLDivElement>(null);
  const known = useRef<number>(blocks.length);
  const newest = blocks.length > known.current ? blocks.length - 1 : -1;

  useEffect(() => {
    known.current = blocks.length;
    const el = scroller.current;
    if (!el || vertical) return;
    el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
  }, [blocks.length, vertical]);

  return (
    <div
      ref={scroller}
      className={vertical ? "flex flex-col items-stretch" : "no-scrollbar flex items-start overflow-x-auto px-4 pt-5 pb-3"}
    >
      {blocks.map((b, i) => (
        <div key={`${b.index}-${b.hash.slice(0, 8)}`} className={vertical ? "contents" : "flex items-start"}>
          {i > 0 && <Link broken={checks[i].linkBroken || (firstBad >= 0 && i > firstBad)} vertical={vertical} />}
          <BlockCard
            block={b}
            check={checks[i]}
            order={firstBad >= 0 ? Math.max(0, i - firstBad) : 0}
            compact={compact}
            wide={wide}
            fresh={i === newest}
            onPickTx={onPickTx ? (t) => onPickTx(i, t) : undefined}
          />
        </div>
      ))}
    </div>
  );
}
