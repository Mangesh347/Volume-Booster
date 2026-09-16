-- XCoda privacy cleanup: permanently remove retired location and listening leaderboard data.
-- Safe to run repeatedly in the Supabase SQL Editor.

BEGIN;

DROP TABLE IF EXISTS public.vb_listen_stats CASCADE;
ALTER TABLE IF EXISTS public.vb_profiles DROP COLUMN IF EXISTS country;

COMMIT;
