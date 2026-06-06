-- ============================================================
-- KRE Real Estate ERP — Supabase Database Setup
-- Run this entire file in your Supabase SQL Editor:
-- supabase.com → your project → SQL Editor → New query → Paste → Run
-- ============================================================

-- Users (admin, employee, collaborator)
CREATE TABLE IF NOT EXISTS kre_users (
  id          text PRIMARY KEY,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- App-wide settings (one row, id = 'main')
CREATE TABLE IF NOT EXISTS kre_settings (
  id          text PRIMARY KEY DEFAULT 'main',
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Property listings
CREATE TABLE IF NOT EXISTS kre_properties (
  id          text PRIMARY KEY,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Buyer / seller / both contacts
CREATE TABLE IF NOT EXISTS kre_contacts (
  id          text PRIMARY KEY,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- External collaborator agents
CREATE TABLE IF NOT EXISTS kre_collaborators (
  id          text PRIMARY KEY,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Purchase deals (linked to property + contact)
CREATE TABLE IF NOT EXISTS kre_deals (
  id          text PRIMARY KEY,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Client pipeline events (calls, emails, viewings per contact)
CREATE TABLE IF NOT EXISTS kre_client_events (
  id          text PRIMARY KEY,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Tasks linked to properties or contacts
CREATE TABLE IF NOT EXISTS kre_tasks (
  id          text PRIMARY KEY,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Property ↔ buyer match log
CREATE TABLE IF NOT EXISTS kre_matches (
  id          text PRIMARY KEY,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Revenue records from completed deals
CREATE TABLE IF NOT EXISTS kre_revenues (
  id          text PRIMARY KEY,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ── INDEXES ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_kre_properties_type     ON kre_properties ((data->>'type'));
CREATE INDEX IF NOT EXISTS idx_kre_properties_area     ON kre_properties ((data->>'area'));
CREATE INDEX IF NOT EXISTS idx_kre_properties_avail    ON kre_properties ((data->>'available'));
CREATE INDEX IF NOT EXISTS idx_kre_contacts_role       ON kre_contacts   ((data->>'role'));
CREATE INDEX IF NOT EXISTS idx_kre_contacts_active     ON kre_contacts   ((data->>'active'));
CREATE INDEX IF NOT EXISTS idx_kre_deals_stage         ON kre_deals      ((data->>'stage'));
CREATE INDEX IF NOT EXISTS idx_kre_tasks_due           ON kre_tasks      ((data->>'due_date'));
CREATE INDEX IF NOT EXISTS idx_kre_tasks_status        ON kre_tasks      ((data->>'status'));
CREATE INDEX IF NOT EXISTS idx_kre_matches_status      ON kre_matches    ((data->>'status'));
CREATE INDEX IF NOT EXISTS idx_kre_revenues_date       ON kre_revenues   ((data->>'date'));

-- ── ENABLE RLS (Row Level Security) ──────────────────────────
-- We use the anon key for all operations, so we allow everything.
-- Role restrictions are enforced at the application level.
ALTER TABLE kre_users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE kre_settings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE kre_properties   ENABLE ROW LEVEL SECURITY;
ALTER TABLE kre_contacts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE kre_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE kre_deals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE kre_client_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE kre_tasks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE kre_matches      ENABLE ROW LEVEL SECURITY;
ALTER TABLE kre_revenues     ENABLE ROW LEVEL SECURITY;

-- Allow full access via anon key (app-level role control handles restrictions)
CREATE POLICY "anon full access" ON kre_users        FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON kre_settings     FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON kre_properties   FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON kre_contacts     FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON kre_collaborators FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON kre_deals        FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON kre_client_events FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON kre_tasks        FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON kre_matches      FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON kre_revenues     FOR ALL TO anon USING (true) WITH CHECK (true);

-- Bug / improvement / idea tickets
CREATE TABLE IF NOT EXISTS kre_tickets (
  id          text PRIMARY KEY,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Released version changelog bundles
CREATE TABLE IF NOT EXISTS kre_changelog (
  id          text PRIMARY KEY,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kre_tickets_status   ON kre_tickets  ((data->>'status'));
CREATE INDEX IF NOT EXISTS idx_kre_tickets_type     ON kre_tickets  ((data->>'type'));
CREATE INDEX IF NOT EXISTS idx_kre_changelog_ver    ON kre_changelog((data->>'version'));

ALTER TABLE kre_tickets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE kre_changelog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon full access" ON kre_tickets   FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON kre_changelog FOR ALL TO anon USING (true) WITH CHECK (true);

-- ── DONE ─────────────────────────────────────────────────────
-- After running this, open the KRE app and log in.
-- Sign up for a Supabase account via kre-login.html — the first user
-- is automatically assigned the admin role.
