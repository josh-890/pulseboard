-- Add dateIsConfirmed flag to Session
-- false (default) = date is estimated/copied from release date → always show ~
-- true = verified actual production date → precision-based ~ rules apply
ALTER TABLE "Session" ADD COLUMN "dateIsConfirmed" BOOLEAN NOT NULL DEFAULT false;
