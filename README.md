# AIRcoin — the class blockchain

A 3–4 minute live activity for Dynamics of Complex Systems. Everyone joins from their phone, sends coins, mines blocks with real SHA-256 proof of work, tries to rewrite history, and then trades AIR in a market that swings on news and herd behaviour. The projector shows the whole network live.

## The pages

| Page | Who opens it | What it is |
|---|---|---|
| `/` | Every student | Their phone: join, send, mine, cheat, trade |
| `/admin` | Projector laptop | Big-screen view **plus** the control dock (press **H** to hide/show it) |
| `/screen` | Projector laptop (optional) | Big-screen view with no controls |
| `/remote` | A teammate's phone (optional) | Just the controls, so the projector can show `/screen` |

The control dock asks for the passcode once (`ADMIN_PASSCODE`).

## The flow (one button per step)

1. **Join** — QR code on screen. Each phone becomes a node on the network map with 100 AIR.
2. **Send** — Students pay each other. Payments fly across the map and pile up as sticky notes in the *waiting room*. Receivers see “+10 on its way”, not yet in their wallet.
3. **Mine** — A block of up to 10 waiting payments opens. Every tap really hashes the block with random numbers; the first phone to find a fingerprint starting with `0000` seals it and earns +5 AIR. The block snaps onto the ledger, the payments become final, confetti. New blocks open automatically while payments are waiting. If a round drags, it gets easier by itself after 15 s, or press **Make it 4× easier**.
4. **Cheat** — Each phone shows its own copy of the ledger. Tap an old payment to make it pay you 1000 AIR: the fingerprint changes and every later block turns red, one after another. The projector counts honest vs edited copies. You can also click a payment on the projector to demo it.
5. **Market** — Everyone has €100 and their AIR. There is a fixed pool of AIR, so buying pushes the price up and selling pushes it down. Fire news cards from the dock (one freezes trading for 8 s) and watch the class stampede. **Whale buys / dumps** guarantee drama if the class is shy.
6. **Results** — Podium, the price swing, and four one-line takeaways.

## Deploy (about 10 minutes)

### 1. MongoDB Atlas (free)
1. Create a free **M0** cluster at [cloud.mongodb.com](https://cloud.mongodb.com). Pick a European region close to Paris.
2. **Database Access** → add a user with a password.
3. **Network Access** → add `0.0.0.0/0`. Vercel's servers don't have fixed IP addresses, so this is required.
4. **Connect → Drivers** → copy the connection string and put your password in it.

### 2. Vercel
1. Push this folder to a GitHub repo and import it at [vercel.com/new](https://vercel.com/new) (or run `npx vercel` in this folder).
2. Add these environment variables (Settings → Environment Variables):
   - `MONGODB_URI` — the Atlas connection string
   - `MONGODB_DB` — `aircoin` (optional)
   - `ADMIN_PASSCODE` — anything only the three of you know
3. Deploy. `vercel.json` pins the server functions to Paris (`cdg1`) so they sit next to the classroom and the database.

### Run it on your laptop
```bash
npm install
cp .env.example .env.local   # fill in MONGODB_URI and ADMIN_PASSCODE
npm run dev                  # http://localhost:3000 and http://localhost:3000/admin
```

## Rehearse with fake classmates

```bash
npm run bots -- --url https://your-app.vercel.app --n 20
```

Twenty bots join, send, genuinely mine, some cheat, and they trade with a herd instinct (good news → buy, bad news → sell, chase the trend). Open `/admin` and click through all six steps. Press **Reset game** (in the “nodes” drawer) before class to clear them.

## On the day

1. Open **`/admin`** on the projector laptop and type your `ADMIN_PASSCODE`.
2. Press **Reset game** (in the "nodes" drawer) to clear any test players.
3. Students scan the QR code. While they wait, their phone has a small activity: type anything and watch its fingerprint (hash) change completely when one letter changes.
4. When everyone's in, press **Start the show**. It runs by itself, about 3½ minutes:
   - Pay someone, 35 s
   - Mine a block, 55 s
   - Try to cheat, 35 s
   - Trade AIR, 80 s (5 news events fire on their own, including an 8-second trading freeze)
   - Results
5. Each round opens with a banner on every screen saying what to do now and what the last round showed. A countdown runs at the top.
6. **Pause autopilot** hands control back to you; **Next** skips ahead at any time.

**Rehearsing alone:** on `/admin`, press **Add 8 practice classmates**. They join, pay each other, really mine, sometimes cheat, and trade on the news, so you can watch the whole show from one laptop. They run while the admin tab is open; **Remove** or **Reset game** clears them.

## How it works

- **Next.js on Vercel + MongoDB.** On Vercel each request can run on a different server, so they share no memory; MongoDB is the single shared copy of the game. Two collections: `games` (one document: phase, ledger, waiting room, mining round, market) and `players`.
- **Live sync by polling.** Every screen asks `/api/state` about 1.5 times a second. A `tick` counter means unchanged requests return a few bytes. No WebSocket server is needed, which suits Vercel.
- **Real proof of work.** A block's fingerprint is `sha256(index | previous fingerprint | payments | miner | nonce)`. Phones guess nonces in the browser; the server re-checks the winning hash before accepting it. One atomic MongoDB update decides the winner, so two people can't win the same block.
- **Every phone verifies the chain itself.** The red cascade in the Cheat step isn't scripted — the phone recomputes every fingerprint and checks each link, exactly as a node would.
- **Market maker.** The pool follows `AIR × € = constant`. Every trade is a single atomic MongoDB pipeline update, so 40 people can trade at once without corrupting the price. Coins and euros are conserved (tested with 40 bots).

## Things you can tune

| What | Where |
|---|---|
| Starting AIR / € , block reward, payments per block | `src/lib/types.ts` |
| Mining difficulty and target time (≈12 s) | `difficulty()` in `src/lib/game.ts` |
| How fast mining gets easier on its own | `easeFactor()` in `src/components/MinerPad.tsx` |
| Market depth (bigger = calmer price) | `liquidity` in `setPhase()` in `src/lib/game.ts` |
| News cards | `src/lib/news.ts` |
| Colours and fonts | `src/app/globals.css` |
