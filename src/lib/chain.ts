import { sha256 } from "js-sha256";
import type { Block, Tx } from "./types";

/** The same functions run on phones (to mine and to verify) and on the server. */

export const GENESIS_PREV = "0".repeat(64);

export function txLine(t: Pick<Tx, "from" | "to" | "amount">) {
  return `${t.from}>${t.to}:${t.amount}`;
}

export function txLines(txs: Pick<Tx, "from" | "to" | "amount">[]) {
  return txs.map(txLine).join(";");
}

/** Everything a miner hashes, except the nonce they are guessing. */
export function headerPrefix(index: number, prevHash: string, txs: Tx[], miner: string) {
  return `${index}|${prevHash}|${txLines(txs)}|${miner}|`;
}

export function hashBlock(b: Pick<Block, "index" | "prevHash" | "txs" | "miner" | "nonce">) {
  return sha256(headerPrefix(b.index, b.prevHash, b.txs, b.miner) + b.nonce);
}

export function meetsTarget(hash: string, zeros: number) {
  for (let i = 0; i < zeros; i++) if (hash[i] !== "0") return false;
  return true;
}

export type BlockCheck = {
  /** hash recomputed from the block's current contents */
  actual: string;
  /** contents were changed after sealing */
  edited: boolean;
  /** prevHash no longer matches the block before it */
  linkBroken: boolean;
  valid: boolean;
};

/** What every node does: recompute each fingerprint and check the links. */
export function verifyChain(blocks: Block[]): BlockCheck[] {
  const out: BlockCheck[] = [];
  let broken = false;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const actual = hashBlock(b);
    const edited = actual !== b.hash;
    const linkBroken = i > 0 && b.prevHash !== out[i - 1].actual;
    if (edited || linkBroken) broken = true;
    out.push({ actual, edited, linkBroken, valid: !broken });
  }
  return out;
}

export function makeGenesis(at: number): Block {
  const txs: Tx[] = [
    { id: "genesis", from: "NETWORK", to: "EVERYONE", fromName: "Network", toName: "Every new node", amount: 100, at },
  ];
  const b = { index: 0, prevHash: GENESIS_PREV, txs, miner: "genesis", minerName: "Genesis", nonce: 0 };
  return { ...b, hash: hashBlock(b), zeros: 0, reward: 0, at };
}

/** A friendly short form of a hash, e.g. "00a3·f91c". */
export function shortHash(h: string, n = 4) {
  return `${h.slice(0, n)}…${h.slice(-n)}`;
}

/** Turn a hash into a colour, so changes are visible without reading hex. */
export function hashHue(h: string) {
  return parseInt(h.slice(-6), 16) % 360;
}
