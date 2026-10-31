"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { Tx } from "@/lib/types";

const tilt = (id: string) => ((id.charCodeAt(0) + id.charCodeAt(id.length - 1)) % 7) - 3;

/** Unconfirmed payments: sticky notes waiting to be copied into the next page of the ledger. */
export function Mempool({ txs, max = 12, small = false, meId }: { txs: Tx[]; max?: number; small?: boolean; meId?: string }) {
  const shown = txs.slice(0, max);
  return (
    <div className={`grid ${small ? "grid-cols-2 gap-2" : "grid-cols-2 gap-3 xl:grid-cols-3"}`}>
      <AnimatePresence mode="popLayout">
        {shown.map((t) => {
          const mine = meId && (t.from === meId || t.to === meId);
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ scale: 1.6, opacity: 0, rotate: tilt(t.id) * 4, y: -30 }}
              animate={{ scale: 1, opacity: 1, rotate: tilt(t.id), y: 0 }}
              exit={{ scale: 0.6, opacity: 0, x: 60, rotate: 20, transition: { duration: 0.35 } }}
              transition={{ type: "spring", stiffness: 380, damping: 20 }}
              className={`note rounded-sm ${small ? "px-2.5 py-2" : "px-3 py-2.5"} ${mine ? "outline-2 outline-hl-pink" : ""}`}
            >
              <div className={`truncate font-bold ${small ? "text-xs" : "text-sm"}`}>
                {t.fromName} → {t.toName}
              </div>
              <div className={`mono font-extrabold ${small ? "text-lg" : "text-2xl"}`}>
                {t.amount} <span className="text-xs font-semibold">AIR</span>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
      {txs.length > max && (
        <div className="self-center text-sm font-semibold text-ink-soft">+ {txs.length - max} more waiting</div>
      )}
    </div>
  );
}
