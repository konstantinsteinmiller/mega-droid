-- One row per player. `id` is an anonymous, client-generated, stable-per-save
-- string — never an account, never a device fingerprint.
CREATE TABLE IF NOT EXISTS scores (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  -- THE score the board is ordered by: this player's LIFETIME XP (the point
  -- total, still counting past the level-40 cap). It only ever grows.
  score      INTEGER NOT NULL,
  -- Shown beside the rank, never ordered by: the HERO LEVEL (1-40).
  flair      INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- The board is always read in exactly this order, and rank is
-- `COUNT(*) WHERE score > ?`, so one index serves both.
CREATE INDEX IF NOT EXISTS idx_scores_rank ON scores (score DESC, updated_at ASC);

-- The materialised top-N, as ONE row of JSON.
--
-- Reading the top 100 as 100 rows would burn 100 of D1's 5M daily row reads per
-- board view — about 50 000 views a day. As a single blob it is one read, and
-- zero on an edge-cache hit.
CREATE TABLE IF NOT EXISTS board_cache (
  id         TEXT PRIMARY KEY,
  json       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- #176 cover vote: one row per (voter, cover). `half` is the rating in half
-- stars, 1..10 (0.5..5 stars). `voter` is an anonymous id the vote page mints
-- per browser; re-voting replaces that voter's row, it never adds a second.
CREATE TABLE IF NOT EXISTS cover_votes (
  voter      TEXT NOT NULL,
  cover      TEXT NOT NULL,
  half       INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (voter, cover)
);
