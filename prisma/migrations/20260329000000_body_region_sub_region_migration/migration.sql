-- Migrate old top-level body region IDs → front/primary sub-region IDs
-- Affected models: BodyMark (bodyRegions[]), BodyMarkEvent (bodyRegions[]),
--                  BodyModification (bodyRegion), CosmeticProcedure (bodyRegion),
--                  PersonMediaLink (bodyRegion)
--
-- Old top-level IDs that now have view-specific sub-regions default to the front variant,
-- except lower_leg → shin and hand → palm and foot → top.

-- ── BodyMark (bodyRegions String[]) ──────────────────────────────────────────

UPDATE "BodyMark" SET "bodyRegions" = array_replace("bodyRegions", 'knee_r', 'knee_r.front') WHERE 'knee_r' = ANY("bodyRegions");
UPDATE "BodyMark" SET "bodyRegions" = array_replace("bodyRegions", 'knee_l', 'knee_l.front') WHERE 'knee_l' = ANY("bodyRegions");
UPDATE "BodyMark" SET "bodyRegions" = array_replace("bodyRegions", 'lower_leg_r', 'lower_leg_r.shin') WHERE 'lower_leg_r' = ANY("bodyRegions");
UPDATE "BodyMark" SET "bodyRegions" = array_replace("bodyRegions", 'lower_leg_l', 'lower_leg_l.shin') WHERE 'lower_leg_l' = ANY("bodyRegions");
UPDATE "BodyMark" SET "bodyRegions" = array_replace("bodyRegions", 'thigh_r', 'thigh_r.front') WHERE 'thigh_r' = ANY("bodyRegions");
UPDATE "BodyMark" SET "bodyRegions" = array_replace("bodyRegions", 'thigh_l', 'thigh_l.front') WHERE 'thigh_l' = ANY("bodyRegions");
UPDATE "BodyMark" SET "bodyRegions" = array_replace("bodyRegions", 'upper_arm_r', 'upper_arm_r.front') WHERE 'upper_arm_r' = ANY("bodyRegions");
UPDATE "BodyMark" SET "bodyRegions" = array_replace("bodyRegions", 'upper_arm_l', 'upper_arm_l.front') WHERE 'upper_arm_l' = ANY("bodyRegions");
UPDATE "BodyMark" SET "bodyRegions" = array_replace("bodyRegions", 'forearm_r', 'forearm_r.front') WHERE 'forearm_r' = ANY("bodyRegions");
UPDATE "BodyMark" SET "bodyRegions" = array_replace("bodyRegions", 'forearm_l', 'forearm_l.front') WHERE 'forearm_l' = ANY("bodyRegions");
UPDATE "BodyMark" SET "bodyRegions" = array_replace("bodyRegions", 'hand_r', 'hand_r.palm') WHERE 'hand_r' = ANY("bodyRegions");
UPDATE "BodyMark" SET "bodyRegions" = array_replace("bodyRegions", 'hand_l', 'hand_l.palm') WHERE 'hand_l' = ANY("bodyRegions");
UPDATE "BodyMark" SET "bodyRegions" = array_replace("bodyRegions", 'foot_r', 'foot_r.top') WHERE 'foot_r' = ANY("bodyRegions");
UPDATE "BodyMark" SET "bodyRegions" = array_replace("bodyRegions", 'foot_l', 'foot_l.top') WHERE 'foot_l' = ANY("bodyRegions");
UPDATE "BodyMark" SET "bodyRegions" = array_replace("bodyRegions", 'wrist_r', 'wrist_r.front') WHERE 'wrist_r' = ANY("bodyRegions");
UPDATE "BodyMark" SET "bodyRegions" = array_replace("bodyRegions", 'wrist_l', 'wrist_l.front') WHERE 'wrist_l' = ANY("bodyRegions");
UPDATE "BodyMark" SET "bodyRegions" = array_replace("bodyRegions", 'elbow_r', 'elbow_r.front') WHERE 'elbow_r' = ANY("bodyRegions");
UPDATE "BodyMark" SET "bodyRegions" = array_replace("bodyRegions", 'elbow_l', 'elbow_l.front') WHERE 'elbow_l' = ANY("bodyRegions");
UPDATE "BodyMark" SET "bodyRegions" = array_replace("bodyRegions", 'ankle_r', 'ankle_r.front') WHERE 'ankle_r' = ANY("bodyRegions");
UPDATE "BodyMark" SET "bodyRegions" = array_replace("bodyRegions", 'ankle_l', 'ankle_l.front') WHERE 'ankle_l' = ANY("bodyRegions");

-- ── BodyMarkEvent (bodyRegions String[]) ─────────────────────────────────────

UPDATE "BodyMarkEvent" SET "bodyRegions" = array_replace("bodyRegions", 'knee_r', 'knee_r.front') WHERE 'knee_r' = ANY("bodyRegions");
UPDATE "BodyMarkEvent" SET "bodyRegions" = array_replace("bodyRegions", 'knee_l', 'knee_l.front') WHERE 'knee_l' = ANY("bodyRegions");
UPDATE "BodyMarkEvent" SET "bodyRegions" = array_replace("bodyRegions", 'lower_leg_r', 'lower_leg_r.shin') WHERE 'lower_leg_r' = ANY("bodyRegions");
UPDATE "BodyMarkEvent" SET "bodyRegions" = array_replace("bodyRegions", 'lower_leg_l', 'lower_leg_l.shin') WHERE 'lower_leg_l' = ANY("bodyRegions");
UPDATE "BodyMarkEvent" SET "bodyRegions" = array_replace("bodyRegions", 'thigh_r', 'thigh_r.front') WHERE 'thigh_r' = ANY("bodyRegions");
UPDATE "BodyMarkEvent" SET "bodyRegions" = array_replace("bodyRegions", 'thigh_l', 'thigh_l.front') WHERE 'thigh_l' = ANY("bodyRegions");
UPDATE "BodyMarkEvent" SET "bodyRegions" = array_replace("bodyRegions", 'upper_arm_r', 'upper_arm_r.front') WHERE 'upper_arm_r' = ANY("bodyRegions");
UPDATE "BodyMarkEvent" SET "bodyRegions" = array_replace("bodyRegions", 'upper_arm_l', 'upper_arm_l.front') WHERE 'upper_arm_l' = ANY("bodyRegions");
UPDATE "BodyMarkEvent" SET "bodyRegions" = array_replace("bodyRegions", 'forearm_r', 'forearm_r.front') WHERE 'forearm_r' = ANY("bodyRegions");
UPDATE "BodyMarkEvent" SET "bodyRegions" = array_replace("bodyRegions", 'forearm_l', 'forearm_l.front') WHERE 'forearm_l' = ANY("bodyRegions");
UPDATE "BodyMarkEvent" SET "bodyRegions" = array_replace("bodyRegions", 'hand_r', 'hand_r.palm') WHERE 'hand_r' = ANY("bodyRegions");
UPDATE "BodyMarkEvent" SET "bodyRegions" = array_replace("bodyRegions", 'hand_l', 'hand_l.palm') WHERE 'hand_l' = ANY("bodyRegions");
UPDATE "BodyMarkEvent" SET "bodyRegions" = array_replace("bodyRegions", 'foot_r', 'foot_r.top') WHERE 'foot_r' = ANY("bodyRegions");
UPDATE "BodyMarkEvent" SET "bodyRegions" = array_replace("bodyRegions", 'foot_l', 'foot_l.top') WHERE 'foot_l' = ANY("bodyRegions");
UPDATE "BodyMarkEvent" SET "bodyRegions" = array_replace("bodyRegions", 'wrist_r', 'wrist_r.front') WHERE 'wrist_r' = ANY("bodyRegions");
UPDATE "BodyMarkEvent" SET "bodyRegions" = array_replace("bodyRegions", 'wrist_l', 'wrist_l.front') WHERE 'wrist_l' = ANY("bodyRegions");
UPDATE "BodyMarkEvent" SET "bodyRegions" = array_replace("bodyRegions", 'elbow_r', 'elbow_r.front') WHERE 'elbow_r' = ANY("bodyRegions");
UPDATE "BodyMarkEvent" SET "bodyRegions" = array_replace("bodyRegions", 'elbow_l', 'elbow_l.front') WHERE 'elbow_l' = ANY("bodyRegions");
UPDATE "BodyMarkEvent" SET "bodyRegions" = array_replace("bodyRegions", 'ankle_r', 'ankle_r.front') WHERE 'ankle_r' = ANY("bodyRegions");
UPDATE "BodyMarkEvent" SET "bodyRegions" = array_replace("bodyRegions", 'ankle_l', 'ankle_l.front') WHERE 'ankle_l' = ANY("bodyRegions");

-- ── BodyModification (bodyRegion String) ─────────────────────────────────────

UPDATE "BodyModification" SET "bodyRegion" = 'knee_r.front' WHERE "bodyRegion" = 'knee_r';
UPDATE "BodyModification" SET "bodyRegion" = 'knee_l.front' WHERE "bodyRegion" = 'knee_l';
UPDATE "BodyModification" SET "bodyRegion" = 'lower_leg_r.shin' WHERE "bodyRegion" = 'lower_leg_r';
UPDATE "BodyModification" SET "bodyRegion" = 'lower_leg_l.shin' WHERE "bodyRegion" = 'lower_leg_l';
UPDATE "BodyModification" SET "bodyRegion" = 'thigh_r.front' WHERE "bodyRegion" = 'thigh_r';
UPDATE "BodyModification" SET "bodyRegion" = 'thigh_l.front' WHERE "bodyRegion" = 'thigh_l';
UPDATE "BodyModification" SET "bodyRegion" = 'upper_arm_r.front' WHERE "bodyRegion" = 'upper_arm_r';
UPDATE "BodyModification" SET "bodyRegion" = 'upper_arm_l.front' WHERE "bodyRegion" = 'upper_arm_l';
UPDATE "BodyModification" SET "bodyRegion" = 'forearm_r.front' WHERE "bodyRegion" = 'forearm_r';
UPDATE "BodyModification" SET "bodyRegion" = 'forearm_l.front' WHERE "bodyRegion" = 'forearm_l';
UPDATE "BodyModification" SET "bodyRegion" = 'hand_r.palm' WHERE "bodyRegion" = 'hand_r';
UPDATE "BodyModification" SET "bodyRegion" = 'hand_l.palm' WHERE "bodyRegion" = 'hand_l';
UPDATE "BodyModification" SET "bodyRegion" = 'foot_r.top' WHERE "bodyRegion" = 'foot_r';
UPDATE "BodyModification" SET "bodyRegion" = 'foot_l.top' WHERE "bodyRegion" = 'foot_l';
UPDATE "BodyModification" SET "bodyRegion" = 'wrist_r.front' WHERE "bodyRegion" = 'wrist_r';
UPDATE "BodyModification" SET "bodyRegion" = 'wrist_l.front' WHERE "bodyRegion" = 'wrist_l';
UPDATE "BodyModification" SET "bodyRegion" = 'elbow_r.front' WHERE "bodyRegion" = 'elbow_r';
UPDATE "BodyModification" SET "bodyRegion" = 'elbow_l.front' WHERE "bodyRegion" = 'elbow_l';
UPDATE "BodyModification" SET "bodyRegion" = 'ankle_r.front' WHERE "bodyRegion" = 'ankle_r';
UPDATE "BodyModification" SET "bodyRegion" = 'ankle_l.front' WHERE "bodyRegion" = 'ankle_l';

-- ── CosmeticProcedure (bodyRegion String) ────────────────────────────────────

UPDATE "CosmeticProcedure" SET "bodyRegion" = 'knee_r.front' WHERE "bodyRegion" = 'knee_r';
UPDATE "CosmeticProcedure" SET "bodyRegion" = 'knee_l.front' WHERE "bodyRegion" = 'knee_l';
UPDATE "CosmeticProcedure" SET "bodyRegion" = 'lower_leg_r.shin' WHERE "bodyRegion" = 'lower_leg_r';
UPDATE "CosmeticProcedure" SET "bodyRegion" = 'lower_leg_l.shin' WHERE "bodyRegion" = 'lower_leg_l';
UPDATE "CosmeticProcedure" SET "bodyRegion" = 'thigh_r.front' WHERE "bodyRegion" = 'thigh_r';
UPDATE "CosmeticProcedure" SET "bodyRegion" = 'thigh_l.front' WHERE "bodyRegion" = 'thigh_l';
UPDATE "CosmeticProcedure" SET "bodyRegion" = 'upper_arm_r.front' WHERE "bodyRegion" = 'upper_arm_r';
UPDATE "CosmeticProcedure" SET "bodyRegion" = 'upper_arm_l.front' WHERE "bodyRegion" = 'upper_arm_l';
UPDATE "CosmeticProcedure" SET "bodyRegion" = 'forearm_r.front' WHERE "bodyRegion" = 'forearm_r';
UPDATE "CosmeticProcedure" SET "bodyRegion" = 'forearm_l.front' WHERE "bodyRegion" = 'forearm_l';
UPDATE "CosmeticProcedure" SET "bodyRegion" = 'hand_r.palm' WHERE "bodyRegion" = 'hand_r';
UPDATE "CosmeticProcedure" SET "bodyRegion" = 'hand_l.palm' WHERE "bodyRegion" = 'hand_l';
UPDATE "CosmeticProcedure" SET "bodyRegion" = 'foot_r.top' WHERE "bodyRegion" = 'foot_r';
UPDATE "CosmeticProcedure" SET "bodyRegion" = 'foot_l.top' WHERE "bodyRegion" = 'foot_l';
UPDATE "CosmeticProcedure" SET "bodyRegion" = 'wrist_r.front' WHERE "bodyRegion" = 'wrist_r';
UPDATE "CosmeticProcedure" SET "bodyRegion" = 'wrist_l.front' WHERE "bodyRegion" = 'wrist_l';
UPDATE "CosmeticProcedure" SET "bodyRegion" = 'elbow_r.front' WHERE "bodyRegion" = 'elbow_r';
UPDATE "CosmeticProcedure" SET "bodyRegion" = 'elbow_l.front' WHERE "bodyRegion" = 'elbow_l';
UPDATE "CosmeticProcedure" SET "bodyRegion" = 'ankle_r.front' WHERE "bodyRegion" = 'ankle_r';
UPDATE "CosmeticProcedure" SET "bodyRegion" = 'ankle_l.front' WHERE "bodyRegion" = 'ankle_l';

-- ── PersonMediaLink (bodyRegion String) ──────────────────────────────────────

UPDATE "PersonMediaLink" SET "bodyRegion" = 'knee_r.front' WHERE "bodyRegion" = 'knee_r';
UPDATE "PersonMediaLink" SET "bodyRegion" = 'knee_l.front' WHERE "bodyRegion" = 'knee_l';
UPDATE "PersonMediaLink" SET "bodyRegion" = 'lower_leg_r.shin' WHERE "bodyRegion" = 'lower_leg_r';
UPDATE "PersonMediaLink" SET "bodyRegion" = 'lower_leg_l.shin' WHERE "bodyRegion" = 'lower_leg_l';
UPDATE "PersonMediaLink" SET "bodyRegion" = 'thigh_r.front' WHERE "bodyRegion" = 'thigh_r';
UPDATE "PersonMediaLink" SET "bodyRegion" = 'thigh_l.front' WHERE "bodyRegion" = 'thigh_l';
UPDATE "PersonMediaLink" SET "bodyRegion" = 'upper_arm_r.front' WHERE "bodyRegion" = 'upper_arm_r';
UPDATE "PersonMediaLink" SET "bodyRegion" = 'upper_arm_l.front' WHERE "bodyRegion" = 'upper_arm_l';
UPDATE "PersonMediaLink" SET "bodyRegion" = 'forearm_r.front' WHERE "bodyRegion" = 'forearm_r';
UPDATE "PersonMediaLink" SET "bodyRegion" = 'forearm_l.front' WHERE "bodyRegion" = 'forearm_l';
UPDATE "PersonMediaLink" SET "bodyRegion" = 'hand_r.palm' WHERE "bodyRegion" = 'hand_r';
UPDATE "PersonMediaLink" SET "bodyRegion" = 'hand_l.palm' WHERE "bodyRegion" = 'hand_l';
UPDATE "PersonMediaLink" SET "bodyRegion" = 'foot_r.top' WHERE "bodyRegion" = 'foot_r';
UPDATE "PersonMediaLink" SET "bodyRegion" = 'foot_l.top' WHERE "bodyRegion" = 'foot_l';
UPDATE "PersonMediaLink" SET "bodyRegion" = 'wrist_r.front' WHERE "bodyRegion" = 'wrist_r';
UPDATE "PersonMediaLink" SET "bodyRegion" = 'wrist_l.front' WHERE "bodyRegion" = 'wrist_l';
UPDATE "PersonMediaLink" SET "bodyRegion" = 'elbow_r.front' WHERE "bodyRegion" = 'elbow_r';
UPDATE "PersonMediaLink" SET "bodyRegion" = 'elbow_l.front' WHERE "bodyRegion" = 'elbow_l';
UPDATE "PersonMediaLink" SET "bodyRegion" = 'ankle_r.front' WHERE "bodyRegion" = 'ankle_r';
UPDATE "PersonMediaLink" SET "bodyRegion" = 'ankle_l.front' WHERE "bodyRegion" = 'ankle_l';
