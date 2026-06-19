-- ADR-0018: per-attribute change-kind drives attribute status.
-- Extend the DeltaCause enum with directional surgical kinds. These must be
-- added in their OWN migration (separate transaction) — Postgres forbids using
-- a newly-added enum value in the same transaction that adds it, and the
-- follow-up migration (20260619100100) backfills + references them.
--
-- SURGICAL is retained: it still serves BodyMarkEvent/BodyModificationEvent and
-- acts as a legacy scalar fallback (mapped to ENHANCED) until backfilled.

ALTER TYPE "DeltaCause" ADD VALUE IF NOT EXISTS 'AUGMENTATION';
ALTER TYPE "DeltaCause" ADD VALUE IF NOT EXISTS 'REDUCTION';
ALTER TYPE "DeltaCause" ADD VALUE IF NOT EXISTS 'REVERSAL';
