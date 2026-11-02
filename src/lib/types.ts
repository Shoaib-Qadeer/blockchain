export type Phase = "lobby" | "send" | "mine" | "tamper" | "market" | "results";

export const PHASES: { id: Phase; label: string; hint: string }[] = [
  { id: "lobby", label: "Join", hint: "Waiting for the class to join" },
  { id: "send", label: "Send", hint: "Send AIR to a classmate" },
  { id: "mine", label: "Mine", hint: "Race to seal the next block" },
  { id: "tamper", label: "Cheat", hint: "Try to rewrite history" },
  { id: "market", label: "Market", hint: "Buy and sell AIR" },
  { id: "results", label: "Results", hint: "Who got rich?" },
];

export interface Tx {
  id: string;
  from: string; // player id, or "NETWORK"
  to: string; // player id, or "EVERYONE"
  fromName: string;
  toName: string;
  amount: number;
  at: number;
}

export interface Block {
  index: number;
  prevHash: string;
  txs: Tx[];
  miner: string; // player id, or "genesis"
  minerName: string;
  nonce: number;
  hash: string;
  zeros: number;
  reward: number;
  at: number;
}

export interface MiningRound {
  roundId: string;
  status: "open" | "won";
  index: number;
  prevHash: string;
  txs: Tx[];
  zeros: number;
  hashesPerTap: number;
  openedAt: number;
  boost: number;
  work: Record<string, number>;
  winner?: { id: string; name: string; nonce: number; hash: string };
  wonAt?: number;
}

export interface TradeEvent {
  name: string;
  side: "buy" | "sell";
  air: number;
  eur: number;
  at: number;
}

export interface Market {
  startedAt: number;
  pool: { air: number; eur: number };
  prices: [number, number][];
  first: number;
  high: number;
  low: number;
  trades: number;
  feed: TradeEvent[];
  frozenUntil: number;
  lastOut?: number;
}

export interface NewsEvent {
  id: string;
  cardId: string;
  at: number;
}

export interface Game {
  _id: string;
  /** bumped by changes to the ledger (pending, chain, rounds) — used for safe read-modify-write */
  version: number;
  /** bumped by every change — phones re-render when it moves */
  tick: number;
  phase: Phase;
  createdAt: number;
  chain: Block[];
  pending: Tx[];
  mining: MiningRound | null;
  market: Market | null;
  news: NewsEvent | null;
  /** when the current round started (for countdowns and banners) */
  phaseStartedAt?: number;
  /** autopilot: when the current round ends by itself; null = waits for the host */
  phaseEndsAt?: number | null;
  autopilot?: boolean;
  /** autopilot: index of the next scheduled news card */
  autoNews?: number;
}

export interface Player {
  _id: string;
  name: string;
  emoji: string;
  color: string;
  air: number;
  eur: number;
  joinedAt: number;
  tampered: boolean;
  hashes: number;
  blocks: number;
  trades: number;
}

export interface PlayerDoc extends Player {
  token: string;
  nameKey: string;
}

export interface StateResponse {
  same?: boolean;
  serverNow: number;
  tick: number;
  game?: Game;
  players?: Player[];
}

export const REWARD = 5;
export const START_AIR = 100;
export const START_EUR = 100;
export const BLOCK_TX_LIMIT = 10;
export const MEMPOOL_LIMIT = 40;
