-- ADR-0024: dismissal marker for rejected alias-promotion candidates.
-- The promotion queue itself is derived from SetCreditRaw; this table only
-- records the (person, channel, nameNorm) tuples the user has rejected.

CREATE TABLE "alias_promotion_dismissal" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "nameNorm" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alias_promotion_dismissal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "alias_promotion_dismissal_personId_channelId_nameNorm_key"
    ON "alias_promotion_dismissal" ("personId", "channelId", "nameNorm");

CREATE INDEX "alias_promotion_dismissal_personId_idx"
    ON "alias_promotion_dismissal" ("personId");

CREATE INDEX "alias_promotion_dismissal_channelId_idx"
    ON "alias_promotion_dismissal" ("channelId");

ALTER TABLE "alias_promotion_dismissal"
    ADD CONSTRAINT "alias_promotion_dismissal_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "alias_promotion_dismissal"
    ADD CONSTRAINT "alias_promotion_dismissal_channelId_fkey"
    FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
