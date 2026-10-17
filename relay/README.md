# Open Gate relay

A small Cloudflare Worker that passes changes between the people working on a shared Open Gate project and keeps them while people are offline. It runs on Cloudflare's **free plan**. One relay can serve any number of projects.

## Deploy (once, ~5 minutes)

1. Create a free account at https://dash.cloudflare.com/sign-up
2. In this folder:

   ```bash
   npm install
   npx wrangler login
   npm run deploy
   ```

3. Wrangler prints your relay address, e.g. `https://open-gate-relay.<you>.workers.dev`.
4. In Open Gate: **Share** (top right) → paste that address → **Start sharing** → **Invite someone**.

`npm run dev` runs the relay locally at `http://localhost:8787` for testing.

## What it stores and what it can see

- Each shared project is one room (a Durable Object with its own SQLite storage). It keeps an append-only log of updates, compacted snapshots per section, and board/location images.
- **Everything is encrypted in the browser** (AES-256-GCM) with a key that's only in the invite link after `#`, which is never sent to the server. The relay can't read the script, names or images, only sizes and timings.
- **Access is checked per section.** Each invite link has a random token; the relay stores only its SHA-256 hash and the sections it may change (`script`, `write`, `breakdown`, `plan`, `visualize`, `shoot`, `settings`, `budget`). View-only links get no write sections. Updates to other sections are refused.
- **The budget is restricted.** It's only sent to the owner and to links whose `read` (or `write`) list includes `budget` — its log, snapshots and live updates are withheld from everyone else, and "edit everything" (`*`) doesn't include it. It's also encrypted with a separate key that only those links carry.
- The project owner holds an admin secret (also never stored in plain form) used to create and revoke links and to stop sharing. Revoking a link disconnects only the people using it. Stopping sharing deletes the room.

## API (for reference)

All routes are under `/r/<room>/`, authenticated with an `x-token` or `x-admin` header (or `?tok=` for the websocket):

| Route | Use |
|---|---|
| `POST init` | Create the room with the owner's admin hash |
| `GET ws` | Websocket: `sub` (catch up from a sequence number), `up` (send an update → `ack` / `denied`), `pres` (cursors and presence) |
| `GET/POST links`, `DELETE links/<hash>` | List, create (`{hash, label, write, read}`) and revoke invite links (owner only) |
| `GET/PUT snap/<section>` | Download or upload a compacted snapshot |
| `POST up/<section>` | Large updates over HTTP |
| `GET/PUT media/<id>` | Encrypted images |
| `DELETE room` | Stop sharing (owner only) |
