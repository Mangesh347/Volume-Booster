-- Volume Booster — profiles + listen leaderboard
-- Run after vb_schema.sql

ALTER TABLE vb_profiles
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT;

CREATE TABLE IF NOT EXISTS vb_listen_stats (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email           TEXT,
  display_name    TEXT,
  country         TEXT DEFAULT 'XX',
  site_host       TEXT NOT NULL DEFAULT 'unknown',
  listen_seconds  BIGINT NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, site_host)
);

ALTER TABLE vb_listen_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "VB users read listen stats" ON vb_listen_stats;
CREATE POLICY "VB users read listen stats"
  ON vb_listen_stats FOR SELECT
  USING (true);

CREATE INDEX IF NOT EXISTS idx_vb_listen_user ON vb_listen_stats (user_id);
CREATE INDEX IF NOT EXISTS idx_vb_listen_country ON vb_listen_stats (country, listen_seconds DESC);
CREATE INDEX IF NOT EXISTS idx_vb_listen_site ON vb_listen_stats (site_host, listen_seconds DESC);
CREATE INDEX IF NOT EXISTS idx_vb_listen_global ON vb_listen_stats (listen_seconds DESC);
