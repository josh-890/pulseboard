-- Add participantStatuses for pre-computed resolution status per participant
ALTER TABLE "staging_set" ADD COLUMN "participantStatuses" JSONB;
