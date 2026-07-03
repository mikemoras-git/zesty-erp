-- ============================================================
-- Kaliviani House History — Guest Archive
-- Supabase Database Setup (Step 1 of the build order)
--
-- Run this entire file in your Supabase SQL Editor:
-- supabase.com → zesty-erp project → SQL Editor → New query → Paste → Run
--
-- This lives in the SAME Supabase project as the rest of zesty-erp
-- (not a new project, not the separate KRE project), but every table
-- here is prefixed kaliviani_ so it never collides with existing ERP
-- tables (including the unrelated "guests" concept in guests-crm.html).
--
-- IMPORTANT — this schema is NOT the "anon full access" pattern used
-- elsewhere in this project (kre_*, etc). This app self-registers real
-- strangers off the public internet using real Supabase Auth accounts,
-- so every table below has genuine row-level security keyed to
-- auth.uid(): a guest can only ever see their own rows. The owner/admin
-- dashboard (built in a later step) must use the service_role key on
-- the server side to see everything — never embed service_role in
-- browser-side JS.
-- ============================================================

-- ── ACCESS CODES ────────────────────────────────────────────
-- You generate these yourself (one per stay/villa, reusable by a
-- whole family or one-per-guest, your call). Never exposed to guests
-- directly via SELECT — only checked internally by the registration
-- trigger below, so guests can't enumerate valid codes.
CREATE TABLE IF NOT EXISTS kaliviani_access_codes (
  code        text PRIMARY KEY,
  villa       text,
  valid_days  int NOT NULL DEFAULT 14,
  created_at  timestamptz NOT NULL DEFAULT now(),
  active      boolean NOT NULL DEFAULT true
);

ALTER TABLE kaliviani_access_codes ENABLE ROW LEVEL SECURITY;
-- No policies at all for anon/authenticated on purpose: this table is
-- default-deny for clients. Only SECURITY DEFINER functions (owned by
-- postgres, which bypasses RLS) can read it — see the trigger below.
-- You (the owner) manage codes from the SQL Editor or a future
-- service-role-backed admin page.

-- ── GUESTS ──────────────────────────────────────────────────
-- One row per self-registered guest. id IS the Supabase Auth user id
-- (auth.users), so "signing up" and "becoming a guest" are the same
-- action — no separate password system to manage.
CREATE TABLE IF NOT EXISTS kaliviani_guests (
  id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name         text NOT NULL,
  email        text NOT NULL,
  access_code  text REFERENCES kaliviani_access_codes(code),
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE kaliviani_guests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "guests select own row"
  ON kaliviani_guests FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "guests insert own row"
  ON kaliviani_guests FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- No UPDATE/DELETE policy for guests on purpose — once created, a
-- guest's own row (in particular expires_at) is locked from client
-- edits. Only the trigger below (running as table owner) or the
-- service_role admin path can change it.

-- This trigger is the actual security gate for registration. The
-- client can INSERT whatever access_code/expires_at it wants (or
-- omit expires_at); this overwrites it server-side from the real
-- access_codes table, and rejects the insert entirely if the code
-- doesn't exist or has been deactivated. That way "guess a code and
-- give yourself a 10-year expiry" is not possible from the browser.
CREATE OR REPLACE FUNCTION kaliviani_guests_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_valid_days int;
  v_active     boolean;
BEGIN
  SELECT valid_days, active INTO v_valid_days, v_active
  FROM kaliviani_access_codes
  WHERE code = NEW.access_code;

  IF v_valid_days IS NULL THEN
    RAISE EXCEPTION 'Invalid access code';
  END IF;

  IF NOT v_active THEN
    RAISE EXCEPTION 'This access code is no longer active';
  END IF;

  NEW.id         := auth.uid();
  NEW.expires_at := now() + (v_valid_days || ' days')::interval;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kaliviani_guests_before_insert ON kaliviani_guests;
CREATE TRIGGER trg_kaliviani_guests_before_insert
  BEFORE INSERT ON kaliviani_guests
  FOR EACH ROW EXECUTE FUNCTION kaliviani_guests_before_insert();

-- ── READING SESSIONS ────────────────────────────────────────
-- One row per guest per document per reading session; updated
-- roughly every ~15s via the Page Visibility heartbeat while the
-- guest is actively reading (built in a later step).
CREATE TABLE IF NOT EXISTS kaliviani_reading_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id        uuid NOT NULL REFERENCES kaliviani_guests(id) ON DELETE CASCADE,
  document        text NOT NULL, -- book slug, e.g. 'kaliviani-history' — language-agnostic
  language        text, -- which language edition this session was reading, e.g. 'en', 'el'
  started_at      timestamptz NOT NULL DEFAULT now(),
  last_heartbeat  timestamptz,
  seconds_active  int NOT NULL DEFAULT 0,
  max_scroll_pct  int NOT NULL DEFAULT 0
);

ALTER TABLE kaliviani_reading_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reading_sessions select own"
  ON kaliviani_reading_sessions FOR SELECT
  TO authenticated
  USING (guest_id = auth.uid());

CREATE POLICY "reading_sessions insert own"
  ON kaliviani_reading_sessions FOR INSERT
  TO authenticated
  WITH CHECK (guest_id = auth.uid());

CREATE POLICY "reading_sessions update own"
  ON kaliviani_reading_sessions FOR UPDATE
  TO authenticated
  USING (guest_id = auth.uid())
  WITH CHECK (guest_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_kaliviani_reading_sessions_guest
  ON kaliviani_reading_sessions (guest_id);

-- ── COMMENTS ────────────────────────────────────────────────
-- Paragraph-anchored "something's not right here" flags back to you.
-- paragraph_ref indices are only meaningful together with language —
-- English and Greek editions don't split into paragraphs the same way.
CREATE TABLE IF NOT EXISTS kaliviani_comments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id       uuid NOT NULL REFERENCES kaliviani_guests(id) ON DELETE CASCADE,
  document       text NOT NULL,
  language       text,
  paragraph_ref  text,
  body           text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE kaliviani_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comments select own"
  ON kaliviani_comments FOR SELECT
  TO authenticated
  USING (guest_id = auth.uid());

CREATE POLICY "comments insert own"
  ON kaliviani_comments FOR INSERT
  TO authenticated
  WITH CHECK (guest_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_kaliviani_comments_guest
  ON kaliviani_comments (guest_id);

-- ── REVIEWS ─────────────────────────────────────────────────
-- One overall rating/review per guest per document. UPDATE is allowed
-- (unlike comments) so a guest can revise their review; the unique
-- constraint means a resubmission is an upsert, not a duplicate.
CREATE TABLE IF NOT EXISTS kaliviani_reviews (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id    uuid NOT NULL REFERENCES kaliviani_guests(id) ON DELETE CASCADE,
  document    text NOT NULL,
  language    text, -- which edition they were reading when they reviewed — informational only
  rating      int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (guest_id, document)
);

ALTER TABLE kaliviani_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reviews select own"
  ON kaliviani_reviews FOR SELECT
  TO authenticated
  USING (guest_id = auth.uid());

CREATE POLICY "reviews insert own"
  ON kaliviani_reviews FOR INSERT
  TO authenticated
  WITH CHECK (guest_id = auth.uid());

CREATE POLICY "reviews update own"
  ON kaliviani_reviews FOR UPDATE
  TO authenticated
  USING (guest_id = auth.uid())
  WITH CHECK (guest_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_kaliviani_reviews_guest
  ON kaliviani_reviews (guest_id);

-- ── ACCESS CODE — Corte Interna ─────────────────────────────
-- 30 days of access from the day a guest registers. After that,
-- login still works but content is hidden (Step 3), with a way to
-- ask you for an extension — which you grant by running, e.g.:
--   UPDATE kaliviani_guests SET expires_at = now() + interval '14 days'
--   WHERE email = 'guest@example.com';
-- (guests can't extend their own access — there is no UPDATE policy
-- for them on kaliviani_guests, by design, see above)
INSERT INTO kaliviani_access_codes (code, villa, valid_days)
VALUES ('CORTE-INTERNA-2026', 'Corte Interna', 30)
ON CONFLICT (code) DO NOTHING;

-- ── DONE ─────────────────────────────────────────────────────
-- Next, Step 2: the registration/login page (Supabase Auth signUp,
-- then INSERT INTO kaliviani_guests — the trigger above does the rest).
