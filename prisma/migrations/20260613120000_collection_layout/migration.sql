-- Typed Collections (ADR-0014 / D8): a collection can be a before/after composite.
-- GRID = the default justified gallery; SIDE_BY_SIDE = 2-up comparison panes
-- (framing comparable when the items are Aligned images). Additive — existing
-- collections default to GRID, unchanged behaviour.

CREATE TYPE "CollectionLayout" AS ENUM ('GRID', 'SIDE_BY_SIDE');

ALTER TABLE "MediaCollection"
  ADD COLUMN "layout" "CollectionLayout" NOT NULL DEFAULT 'GRID';
