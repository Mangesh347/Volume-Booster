-- ============================================================
-- Volume Booster — Supabase schema (Pro / Free + Google Auth)
-- Run in Supabase SQL Editor (same project as GOOGLE provider).
-- ============================================================

-- Profiles (one row per Google / Auth user)
CREATE TABLE IF NOT EXISTS vb_profiles (
  user_id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email            TEXT,
  plan             TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  cycle            TEXT CHECK (cycle IN ('monthly', 'yearly', 'stacked', 'lifetime')),
  expires_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE vb_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "VB users read own profile" ON vb_profiles;
CREATE POLICY "VB users read own profile"
  ON vb_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_vb_profiles_email ON vb_profiles (email);
CREATE INDEX IF NOT EXISTS idx_vb_profiles_plan ON vb_profiles (plan);

-- Entitlement / payment ledger (service role writes)
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

ALTER TABLE vb_entitlements ENABLE ROW LEVEL SECURITY;
-- No client write policies — service role only

CREATE UNIQUE INDEX IF NOT EXISTS idx_vb_entitlements_order
  ON vb_entitlements (provider, order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vb_entitlements_email
  ON vb_entitlements (email, status, updated_at DESC);

-- Auto-create free profile on Google / email signup
CREATE OR REPLACE FUNCTION public.vb_handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.vb_profiles (user_id, email, plan)
  VALUES (NEW.id, NEW.email, 'free')
  ON CONFLICT (user_id) DO UPDATE
    SET email = COALESCE(EXCLUDED.email, vb_profiles.email),
        updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_vb_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_vb_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.vb_handle_new_user();
