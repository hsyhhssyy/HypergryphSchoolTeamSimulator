# DEPLOYMENT — h5-spot-diff-game (Cloudflare)

Frontend (Preact + Vite) → **Cloudflare Pages**.
API + image serving (Hono Worker) → **Cloudflare Workers**, backed by **D1** (database) and **R2** (question images).

All `wrangler` commands below run from the repo root (the config is `./wrangler.toml`).

## Prerequisites

- Node ≥ 22, `npm install`
- `npx wrangler login` — authenticate against the Cloudflare account that will own the resources
- Check auth at any time: `npx wrangler whoami`

## One-time resource setup (order matters)

1. **Create the D1 database** and record the returned `database_id`:

   ```bash
   npx wrangler d1 create h5-spot-diff-game
   ```

   Edit `wrangler.toml`: put the real id into `[[d1_databases]].database_id`
   (it is currently the placeholder `00000000-0000-0000-0000-000000000000`,
   which is invalid for remote deploys).

2. **Create the R2 bucket** (name fixed — must match `wrangler.toml`):

   ```bash
   npx wrangler r2 bucket create h5-spot-diff-game-images
   ```

3. **Set the admin secret** (required for `/api/workshop/pending`, `/api/workshop/review`,
   and pending-image previews; the API fails closed without it):

   ```bash
   npx wrangler secret put ADMIN_KEY
   ```

   The admin key is never committed. For **local** dev, copy
   `workers/.dev.vars.example` → `.dev.vars` (repo root, gitignored) and set a
   local `ADMIN_KEY=` value.

4. **Run migrations + seed remotely — BEFORE the first API deploy**:

   ```bash
   npx wrangler d1 execute DB --remote --file=migrations/0001_init.sql
   npx wrangler d1 execute DB --remote --file=seed/official-questions.sql
   ```

   Deploying the Worker before these run leaves `/api/questions` answering 500.
   Local equivalents (for `wrangler dev`): same commands with `--local`.

## Deploy

- **API (Workers)** — deploys the worker with the D1/R2 bindings and `[vars]`:

  ```bash
  npm run deploy:api        # == wrangler deploy
  ```

  Note the returned worker URL, e.g. `https://h5-spot-diff-game.<subdomain>.workers.dev`.

- **Frontend (Pages)** — builds the Vite app into `dist/` and uploads it:

  ```bash
  npm run deploy:frontend   # == vite build && wrangler pages deploy dist
  ```

  The frontend must know the API base URL. Set it as a Pages environment variable
  (Dashboard → Pages → your project → Settings → Environment variables, or
  `wrangler pages project create` → env var in the dashboard):

  ```
  VITE_API_URL = https://h5-spot-diff-game.<subdomain>.workers.dev
  ```

  The client code reads `import.meta.env.VITE_API_URL` at build time, so
  redeploy the Pages build after changing it.

## Feature flag: AUTO_APPROVE_WORKSHOP

Declared in `wrangler.toml` `[vars]` — a **non-secret** flag, safe to commit:

- `"true"` (default) → workshop submissions are auto-approved on upload.
- `"false"` → submissions land `pending` and require manual moderation via
  `GET /api/workshop/pending` + `POST /api/workshop/review` (admin key required).

Locally, `.dev.vars` **overrides** `[vars]`, so QA can pin `false` without touching prod config.

## Image serving (important)

The Workers API is the **ONLY public image surface**:

- Uploaded images go into the private R2 bucket via `POST /api/workshop`.
- They are served exclusively through the quarantined route `GET /images/:filename`,
  which checks question status: `rejected` → 403, `pending` → 403 without admin key,
  `approved` → 200 with long cache headers.
- **Do NOT** make the R2 bucket public and **do NOT** add a custom domain /
  public bucket binding — that would bypass the status gate.

## Verification after deploy

```bash
curl https://<worker-url>/api/health                      # {"status":"ok"}
curl "https://<worker-url>/api/questions?mode=spot_diff&count=3"
curl -H "X-Admin-Key: <ADMIN_KEY>" "https://<worker-url>/api/workshop/pending"
```
