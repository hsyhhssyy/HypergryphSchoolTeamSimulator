-- 0001_init.sql — D1 schema for h5-spot-diff-game (todo 4)
-- Three tables only: questions, ratings, rate_limits. No ORM, plain SQLite DDL.
-- IF NOT EXISTS everywhere so re-running this file is a no-op (idempotent).

-- Game questions, official and workshop-submitted.
-- mode/source/status: CHECK alone lets NULL through in SQLite, so NOT NULL
-- is required to truly enforce the enum.
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('spot_diff', 'find_area')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  image_a TEXT NOT NULL,
  image_b TEXT,
  differences TEXT NOT NULL,
  show_count INTEGER DEFAULT 1,
  source TEXT NOT NULL CHECK (source IN ('official', 'workshop')),
  author_id TEXT,
  author_name TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  likes INTEGER DEFAULT 0,
  dislikes INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- One vote per user per question (upsert keyed on the UNIQUE pair, todo 18).
CREATE TABLE IF NOT EXISTS ratings (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(id),
  user_id TEXT NOT NULL,
  vote TEXT CHECK (vote IN ('like', 'dislike')),
  UNIQUE (question_id, user_id)
);

-- Backing store for IP/user_id rate limiting (Workers are stateless — in-memory
-- counters do not persist across isolates/edge locations). Keys are strings like
-- 'ip:1.2.3.4:2026-08-14-15' / 'uid:<anon>:2026-08-14-15' (todo 16).
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_start TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_questions_status ON questions(status);
CREATE INDEX IF NOT EXISTS idx_questions_source ON questions(source);
