-- Per-person career-stats scaling indexes.

-- Session→SetSession hop (PK is (setId, sessionId); can't seek by sessionId alone).
CREATE INDEX IF NOT EXISTS "SetSession_sessionId_idx" ON "SetSession"("sessionId");

-- Array containment for `participantIcgIds has <icgId>` (avoids a seq scan).
CREATE INDEX IF NOT EXISTS "staging_set_participantIcgIds_idx" ON "staging_set" USING GIN ("participantIcgIds");
