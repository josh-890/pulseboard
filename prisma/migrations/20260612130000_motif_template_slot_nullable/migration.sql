-- ADR-0014: a category-bound Alignment Template has no profile slot (slot XOR
-- category binding). Drop the NOT NULL on MotifTemplate.slot so category-only
-- templates can exist. The existing UNIQUE index stays — Postgres permits
-- multiple NULLs under it, so any number of category-bound templates coexist
-- while real profile slots remain unique. Slot is retired at the unification slice.

ALTER TABLE "MotifTemplate" ALTER COLUMN "slot" DROP NOT NULL;
