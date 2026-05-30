-- ADR-0009 Phase 1: re-import is a review-driven merge.
--
-- Adds two new enum values to ImportItemStatus:
--   PENDING_ATTRIBUTE_REVIEW — re-import paused for per-attribute decisions
--   READY_TO_IMPORT          — all decisions made; importPerson can run
--
-- Adds ImportItem.decisions JSONB to carry the in-flight diff + decisions
-- between the import file and the matched person's current state.
--
-- Phase 2 (deferred): ImportDeclineLog + ItemDeletionTombstone tables.

ALTER TYPE "ImportItemStatus" ADD VALUE 'PENDING_ATTRIBUTE_REVIEW';
ALTER TYPE "ImportItemStatus" ADD VALUE 'READY_TO_IMPORT';

ALTER TABLE "import_item"
  ADD COLUMN "decisions" JSONB;
