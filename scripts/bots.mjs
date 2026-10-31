#!/usr/bin/env node
/**
 * Rehearsal bots: fill the network with fake classmates so you can practise
 * the whole flow on the projector before class.
 *
 *   npm run bots -- --url https://your-app.vercel.app --n 20
 *
 * Bots join, send AIR, really mine (SHA-256), some try to cheat, and they
 * trade with a herd instinct: good news → buy, bad news → sell, and they
 * chase whatever the price did last.
 */
import jsSha from "js-sha256";

const { sha256 } = jsSha;
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), [])
);
const BASE = (args.url || "http://localhost:3000").replace(/\/$/, "");
const N = Number(args.n || 12);
const NAMES = [
  "Ada", "Bilal", "Chloé", "Dmitri", "Esra", "Farah", "Gabriel", "Hana", "Ines", "Jonas", "Kenji", "Lina",
  "Mateo", "Noor", "Olga", "Pierre", "Qiu", "Rania", "Sven", "Tara", "Umar", "Vera", "Wen", "Yusuf", "Zoé",
];
const NEWS_MOOD = { tweet: 1, bank: 1, listing: 1, hack: -1, ban: -1, founder: -1, fake: -1, energy: -1 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];

async function post(body) {
  const r = await fetch(`${BASE}/api/play`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.status);
  return j;
}

let state = null;
async function poller() {
  for (;;) {
    try {
      const r = await fetch(`${BASE}/api/state?t=-1`);
      const j = await r.json();
      if (j.game) state = j;
    } catch (e) {
      console.error("poll failed:", e.message);
    }
    await sleep(700);
  }
}

function headerPrefix(m, miner) {
  const lines = m.txs.map((t) => `${t.from}>${t.to}:${t.amount}`).join(";");
  return `${m.index}|${m.prevHash}|${lines}|${miner}|`;
}

async function bot(i) {
  const name = `${NAMES[i % NAMES.length]}${i >= NAMES.length ? i : ""}`;
  await sleep(rnd(0, 4000));
  let me;
  try {
    me = await post({ type: "join", name });
  } catch (e) {
    console.error(`${name} could not join: ${e.message}`);
    return;
  }
  console.log(`🤖 ${name} joined`);
  const id = { id: me.id, token: me.token };
  const greedy = Math.random();
  let round = null;
  let nonce = 0;
  let work = 0;
  let lastWork = Date.now();
  let lastNews = null;
  let cheated = false;
  let missing = 0;

  for (;;) {
    await sleep(rnd(180, 320));
    const s = state;
    if (!s) continue;
    const g = s.game;
    const self = s.players.find((p) => p._id === me.id);
    if (!self) {
      if (++missing > 20) {
        console.log(`${name} was removed`);
        return;
      }
      continue;
    }
    missing = 0;
    const others = s.players.filter((p) => p._id !== me.id);

    try {
      if ((g.phase === "send" || g.phase === "mine") && others.length && Math.random() < (g.phase === "send" ? 0.05 : 0.012) && self.air >= 5) {
        await post({ type: "send", ...id, to: pick(others)._id, amount: pick([5, 10, 25].filter((a) => a <= self.air)) });
      }

      const m = g.mining;
      if (g.phase === "mine" && m && m.status === "open") {
        if (round !== m.roundId) {
          round = m.roundId;
          nonce = Math.floor(Math.random() * 1e9);
        }
        const ease = 2 ** Math.min(6, Math.max(0, Math.floor((Date.now() - m.openedAt - 14000) / 4000)));
        const count = Math.round(m.hashesPerTap * m.boost * ease);
        const prefix = headerPrefix(m, me.id);
        for (let k = 0; k < count; k++) {
          const n = nonce++;
          if (sha256(prefix + n).startsWith("0".repeat(m.zeros))) {
            const r = await post({ type: "submit", ...id, roundId: m.roundId, nonce: n });
            if (r.won) console.log(`⛏  ${name} sealed block ${m.index}`);
            break;
          }
        }
        work += count;
        if (Date.now() - lastWork > 1000) {
          await post({ type: "work", ...id, roundId: m.roundId, hashes: work });
          work = 0;
          lastWork = Date.now();
        }
      }

      if (g.phase === "tamper" && !cheated && greedy > 0.7 && Math.random() < 0.02) {
        cheated = true;
        await post({ type: "tamper", ...id, on: true });
      }
      if (g.phase !== "tamper") cheated = false;

      if (g.phase === "market" && g.market && g.market.frozenUntil < Date.now() && Math.random() < 0.09) {
        const prices = g.market.prices;
        const p = prices[prices.length - 1][1];
        const prev = prices[Math.max(0, prices.length - 6)][1];
        let mood = (p - prev) / prev * 4; // chase the trend
        const news = g.news && Date.now() - g.news.at < 9000 ? g.news : null;
        if (news) mood += NEWS_MOOD[news.cardId] * (lastNews === news.id ? 0.6 : 1.5);
        lastNews = news?.id ?? lastNews;
        mood += rnd(-0.6, 0.6);
        const side = mood > 0 ? "buy" : "sell";
        const fraction = Math.abs(mood) > 1.2 ? pick([0.5, 1]) : 0.25;
        if ((side === "buy" && self.eur > 1) || (side === "sell" && self.air > 1)) {
          await post({ type: "trade", ...id, side, fraction });
        }
      }
    } catch (e) {
      if (!/frozen|too-late|busy|changed/.test(e.message)) console.error(`${name}: ${e.message}`);
    }
  }
}

console.log(`Starting ${N} bots against ${BASE}`);
poller();
for (let i = 0; i < N; i++) bot(i);
