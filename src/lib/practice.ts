"use client";

import { sha256 } from "js-sha256";
import { headerPrefix, meetsTarget } from "./chain";
import { api, type Live } from "./client";
import { newsById } from "./news";

/**
 * Practice classmates for rehearsing alone. They run in the host's browser tab (no server process
 * needed on Vercel) and use the same API as real phones: they join, pay each other, really mine,
 * sometimes cheat, and trade with a herd instinct — buy on good news, sell on bad, chase the trend.
 */
const NAMES = ["Ada", "Bilal", "Chloé", "Dmitri", "Esra", "Farah", "Gabriel", "Hana", "Ines", "Jonas", "Kenji", "Lina"];

type Bot = { id: string; token: string; name: string; nonce: number; round: string | null; work: number; lastWork: number; greed: number; cheated: boolean; lastNews: string | null };

export class PracticeClass {
  private bots: Bot[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private live: Live | null = null;
  private busy = false;

  get size() {
    return this.bots.length;
  }
  get ids() {
    return this.bots.map((b) => b.id);
  }

  update(live: Live) {
    this.live = live;
  }

  async add(n: number) {
    const taken = new Set(this.live?.players.map((p) => p.name.toLowerCase()) ?? []);
    const names = NAMES.map((x) => `Bot ${x}`).filter((x) => !taken.has(x.toLowerCase())).slice(0, n);
    for (const name of names) {
      try {
        const r = await api<{ id: string; token: string }>("/api/play", { type: "join", name });
        this.bots.push({ id: r.id, token: r.token, name, nonce: Math.floor(Math.random() * 1e9), round: null, work: 0, lastWork: Date.now(), greed: Math.random(), cheated: false, lastNews: null });
      } catch {
        /* name taken or network full: skip */
      }
    }
    if (!this.timer) this.timer = setInterval(() => this.tick(), 350);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.bots = [];
  }

  private async tick() {
    if (this.busy || !this.live) return;
    this.busy = true;
    try {
      await Promise.all(this.bots.map((b) => this.act(b).catch(() => {})));
    } finally {
      this.busy = false;
    }
  }

  private async act(b: Bot) {
    const { game, players, byId } = this.live!;
    const me = byId.get(b.id);
    if (!me) return;
    const auth = { id: b.id, token: b.token };
    const others = players.filter((p) => p._id !== b.id);

    if ((game.phase === "send" || game.phase === "mine") && others.length && me.air >= 5 && Math.random() < (game.phase === "send" ? 0.07 : 0.015)) {
      const to = others[Math.floor(Math.random() * others.length)];
      await api("/api/play", { type: "send", ...auth, to: to._id, amount: [5, 10, 25].filter((a) => a <= me.air)[Math.floor(Math.random() * 3)] ?? 5 });
    }

    const m = game.mining;
    if (game.phase === "mine" && m?.status === "open") {
      if (b.round !== m.roundId) {
        b.round = m.roundId;
        b.nonce = Math.floor(Math.random() * 1e9);
      }
      const ease = 2 ** Math.min(6, Math.max(0, Math.floor((Date.now() - m.openedAt - 14_000) / 4_000)));
      // a bot taps a bit slower than an excited human
      const count = Math.round(m.hashesPerTap * m.boost * ease * 0.7);
      const prefix = headerPrefix(m.index, m.prevHash, m.txs, b.id);
      for (let i = 0; i < count; i++) {
        const n = b.nonce++;
        if (meetsTarget(sha256(prefix + n), m.zeros)) {
          await api("/api/play", { type: "submit", ...auth, roundId: m.roundId, nonce: n });
          break;
        }
      }
      b.work += count;
      if (Date.now() - b.lastWork > 1000) {
        const hashes = b.work;
        b.work = 0;
        b.lastWork = Date.now();
        await api("/api/play", { type: "work", ...auth, roundId: m.roundId, hashes });
      }
    }

    if (game.phase === "tamper" && !b.cheated && b.greed > 0.65 && Math.random() < 0.03) {
      b.cheated = true;
      await api("/api/play", { type: "tamper", ...auth, on: true });
    }
    if (game.phase !== "tamper") b.cheated = false;

    const mk = game.market;
    if (game.phase === "market" && mk && mk.frozenUntil < Date.now() && Math.random() < 0.12) {
      const p = mk.prices[mk.prices.length - 1][1];
      const before = mk.prices[Math.max(0, mk.prices.length - 6)][1];
      let mood = ((p - before) / before) * 4; // chase the trend
      const news = game.news && Date.now() - game.news.at < 9000 ? game.news : null;
      if (news) {
        const card = newsById(news.cardId);
        mood += (card?.mood === "good" ? 1 : -1) * (b.lastNews === news.id ? 0.6 : 1.6);
        b.lastNews = news.id;
      }
      mood += Math.random() * 1.2 - 0.6;
      const side = mood > 0 ? "buy" : "sell";
      const fraction = Math.abs(mood) > 1.2 ? (Math.random() < 0.5 ? 0.5 : 1) : 0.25;
      if ((side === "buy" && me.eur > 1) || (side === "sell" && me.air > 1)) {
        await api("/api/play", { type: "trade", ...auth, side, fraction });
      }
    }
  }
}
