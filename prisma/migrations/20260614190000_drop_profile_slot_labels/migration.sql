-- ADR-0016 slice 6e-2 (part d): drop the legacy profile-slot label settings.
--
-- The people-browser display-framing selector now sources its labels from the
-- Profile category group (getProfileCategories), so the "p-img0{N}-label" Setting
-- rows that named the old slots are obsolete. Data-only; no schema change.

DELETE FROM "Setting" WHERE "key" LIKE 'p-img%';
