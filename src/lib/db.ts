import { MongoClient, type Db } from "mongodb";
import type { Game, PlayerDoc } from "./types";

/**
 * Why a database at all: on Vercel every request may run in a different
 * serverless instance, so memory isn't shared between players. MongoDB is
 * the single shared copy of the game that every phone polls.
 */

const g = globalThis as unknown as {
  __aircoinClient?: Promise<MongoClient>;
  __aircoinIndexes?: Promise<unknown>;
};

function client(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set. Add it to .env.local or your Vercel project settings.");
  if (!g.__aircoinClient) {
    g.__aircoinClient = new MongoClient(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 8000,
    }).connect();
    g.__aircoinClient.catch(() => {
      g.__aircoinClient = undefined;
    });
  }
  return g.__aircoinClient;
}

export async function db(): Promise<Db> {
  const c = await client();
  const d = c.db(process.env.MONGODB_DB || "aircoin");
  if (!g.__aircoinIndexes) {
    g.__aircoinIndexes = d
      .collection("players")
      .createIndex({ nameKey: 1 }, { unique: true })
      .catch(() => {
        g.__aircoinIndexes = undefined;
      });
  }
  await g.__aircoinIndexes;
  return d;
}

export async function cols() {
  const d = await db();
  return {
    games: d.collection<Game>("games"),
    players: d.collection<PlayerDoc>("players"),
  };
}

export const GAME_ID = "main";
