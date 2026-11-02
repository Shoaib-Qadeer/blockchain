import { nanoid } from "nanoid";
import { cols, GAME_ID } from "./db";
import { hashBlock, headerPrefix, makeGenesis, meetsTarget } from "./chain";
import { sha256 } from "js-sha256";
import { newsById } from "./news";
import { NEWS_PLAN, NEXT_PHASE, ROUND_SECONDS } from "./rounds";
import {
  BLOCK_TX_LIMIT,
  MEMPOOL_LIMIT,
  REWARD,
  START_AIR,
  START_EUR,
  type Block,
  type Game,
  type MiningRound,
  type Phase,
  type Player,
  type PlayerDoc,
  type Tx,
} from "./types";

export class GameError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const round2 = (n: number) => Math.round(n * 100) / 100;

const EMOJI = [
  "🦊", "🐼", "🐙", "🦉", "🐢", "🦄", "🐝", "🦁", "🐧", "🐬", "🦒", "🐨",
  "🦩", "🐸", "🦔", "🐳", "🦜", "🐯", "🐻", "🦋", "🐞", "🦦", "🐺", "🦭",
  "🐰", "🦓", "🐮", "🐷", "🐵", "🦥", "🦘", "🦚", "🐊", "🦈", "🐹", "🦖",
];
const COLORS = [
  "#3D5AFE", "#FF4F8B", "#00A88F", "#FF8A00", "#8E44EC", "#E53935",
  "#0091EA", "#C2A100", "#2E7D32", "#D81B60", "#5E35B1", "#00838F",
];

export function freshGame(): Game {
  const now = Date.now();
  return {
    _id: GAME_ID,
    version: 1,
    tick: 1,
    phase: "lobby",
    createdAt: now,
    chain: [makeGenesis(now)],
    pending: [],
    mining: null,
    market: null,
    news: null,
    phaseStartedAt: now,
    phaseEndsAt: null,
    autopilot: false,
    autoNews: 0,
  };
}

export async function getGame(): Promise<Game> {
  const { games } = await cols();
  const g = await games.findOne({ _id: GAME_ID });
  if (g) return g;
  try {
    await games.insertOne(freshGame());
  } catch {
    /* another request created it first */
  }
  return (await games.findOne({ _id: GAME_ID }))!;
}

export async function listPlayers(): Promise<Player[]> {
  const { players } = await cols();
  return players
    .find({}, { projection: { token: 0, nameKey: 0 } })
    .sort({ joinedAt: 1 })
    .toArray() as Promise<Player[]>;
}

async function touch() {
  const { games } = await cols();
  await games.updateOne({ _id: GAME_ID }, { $inc: { tick: 1 } });
}

/** Read → change → write, retried if someone else changed the ledger in between. */
async function mutate(fn: (g: Game) => Partial<Game> | null): Promise<Game> {
  const { games } = await cols();
  for (let i = 0; i < 12; i++) {
    const g = await getGame();
    const set = fn(g);
    if (!set) return g;
    const r = await games.updateOne(
      { _id: GAME_ID, version: g.version },
      { $set: set, $inc: { version: 1, tick: 1 } }
    );
    if (r.modifiedCount) return { ...g, ...set, version: g.version + 1 };
    await sleep(10 + Math.random() * 60);
  }
  throw new GameError("The network is busy — try again.", 503);
}

async function auth(id: unknown, token: unknown): Promise<PlayerDoc> {
  if (typeof id !== "string" || typeof token !== "string") throw new GameError("Join the network first.", 401);
  const { players } = await cols();
  const p = await players.findOne({ _id: id, token });
  if (!p) throw new GameError("Your node isn't on this network any more. Join again.", 401);
  return p;
}

/* ------------------------------------------------------------------ join */

export async function join(rawName: unknown) {
  const name = String(rawName ?? "")
    .replace(/[^\p{L}\p{N} '\-_.]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 14);
  if (name.length < 2) throw new GameError("Pick a name with at least 2 letters.");
  const game = await getGame();
  const { players } = await cols();
  const taken = await players.find({}, { projection: { emoji: 1, color: 1 } }).toArray();
  const count = taken.length;
  if (count >= 80) throw new GameError("The network is full.");
  const used = new Set(taken.map((p) => p.emoji));
  const free = EMOJI.filter((e) => !used.has(e));
  const emoji = free.length ? free[Math.floor(Math.random() * free.length)] : EMOJI[count % EMOJI.length];
  const doc: PlayerDoc = {
    _id: nanoid(10),
    token: nanoid(24),
    name,
    nameKey: name.toLowerCase(),
    emoji,
    color: COLORS[count % COLORS.length],
    air: START_AIR,
    eur: START_EUR, // everyone holds €100 from the start; it only becomes usable in the market
    joinedAt: Date.now(),
    tampered: false,
    hashes: 0,
    blocks: 0,
    trades: 0,
  };
  try {
    await players.insertOne(doc);
  } catch {
    throw new GameError(`“${name}” is taken — try another name.`);
  }
  await touch();
  return { id: doc._id, token: doc.token, gameId: game.createdAt };
}

/* ------------------------------------------------------------------ send */

export async function send(id: unknown, token: unknown, to: unknown, rawAmount: unknown) {
  const me = await auth(id, token);
  const game = await getGame();
  if (game.phase !== "send" && game.phase !== "mine") throw new GameError("Sending is closed right now.");
  const amount = Math.floor(Number(rawAmount));
  if (!Number.isFinite(amount) || amount < 1 || amount > 1000) throw new GameError("Choose an amount.");
  if (to === me._id) throw new GameError("Sending to yourself doesn't do much!");
  const { players, games } = await cols();
  const target = await players.findOne({ _id: String(to) });
  if (!target) throw new GameError("That node left the network.");
  if (game.pending.length >= MEMPOOL_LIMIT) throw new GameError("The waiting room is full — wait for the next block.");

  const debited = await players.updateOne({ _id: me._id, air: { $gte: amount } }, { $inc: { air: -amount } });
  if (!debited.modifiedCount) throw new GameError("Not enough AIR.");

  const tx: Tx = {
    id: nanoid(8),
    from: me._id,
    to: target._id,
    fromName: me.name,
    toName: target.name,
    amount,
    at: Date.now(),
  };
  await games.updateOne({ _id: GAME_ID }, { $push: { pending: tx }, $inc: { version: 1, tick: 1 } });
  return { tx };
}

/* ---------------------------------------------------------------- mining */

function difficulty(nPlayers: number) {
  const n = Math.max(1, nPlayers);
  const zeros = n >= 10 ? 4 : 3;
  // aim for roughly 12 seconds if everyone taps ~4 times a second
  const hashesPerTap = Math.min(600, Math.max(8, Math.round(16 ** zeros / (n * 4 * 12))));
  return { zeros, hashesPerTap };
}

export async function openRound(force: boolean) {
  const { players } = await cols();
  const n = await players.countDocuments();
  return mutate((g) => {
    if (g.mining?.status === "open") return null;
    if (!force && g.pending.length === 0) return null;
    const last = g.chain[g.chain.length - 1];
    const txs = g.pending.slice(0, BLOCK_TX_LIMIT);
    const { zeros, hashesPerTap } = difficulty(n);
    const mining: MiningRound = {
      roundId: nanoid(8),
      status: "open",
      index: last.index + 1,
      prevHash: last.hash,
      txs,
      zeros,
      hashesPerTap,
      openedAt: Date.now(),
      boost: 1,
      work: {},
    };
    return { mining, pending: g.pending.slice(txs.length) };
  });
}

/**
 * Called from the state endpoint, which every screen polls: this is the game's clock.
 * Keeps mining going, and in autopilot ends rounds on time and fires the planned news.
 * Every step first "claims" the change with a conditional update, so many screens polling
 * at once still advance the game exactly once.
 */
export async function autoAdvance(g: Game) {
  const now = Date.now();
  const { games } = await cols();
  let changed = false;

  if (g.phase === "mine" && g.mining?.status === "won" && now - (g.mining.wonAt ?? 0) > 6500 && g.pending.length > 0) {
    await openRound(false);
    changed = true;
  }

  if (g.autopilot && g.phaseEndsAt && now >= g.phaseEndsAt) {
    const next = NEXT_PHASE[g.phase];
    const claim = await games.updateOne(
      { _id: GAME_ID, phase: g.phase, phaseEndsAt: g.phaseEndsAt },
      { $set: { phaseEndsAt: null } }
    );
    if (claim.modifiedCount && next) {
      await setPhase(next);
      return true;
    }
  }

  if (g.autopilot && g.phase === "market" && g.market) {
    const i = g.autoNews ?? 0;
    const plan = NEWS_PLAN[i];
    if (plan && now - g.market.startedAt >= plan.at * 1000) {
      const claim = await games.updateOne({ _id: GAME_ID, autoNews: i }, { $set: { autoNews: i + 1 } });
      if (claim.modifiedCount) {
        await pushNews(plan.cardId);
        changed = true;
      }
    }
  }
  return changed;
}

function deadline(g: Pick<Game, "autopilot">, phase: Phase, now: number) {
  const secs = ROUND_SECONDS[phase];
  return g.autopilot && secs ? now + secs * 1000 : null;
}

/** Autopilot on: the show runs itself from here, round by round. */
export async function startShow() {
  const { games } = await cols();
  const g = await getGame();
  await games.updateOne({ _id: GAME_ID }, { $set: { autopilot: true }, $inc: { tick: 1 } });
  if (g.phase === "lobby") {
    await setPhase("send");
  } else {
    await games.updateOne(
      { _id: GAME_ID },
      { $set: { phaseEndsAt: deadline({ autopilot: true }, g.phase, Date.now()) }, $inc: { tick: 1 } }
    );
  }
}

/** Autopilot off: rounds wait for the host again. */
export async function stopShow() {
  const { games } = await cols();
  await games.updateOne({ _id: GAME_ID }, { $set: { autopilot: false, phaseEndsAt: null }, $inc: { tick: 1 } });
}

export async function reportWork(id: unknown, token: unknown, roundId: unknown, rawHashes: unknown) {
  const me = await auth(id, token);
  const hashes = Math.min(20000, Math.max(0, Math.floor(Number(rawHashes) || 0)));
  if (!hashes) return { ok: true };
  const { players, games } = await cols();
  await Promise.all([
    players.updateOne({ _id: me._id }, { $inc: { hashes } }),
    games.updateOne(
      { _id: GAME_ID, "mining.status": "open", "mining.roundId": String(roundId) },
      { $inc: { [`mining.work.${me._id}`]: hashes, tick: 1 } }
    ),
  ]);
  return { ok: true };
}

export async function submitNonce(id: unknown, token: unknown, roundId: unknown, rawNonce: unknown) {
  const me = await auth(id, token);
  const nonce = Math.floor(Number(rawNonce));
  if (!Number.isFinite(nonce) || nonce < 0) throw new GameError("Bad nonce.");
  const g = await getGame();
  const m = g.mining;
  if (!m || m.roundId !== roundId || m.status !== "open") return { won: false, reason: "too-late" };
  const hash = sha256(headerPrefix(m.index, m.prevHash, m.txs, me._id) + nonce);
  if (!meetsTarget(hash, m.zeros)) throw new GameError("That hash doesn't hit the target.");

  const now = Date.now();
  const block: Block = {
    index: m.index,
    prevHash: m.prevHash,
    txs: m.txs,
    miner: me._id,
    minerName: me.name,
    nonce,
    hash,
    zeros: m.zeros,
    reward: REWARD,
    at: now,
  };
  if (hashBlock(block) !== hash) throw new GameError("Hash mismatch.");

  const { games, players } = await cols();
  const res = await games.updateOne(
    { _id: GAME_ID, "mining.roundId": m.roundId, "mining.status": "open" },
    {
      $set: {
        "mining.status": "won",
        "mining.winner": { id: me._id, name: me.name, nonce, hash },
        "mining.wonAt": now,
      },
      $push: { chain: block },
      $inc: { version: 1, tick: 1 },
    }
  );
  if (!res.modifiedCount) return { won: false, reason: "too-late" };

  // The block is final: money in it now reaches the receivers.
  const ops = m.txs.map((t) => ({ updateOne: { filter: { _id: t.to }, update: { $inc: { air: t.amount } } } }));
  ops.push({ updateOne: { filter: { _id: me._id }, update: { $inc: { air: REWARD, blocks: 1 } } } } as never);
  if (ops.length) await players.bulkWrite(ops as never, { ordered: false });
  await touch();
  return { won: true, block };
}

export async function setTamper(id: unknown, token: unknown, on: unknown) {
  const me = await auth(id, token);
  const { players } = await cols();
  await players.updateOne({ _id: me._id }, { $set: { tampered: Boolean(on) } });
  await touch();
  return { ok: true };
}

/* ---------------------------------------------------------------- market */

/**
 * Constant-product market (x · y = k): the pool holds AIR and €.
 * Buying puts € in and takes AIR out, so AIR gets scarcer and pricier.
 * No new AIR is ever created — supply is fixed, demand moves the price.
 */
async function swap(side: "buy" | "sell", amountIn: number, who: string) {
  const { games } = await cols();
  const now = Date.now();
  const inField = side === "buy" ? "$market.pool.eur" : "$market.pool.air";
  const outField = side === "buy" ? "$market.pool.air" : "$market.pool.eur";
  const outPath = side === "buy" ? "market.pool.air" : "market.pool.eur";
  const inPath = side === "buy" ? "market.pool.eur" : "market.pool.air";

  const after = await games.findOneAndUpdate(
    { _id: GAME_ID, phase: "market", market: { $ne: null }, "market.frozenUntil": { $lte: now } },
    [
      {
        $set: {
          "market.lastOut": {
            $subtract: [outField, { $divide: [{ $multiply: [outField, inField] }, { $add: [inField, amountIn] }] }],
          },
        },
      },
      {
        $set: {
          [inPath]: { $add: [inField, amountIn] },
          [outPath]: { $subtract: [outField, "$market.lastOut"] },
        },
      },
      { $set: { "market._p": { $divide: ["$market.pool.eur", "$market.pool.air"] } } },
      {
        $set: {
          "market.prices": {
            $slice: [{ $concatArrays: ["$market.prices", [[{ $literal: now }, "$market._p"]]] }, -360],
          },
          "market.high": { $max: ["$market.high", "$market._p"] },
          "market.low": { $min: ["$market.low", "$market._p"] },
          "market.trades": { $add: ["$market.trades", 1] },
          "market.feed": {
            $slice: [
              {
                $concatArrays: [
                  [
                    {
                      name: { $literal: who },
                      side: { $literal: side },
                      air: side === "buy" ? "$market.lastOut" : { $literal: amountIn },
                      eur: side === "buy" ? { $literal: amountIn } : "$market.lastOut",
                      at: { $literal: now },
                    },
                  ],
                  "$market.feed",
                ],
              },
              14,
            ],
          },
          tick: { $add: ["$tick", 1] },
        },
      },
      { $unset: "market._p" },
    ],
    { returnDocument: "after" }
  );
  if (!after?.market) return null;
  return { out: after.market.lastOut ?? 0, market: after.market };
}

export async function trade(id: unknown, token: unknown, rawSide: unknown, rawFraction: unknown) {
  const me = await auth(id, token);
  const side = rawSide === "sell" ? "sell" : "buy";
  const fraction = Math.min(1, Math.max(0.05, Number(rawFraction) || 0.25));
  const { players } = await cols();
  const field = side === "buy" ? "eur" : "air";
  const have = me[field];
  const amount = fraction >= 1 ? have : Math.floor(have * fraction * 100) / 100;
  if (amount < 0.01) throw new GameError(side === "buy" ? "You're out of euros." : "You have no AIR to sell.");

  const debit = await players.updateOne({ _id: me._id, [field]: { $gte: amount } }, { $inc: { [field]: -amount } });
  if (!debit.modifiedCount) throw new GameError("Your balance changed — try again.");

  let result: Awaited<ReturnType<typeof swap>> = null;
  try {
    result = await swap(side, amount, me.name);
  } catch (e) {
    await players.updateOne({ _id: me._id }, { $inc: { [field]: amount } });
    throw e;
  }
  if (!result) {
    await players.updateOne({ _id: me._id }, { $inc: { [field]: amount } });
    throw new GameError("Trading is frozen!", 409);
  }
  const outField = side === "buy" ? "air" : "eur";
  await players.updateOne({ _id: me._id }, { $inc: { [outField]: result.out, trades: 1 } });
  return { side, paid: amount, got: result.out };
}

/* ----------------------------------------------------------------- admin */

export async function setPhase(phase: Phase) {
  const { games, players } = await cols();
  // cheaters are forgiven whenever the class moves on
  await players.updateMany({ tampered: true }, { $set: { tampered: false } });
  const now = Date.now();
  const current = await getGame();
  const timing = { phaseStartedAt: now, phaseEndsAt: deadline(current, phase, now) };
  if (phase === "market") {
    const n = await players.countDocuments();
    let refunds: Tx[] = [];
    let created = false;
    await mutate((g) => {
      if (g.market) {
        created = false;
        return g.phase === "market" ? null : { phase, ...timing };
      }
      created = true;
      refunds = [...g.pending, ...(g.mining?.status === "open" ? g.mining.txs : [])];
      const liquidity = 50 * Math.max(4, n);
      return {
        phase,
        ...timing,
        autoNews: 0,
        pending: [],
        mining: g.mining?.status === "open" ? null : g.mining,
        market: {
          startedAt: now,
          pool: { air: liquidity, eur: liquidity },
          prices: [[now, 1]],
          first: 1,
          high: 1,
          low: 1,
          trades: 0,
          feed: [],
          frozenUntil: 0,
        },
      };
    });
    if (created) {
      if (refunds.length) {
        await players.bulkWrite(
          refunds.map((t) => ({ updateOne: { filter: { _id: t.from }, update: { $inc: { air: t.amount } } } })),
          { ordered: false }
        );
      }
      await touch();
    }
    return;
  }

  await games.updateOne({ _id: GAME_ID }, { $set: { phase, news: null, ...timing }, $inc: { tick: 1 } });
  if (phase === "mine") {
    const g = await getGame();
    if (g.mining?.status !== "open") await openRound(true);
  }
}

export async function ease() {
  const { games } = await cols();
  await games.updateOne({ _id: GAME_ID, "mining.status": "open" }, { $mul: { "mining.boost": 4 }, $inc: { tick: 1 } });
}

export async function pushNews(cardId: string) {
  const card = newsById(cardId);
  if (!card) throw new GameError("Unknown news card.");
  const { games } = await cols();
  const now = Date.now();
  const set: Record<string, unknown> = { news: { id: nanoid(6), cardId, at: now } };
  if (card.freezeMs) set["market.frozenUntil"] = now + card.freezeMs;
  await games.updateOne({ _id: GAME_ID }, { $set: set, $inc: { tick: 1 } });
}

export async function whale(side: "buy" | "sell") {
  const g = await getGame();
  if (!g.market) throw new GameError("Open the market first.");
  const amount = side === "buy" ? g.market.pool.eur * 0.45 : g.market.pool.air * 0.6;
  const r = await swap(side, round2(amount), "🐋 A whale");
  if (!r) throw new GameError("Trading is frozen right now.");
}

export async function kick(id: string) {
  const { players } = await cols();
  await players.deleteOne({ _id: id });
  await touch();
}

export async function reset() {
  const { games, players } = await cols();
  const old = await games.findOne({ _id: GAME_ID });
  const fresh = freshGame();
  fresh.version = (old?.version ?? 0) + 1;
  fresh.tick = (old?.tick ?? 0) + 1;
  await players.deleteMany({});
  await games.replaceOne({ _id: GAME_ID }, fresh, { upsert: true });
}
