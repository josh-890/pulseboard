-- ADR-0016 slice 6a: columns for profile-slot unification (additive, no behavior
-- change — the hero still reads HEADSHOT/slot until the dual-read swap in 6d).
-- isAvatarSource: marks the system Headshot category (the avatar source).
-- isRepresentative: the displayed image per (person, category) framing.

ALTER TABLE "MediaCategory" ADD COLUMN "isAvatarSource" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PersonMediaLink" ADD COLUMN "isRepresentative" BOOLEAN NOT NULL DEFAULT false;
