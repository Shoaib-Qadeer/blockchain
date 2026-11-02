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

function decodeSafe(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Forgive the usual copy-paste mistakes in MONGODB_URI: surrounding quotes,
 * a "MONGODB_URI=" prefix, and passwords with special characters (% @ # / :)
 * that must be URL-encoded inside a connection string.
 */
export function cleanUri(raw: string) {
  let u = raw.trim();
  if (u.startsWith("MONGODB_URI=")) u = u.slice("MONGODB_URI=".length).trim();
  u = u.replace(/^["'`]+|["'`]+$/g, "").trim();
  const scheme = u.indexOf("://");
  if (scheme < 0) {
    throw new Error('MONGODB_URI must start with "mongodb+srv://" or "mongodb://". Copy it again from Atlas → Connect → Drivers.');
  }
  if (/<[^>]*>/.test(u)) {
    throw new Error("MONGODB_URI still contains a <placeholder>. Replace <db_password> with your real password (no < > brackets).");
  }
  const rest = u.slice(scheme + 3);
  // the host never contains "@", so the last "@" ends the credentials even if the password has / ? # in it
  const at = rest.lastIndexOf("@");
  if (at < 0) return u;
  const creds = rest.slice(0, at);
  const colon = creds.indexOf(":");
  const user = colon < 0 ? creds : creds.slice(0, colon);
  const pass = colon < 0 ? null : creds.slice(colon + 1);
  const enc = (s: string) => encodeURIComponent(decodeSafe(s));
  const fixed = pass === null ? enc(user) : `${enc(user)}:${enc(pass)}`;
  return u.slice(0, scheme + 3) + fixed + rest.slice(at);
}

/** What the deployment is actually using, without revealing the password. */
function describe(raw: string) {
  try {
    const u = new URL(cleanUri(raw).replace(/^mongodb(\+srv)?:/, "http:"));
    return { user: decodeSafe(u.username), host: u.host.split(",")[0], passLength: decodeSafe(u.password).length };
  } catch {
    return { user: "?", host: "?", passLength: 0 };
  }
}

function client(): Promise<MongoClient> {
  const raw = process.env.MONGODB_URI;
  if (!raw) throw new Error("MONGODB_URI is not set. Add it in Vercel → Settings → Environment Variables, then redeploy.");
  if (!g.__aircoinClient) {
    let mc: MongoClient;
    try {
      mc = new MongoClient(cleanUri(raw), {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 8000,
      });
    } catch (e) {
      throw new Error(`MONGODB_URI is not a valid connection string (${(e as Error).message}). Copy it again from Atlas → Connect → Drivers.`);
    }
    g.__aircoinClient = mc.connect().catch((e: Error) => {
      g.__aircoinClient = undefined;
      const m = e.message || String(e);
      if (/auth|password|credential/i.test(m)) {
        const d = describe(raw);
        throw new Error(
          `MongoDB rejected the login for user "${d.user}" (${d.passLength}-character password). ` +
            `Check Atlas → Security → Database Access, then MONGODB_URI in Vercel. (${m})`
        );
      }
      if (/whitelist|IP|timed out|Server selection/i.test(m))
        throw new Error("Can't reach MongoDB. In Atlas → Network Access, allow 0.0.0.0/0 so Vercel can connect.");
      throw e;
    });
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
