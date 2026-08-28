# DEPLOYMENT — h5-spot-diff-game (Cloudflare)

Frontend (Preact + Vite) → **Cloudflare Pages**.
API + pending-image serving (Hono Worker) → **Cloudflare Workers**, backed by
**D1** (metadata) and two **R2** buckets (private quarantine + public approved images).

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

2. **Create both R2 buckets** (names fixed — must match `wrangler.toml`):

   ```bash
   npx wrangler r2 bucket create h5-spot-diff-game-images
   npx wrangler r2 bucket create h5-spot-diff-game-public-images
   ```

   `h5-spot-diff-game-images` stays private and holds pending submissions plus
   legacy images. `h5-spot-diff-game-public-images` contains approved images
   only. You may attach a custom domain such as `media.example.com` to the
   public bucket; never attach one to the private bucket.

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
   npx wrangler d1 execute DB --remote --file=migrations/0002_random_key.sql
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

  If the public-image bucket has a custom domain, also set:

  ```
  VITE_PUBLIC_IMAGE_URL = https://media.example.com
  ```

  Without this optional variable, the frontend uses the Worker's
  `/public-images/*` fallback. That fallback reads the public R2 bucket but
  performs no D1 query.

  The client code reads `import.meta.env.VITE_API_URL` at build time, so
  redeploy the Pages build after changing it.

## Feature flag: AUTO_APPROVE_WORKSHOP

Declared in `wrangler.toml` `[vars]` — a **non-secret** flag, safe to commit:

- `"true"` (default) → workshop submissions are auto-approved on upload.
- `"false"` → submissions land `pending` and require manual moderation via
  `GET /api/workshop/pending` + `POST /api/workshop/review` (admin key required).

Locally, `.dev.vars` **overrides** `[vars]`, so QA can pin `false` without touching prod config.

## Image serving (important)

New uploads use two physically separate trust zones:

- Manual-moderation uploads go to private `IMAGES` under `pending/`. Admin
  previews use `GET /images/*`, which checks D1 status and `X-Admin-Key`.
- Approval copies the objects to `PUBLIC_IMAGES` under immutable `approved/`
  keys, atomically changes the D1 references, and deletes private copies.
- Auto-approved uploads go directly to `PUBLIC_IMAGES`; unreviewed bytes never
  enter the public bucket.
- Players load approved images through the R2 custom domain, or through
  `GET /public-images/*`. Neither path queries D1. Responses use
  `Cache-Control: public, max-age=31536000, immutable`.
- Existing flat-key images remain readable through the legacy `/images/*`
  status gate. They can be migrated later without blocking this deployment.

Never expose the private `h5-spot-diff-game-images` bucket publicly.

## Upgrading an existing deployment

Before deploying this Worker over an existing installation:

1. Create `h5-spot-diff-game-public-images`.
2. Apply only the new migration:

   ```bash
   npx wrangler d1 execute DB --remote --file=migrations/0002_random_key.sql
   ```

3. Deploy the Worker, then rebuild the frontend. Existing approved flat-key
   images continue through the compatibility route; all new approved images
   use the public bucket and avoid D1 reads.

Do not run `0002_random_key.sql` twice manually: its `ALTER TABLE` is intended
to be applied once by the deployment migration process.

## Question selection

`questions.random_key` plus the composite selection index replaces
`ORDER BY RANDOM()`. The API seeks from one random pivot and wraps once, so a
game launch no longer sorts every matching row. Requests are capped at 100
questions to bound database work.

## Verification after deploy

```bash
curl https://<worker-url>/api/health                      # {"status":"ok"}
curl "https://<worker-url>/api/questions?mode=spot_diff&count=3"
curl -H "X-Admin-Key: <ADMIN_KEY>" "https://<worker-url>/api/workshop/pending"
```
