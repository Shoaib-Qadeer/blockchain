import type { Phase } from "./types";

/** What each round asks people to do, and the one idea it leaves them with. Shown on phones and the projector. */
export type Round = {
  number: number | null;
  title: string;
  goal: string;
  /** the takeaway, shown when the NEXT round starts */
  lesson: string | null;
};

export const ROUNDS: Record<Phase, Round> = {
  lobby: {
    number: null,
    title: "Join the network",
    goal: "Your phone is now a node: it keeps its own copy of the ledger.",
    lesson: "There's no bank here. Every phone keeps the same record of who owns what.",
  },
  send: {
    number: 1,
    title: "Pay someone",
    goal: "Send AIR to a classmate. Notice it doesn't arrive straight away.",
    lesson: "A payment is announced to everyone, then waits in line. It isn't final until it's sealed in a block.",
  },
  mine: {
    number: 2,
    title: "Mine a block",
    goal: "Tap to guess numbers. The first phone to find a fingerprint starting with 0000 seals the waiting payments and wins 5 AIR.",
    lesson: "Sealing a block takes thousands of guesses, but anyone can check the winning guess instantly. That's proof of work.",
  },
  tamper: {
    number: 3,
    title: "Try to cheat",
    goal: "Rewrite an old payment so it pays you 1000 AIR, and see what happens to your copy.",
    lesson: "Change one payment and every fingerprint after it breaks. The honest copies outvote yours.",
  },
  market: {
    number: 4,
    title: "Trade AIR",
    goal: "You have €100. Buy and sell AIR. Watch the news — and each other.",
    lesson: "Nothing about AIR changed. Only news and crowd behaviour moved the price. That's volatility.",
  },
  results: {
    number: null,
    title: "Results",
    goal: "Look up at the big screen.",
    lesson: null,
  },
};

export const TOTAL_ROUNDS = 4;

export const NEXT_PHASE: Record<Phase, Phase | null> = {
  lobby: "send",
  send: "mine",
  mine: "tamper",
  tamper: "market",
  market: "results",
  results: null,
};

/** Autopilot: how long each round lasts, in seconds. Lobby waits for the host; results stays. */
export const ROUND_SECONDS: Partial<Record<Phase, number>> = {
  send: 35,
  mine: 55,
  tamper: 35,
  market: 80,
};

/** Autopilot: the news the market gets, in seconds after it opens. Good, bad, freeze, good, bad. */
export const NEWS_PLAN: { at: number; cardId: string }[] = [
  { at: 14, cardId: "tweet" },
  { at: 29, cardId: "founder" },
  { at: 43, cardId: "hack" },
  { at: 58, cardId: "listing" },
  { at: 70, cardId: "ban" },
];

export const SHOW_SECONDS = Object.values(ROUND_SECONDS).reduce((s, v) => s + (v ?? 0), 0);
