-- XCoda payment integrity + realtime profile updates
-- Run after vb_schema.sql.

CREATE TABLE IF NOT EXISTS public.vb_payment_intents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider            TEXT NOT NULL CHECK (provider IN ('paypal', 'razorpay')),
  provider_order_id   TEXT NOT NULL,
  provider_payment_id TEXT,
  email               TEXT NOT NULL,
  cycle               TEXT NOT NULL CHECK (cycle IN ('monthly', 'yearly', 'lifetime')),
  amount_minor        BIGINT NOT NULL CHECK (amount_minor > 0),
  currency            TEXT NOT NULL CHECK (currency IN ('USD', 'INR')),
  status              TEXT NOT NULL DEFAULT 'created'
                      CHECK (status IN ('created', 'processing', 'completed', 'failed')),
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_order_id)
);

ALTER TABLE public.vb_payment_intents ENABLE ROW LEVEL SECURITY;
-- No client policies. Service-role API access only.

ALTER TABLE public.vb_profiles
  DROP CONSTRAINT IF EXISTS vb_profiles_cycle_check;
ALTER TABLE public.vb_profiles
  ADD CONSTRAINT vb_profiles_cycle_check
  CHECK (cycle IN ('monthly', 'yearly', 'stacked', 'lifetime'));

CREATE INDEX IF NOT EXISTS idx_vb_payment_intents_email
  ON public.vb_payment_intents (LOWER(email), created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_vb_payment_intents_provider_payment
  ON public.vb_payment_intents (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.xcoda_guard_payment_intent_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.provider IS DISTINCT FROM OLD.provider
     OR NEW.provider_order_id IS DISTINCT FROM OLD.provider_order_id
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.cycle IS DISTINCT FROM OLD.cycle
     OR NEW.amount_minor IS DISTINCT FROM OLD.amount_minor
     OR NEW.currency IS DISTINCT FROM OLD.currency THEN
    RAISE EXCEPTION 'payment_intent_business_fields_are_immutable';
  END IF;

  IF OLD.provider_payment_id IS NOT NULL
     AND NEW.provider_payment_id IS DISTINCT FROM OLD.provider_payment_id THEN
    RAISE EXCEPTION 'provider_payment_id_is_immutable';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'created' AND NEW.status IN ('processing', 'completed', 'failed'))
    OR (OLD.status = 'processing' AND NEW.status IN ('completed', 'failed'))
  ) THEN
    RAISE EXCEPTION 'invalid_payment_intent_transition';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_xcoda_guard_payment_intent_update
  ON public.vb_payment_intents;
CREATE TRIGGER trg_xcoda_guard_payment_intent_update
BEFORE UPDATE ON public.vb_payment_intents
FOR EACH ROW EXECUTE FUNCTION public.xcoda_guard_payment_intent_update();

REVOKE ALL ON FUNCTION public.xcoda_guard_payment_intent_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.xcoda_guard_payment_intent_update() FROM anon;
REVOKE ALL ON FUNCTION public.xcoda_guard_payment_intent_update() FROM authenticated;

DROP FUNCTION IF EXISTS public.xcoda_finalize_payment(TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.xcoda_finalize_payment(
  p_provider TEXT,
  p_provider_order_id TEXT,
  p_provider_payment_id TEXT,
  p_verified_amount_minor BIGINT,
  p_verified_currency TEXT,
  p_provider_status TEXT
)
RETURNS TABLE (
  email TEXT,
  cycle TEXT,
  expires_at TIMESTAMPTZ,
  user_id UUID,
  duplicate BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_intent public.vb_payment_intents%ROWTYPE;
  v_user_id UUID;
  v_profile_expiry TIMESTAMPTZ;
  v_profile_cycle TEXT;
  v_entitlement_expiry TIMESTAMPTZ;
  v_current_expiry TIMESTAMPTZ;
  v_expires_at TIMESTAMPTZ;
  v_effective_expiry TIMESTAMPTZ;
  v_effective_cycle TEXT;
  v_has_lifetime BOOLEAN := FALSE;
  v_has_monthly BOOLEAN := FALSE;
  v_has_yearly BOOLEAN := FALSE;
  v_duplicate BOOLEAN := FALSE;
BEGIN
  SELECT *
    INTO v_intent
    FROM public.vb_payment_intents
   WHERE provider = p_provider
     AND provider_order_id = p_provider_order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_intent_not_found';
  END IF;

  IF v_intent.status = 'failed' THEN
    RAISE EXCEPTION 'payment_intent_failed';
  END IF;

  IF p_provider_payment_id IS NULL OR LENGTH(p_provider_payment_id) < 8 THEN
    RAISE EXCEPTION 'invalid_provider_payment_id';
  END IF;
  IF p_verified_amount_minor IS DISTINCT FROM v_intent.amount_minor
     OR UPPER(COALESCE(p_verified_currency, '')) IS DISTINCT FROM v_intent.currency THEN
    RAISE EXCEPTION 'verified_payment_amount_mismatch';
  END IF;
  IF NOT (
    (v_intent.provider = 'paypal' AND p_provider_status IN ('COMPLETED', 'SIMULATED'))
    OR (v_intent.provider = 'razorpay' AND p_provider_status IN ('captured', 'SIMULATED'))
  ) THEN
    RAISE EXCEPTION 'verified_provider_status_invalid';
  END IF;

  IF v_intent.status = 'completed' THEN
    IF v_intent.provider_payment_id IS DISTINCT FROM p_provider_payment_id THEN
      RAISE EXCEPTION 'completed_payment_replay_mismatch';
    END IF;
    v_duplicate := TRUE;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(LOWER(v_intent.email), 0));

  SELECT id
    INTO v_user_id
    FROM auth.users
   WHERE LOWER(email) = LOWER(v_intent.email)
   ORDER BY created_at ASC
   LIMIT 1;

  SELECT expires_at, cycle
    INTO v_profile_expiry, v_profile_cycle
    FROM public.vb_profiles
   WHERE user_id = v_user_id
   FOR UPDATE;

  SELECT
    MAX(expires_at),
    COALESCE(BOOL_OR(cycle = 'lifetime' AND expires_at IS NULL), FALSE),
    COALESCE(BOOL_OR(cycle = 'monthly'), FALSE),
    COALESCE(BOOL_OR(cycle = 'yearly'), FALSE)
    INTO v_entitlement_expiry, v_has_lifetime, v_has_monthly, v_has_yearly
    FROM public.vb_entitlements
   WHERE LOWER(email) = LOWER(v_intent.email)
     AND status = 'active'
     AND pro = TRUE
     AND (expires_at IS NULL OR expires_at > NOW());

  v_has_lifetime := v_has_lifetime OR (
    v_profile_cycle = 'lifetime' AND v_profile_expiry IS NULL
  );
  v_has_monthly := v_has_monthly OR v_profile_cycle IN ('monthly', 'stacked');
  v_has_yearly := v_has_yearly OR v_profile_cycle IN ('yearly', 'stacked');
  v_current_expiry := CASE
    WHEN v_profile_expiry IS NULL THEN v_entitlement_expiry
    WHEN v_entitlement_expiry IS NULL THEN v_profile_expiry
    ELSE GREATEST(v_profile_expiry, v_entitlement_expiry)
  END;

  IF v_duplicate THEN
    v_effective_cycle := CASE
      WHEN v_has_lifetime THEN 'lifetime'
      WHEN v_has_monthly AND v_has_yearly THEN 'stacked'
      WHEN v_has_yearly THEN 'yearly'
      ELSE 'monthly'
    END;
    v_effective_expiry := CASE WHEN v_has_lifetime THEN NULL ELSE v_current_expiry END;
    RETURN QUERY
    SELECT LOWER(v_intent.email), v_effective_cycle, v_effective_expiry, v_user_id, TRUE;
    RETURN;
  END IF;

  IF v_intent.cycle = 'lifetime' THEN
    v_expires_at := NULL;
  ELSIF v_intent.cycle = 'yearly' THEN
    v_expires_at := GREATEST(COALESCE(v_current_expiry, NOW()), NOW()) + INTERVAL '1 year';
  ELSE
    v_expires_at := GREATEST(COALESCE(v_current_expiry, NOW()), NOW()) + INTERVAL '1 month';
  END IF;

  v_has_monthly := v_has_monthly OR v_intent.cycle = 'monthly';
  v_has_yearly := v_has_yearly OR v_intent.cycle = 'yearly';
  IF v_has_lifetime OR v_intent.cycle = 'lifetime' THEN
    v_effective_cycle := 'lifetime';
    v_effective_expiry := NULL;
  ELSIF v_has_monthly AND v_has_yearly THEN
    v_effective_cycle := 'stacked';
    v_effective_expiry := v_expires_at;
  ELSE
    v_effective_cycle := v_intent.cycle;
    v_effective_expiry := v_expires_at;
  END IF;

  INSERT INTO public.vb_entitlements (
      user_id,
      email,
      product,
      cycle,
      expires_at,
      provider,
      order_id,
      status,
      pro,
      updated_at
    )
    VALUES (
      v_user_id,
      LOWER(v_intent.email),
      'volume_booster',
      v_intent.cycle,
      v_effective_expiry,
      v_intent.provider,
      v_intent.provider_order_id,
      'active',
      TRUE,
      NOW()
    )
    ON CONFLICT (provider, order_id) WHERE order_id IS NOT NULL
    DO NOTHING;

  UPDATE public.vb_payment_intents
     SET status = 'completed',
         provider_payment_id = COALESCE(p_provider_payment_id, provider_payment_id),
         completed_at = NOW(),
         updated_at = NOW()
   WHERE id = v_intent.id;

  IF v_user_id IS NOT NULL THEN
    INSERT INTO public.vb_profiles (user_id, email, plan, cycle, expires_at, updated_at)
    VALUES (
      v_user_id,
      LOWER(v_intent.email),
      'pro',
      v_effective_cycle,
      v_effective_expiry,
      NOW()
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      email = EXCLUDED.email,
      plan = 'pro',
      cycle = EXCLUDED.cycle,
      expires_at = EXCLUDED.expires_at,
      updated_at = NOW();

    UPDATE public.vb_entitlements
       SET user_id = v_user_id,
           updated_at = NOW()
     WHERE LOWER(email) = LOWER(v_intent.email)
       AND user_id IS NULL;
  END IF;

  RETURN QUERY
  SELECT LOWER(v_intent.email), v_effective_cycle, v_effective_expiry, v_user_id, v_duplicate;
END;
$$;

REVOKE ALL ON FUNCTION public.xcoda_finalize_payment(TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.xcoda_finalize_payment(TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.xcoda_finalize_payment(TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.xcoda_finalize_payment(TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT) TO service_role;

-- Repair profiles that were incorrectly shortened by an older fixed-term
-- purchase after a provider-backed Lifetime purchase. This never creates a
-- Lifetime grant: it only projects an existing service-role ledger record.
WITH verified_lifetime AS (
  SELECT DISTINCT LOWER(email) AS email
    FROM public.vb_entitlements
   WHERE cycle = 'lifetime'
     AND expires_at IS NULL
     AND status = 'active'
     AND pro = TRUE
     AND provider IN ('paypal', 'razorpay')
     AND order_id IS NOT NULL
)
UPDATE public.vb_profiles AS profile
   SET plan = 'pro',
       cycle = 'lifetime',
       expires_at = NULL,
       updated_at = NOW()
  FROM auth.users AS auth_user
  JOIN verified_lifetime
    ON verified_lifetime.email = LOWER(auth_user.email)
 WHERE profile.user_id = auth_user.id
   AND (
     profile.plan IS DISTINCT FROM 'pro'
     OR profile.cycle IS DISTINCT FROM 'lifetime'
     OR profile.expires_at IS NOT NULL
   );

UPDATE public.vb_entitlements AS entitlement
   SET user_id = auth_user.id,
       updated_at = NOW()
  FROM auth.users AS auth_user
 WHERE entitlement.user_id IS NULL
   AND LOWER(entitlement.email) = LOWER(auth_user.email);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.vb_profiles;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

-- Clients can subscribe only to their own profile row. All mutations remain
-- service-role-only through verified XCoda APIs and payment finalization.
ALTER TABLE public.vb_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vb_profiles REPLICA IDENTITY FULL;

REVOKE ALL ON TABLE public.vb_profiles FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.vb_profiles FROM authenticated;
GRANT SELECT ON TABLE public.vb_profiles TO authenticated;

DROP POLICY IF EXISTS "xcoda_read_own_profile" ON public.vb_profiles;
CREATE POLICY "xcoda_read_own_profile"
  ON public.vb_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

ALTER TABLE public.vb_entitlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.vb_entitlements FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.xcoda_rate_limits (
  bucket_key    TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count > 0),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.xcoda_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.xcoda_rate_limits FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.xcoda_take_rate_limit(
  p_bucket_key TEXT,
  p_window_seconds INTEGER,
  p_max_requests INTEGER
)
RETURNS TABLE (allowed BOOLEAN, retry_after INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_row public.xcoda_rate_limits%ROWTYPE;
  v_window INTERVAL;
BEGIN
  IF p_bucket_key IS NULL OR LENGTH(p_bucket_key) < 16
     OR p_window_seconds < 1 OR p_max_requests < 1 THEN
    RAISE EXCEPTION 'invalid_rate_limit';
  END IF;
  v_window := make_interval(secs => p_window_seconds);

  INSERT INTO public.xcoda_rate_limits (bucket_key, window_start, request_count, updated_at)
  VALUES (p_bucket_key, v_now, 1, v_now)
  ON CONFLICT (bucket_key) DO UPDATE
    SET window_start = CASE
          WHEN xcoda_rate_limits.window_start + v_window <= v_now THEN v_now
          ELSE xcoda_rate_limits.window_start
        END,
        request_count = CASE
          WHEN xcoda_rate_limits.window_start + v_window <= v_now THEN 1
          ELSE xcoda_rate_limits.request_count + 1
        END,
        updated_at = v_now
  RETURNING * INTO v_row;

  RETURN QUERY SELECT
    v_row.request_count <= p_max_requests,
    CASE
      WHEN v_row.request_count <= p_max_requests THEN 0
      ELSE GREATEST(
        1,
        CEIL(EXTRACT(EPOCH FROM (v_row.window_start + v_window - v_now)))::INTEGER
      )
    END;
END;
$$;

REVOKE ALL ON FUNCTION public.xcoda_take_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.xcoda_take_rate_limit(TEXT, INTEGER, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.xcoda_take_rate_limit(TEXT, INTEGER, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.xcoda_take_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;

-- Retired privacy-sensitive features: no location field or listening leaderboard storage.
DROP TABLE IF EXISTS public.vb_listen_stats CASCADE;
ALTER TABLE IF EXISTS public.vb_profiles DROP COLUMN IF EXISTS country;
