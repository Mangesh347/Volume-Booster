-- ============================================================
-- Volume Booster — ensure entitlement table exists (safe re-run)
-- Paste into Supabase → SQL Editor → Run
-- ============================================================

CREATE TABLE IF NOT EXISTS vb_entitlements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email        TEXT NOT NULL,
  product      TEXT NOT NULL DEFAULT 'volume_booster',
  cycle        TEXT NOT NULL CHECK (cycle IN ('monthly', 'yearly', 'lifetime')),
  expires_at   TIMESTAMPTZ,
  provider     TEXT CHECK (provider IN ('paypal', 'razorpay', 'manual', 'simulated')),
  order_id     TEXT,
  license_key  TEXT,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'refunded')),
  pro          BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add columns if an older table is missing them
ALTER TABLE vb_entitlements ADD COLUMN IF NOT EXISTS product TEXT NOT NULL DEFAULT 'volume_booster';
ALTER TABLE vb_entitlements ADD COLUMN IF NOT EXISTS license_key TEXT;
ALTER TABLE vb_entitlements ADD COLUMN IF NOT EXISTS pro BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE vb_entitlements ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE vb_entitlements ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_vb_entitlements_order
  ON vb_entitlements (provider, order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vb_entitlements_email
  ON vb_entitlements (email, status, updated_at DESC);

ALTER TABLE vb_entitlements ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS; keep no public write policies
