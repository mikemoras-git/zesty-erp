-- ============================================================
-- Kaliviani Guest Archive — Migration 001: multi-language support
--
-- Run this once in the Supabase SQL Editor. Safe to run even if
-- you already ran the latest kaliviani-setup.sql (IF NOT EXISTS
-- guards make it a no-op in that case).
--
-- Why: the archive now has an English and a Greek edition of
-- "History of Kaliviani" with different paragraph counts, so a
-- comment's paragraph_ref is only meaningful together with which
-- language the guest was reading.
-- ============================================================

ALTER TABLE kaliviani_reading_sessions ADD COLUMN IF NOT EXISTS language text;
ALTER TABLE kaliviani_comments        ADD COLUMN IF NOT EXISTS language text;
ALTER TABLE kaliviani_reviews         ADD COLUMN IF NOT EXISTS language text;
