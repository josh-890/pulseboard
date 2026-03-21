// ─── Body Region Constants ──────────────────────────────────────────────────
//
// Flat region list with optional sub-regions accessible via popover.
// Region IDs: snake_case, L/R suffixed with _l/_r.
// Sub-region IDs: parent_id.sub_name (e.g., "face.scalp", "shoulder_r.front").
// Spine uses dotted IDs per parent (back_upper.spine, back_mid.spine, back_lower.spine).

export type RegionView = "front" | "back" | "both";

export type SubRegion = {
  id: string;
  label: string;
  shortLabel: string;
  searchAliases: string[];
};

export type BodyRegion = {
  id: string;
  label: string;
  shortLabel: string;
  view: RegionView;
  subRegions?: SubRegion[];
  searchAliases: string[];
};

// ─── Region Definitions ─────────────────────────────────────────────────────

const regions: BodyRegion[] = [
  // ── FACE (front only, with sub-region popover) ────────────────────────────
  {
    id: "face",
    label: "Face",
    shortLabel: "Face",
    view: "both",
    searchAliases: ["face", "head", "cranium"],
    subRegions: [
      { id: "face.scalp", label: "Scalp", shortLabel: "Scalp", searchAliases: ["scalp", "top of head"] },
      { id: "face.forehead", label: "Forehead", shortLabel: "Forehead", searchAliases: ["forehead", "brow"] },
      { id: "face.eyebrow_r", label: "Eyebrow (Right)", shortLabel: "Eyebrow (R)", searchAliases: ["eyebrow", "brow"] },
      { id: "face.eyebrow_l", label: "Eyebrow (Left)", shortLabel: "Eyebrow (L)", searchAliases: ["eyebrow", "brow"] },
      { id: "face.nose", label: "Nose", shortLabel: "Nose", searchAliases: ["nose", "nostril", "septum", "bridge"] },
      { id: "face.lips", label: "Lips", shortLabel: "Lips", searchAliases: ["lips", "lip", "mouth", "labret", "medusa", "philtrum"] },
      { id: "face.oral_cavity", label: "Oral Cavity", shortLabel: "Oral", searchAliases: ["oral cavity", "mouth", "inside mouth", "tongue web", "smiley"] },
      { id: "face.tongue", label: "Tongue", shortLabel: "Tongue", searchAliases: ["tongue", "tongue piercing", "venom"] },
      { id: "face.cheek_r", label: "Cheek (Right)", shortLabel: "Cheek (R)", searchAliases: ["cheek"] },
      { id: "face.cheek_l", label: "Cheek (Left)", shortLabel: "Cheek (L)", searchAliases: ["cheek"] },
      { id: "face.chin", label: "Chin", shortLabel: "Chin", searchAliases: ["chin"] },
      { id: "face.jaw_r", label: "Jaw (Right)", shortLabel: "Jaw (R)", searchAliases: ["jaw", "jawline"] },
      { id: "face.jaw_l", label: "Jaw (Left)", shortLabel: "Jaw (L)", searchAliases: ["jaw", "jawline"] },
      { id: "face.ear_r", label: "Ear (Right)", shortLabel: "Ear (R)", searchAliases: ["ear", "right ear", "earlobe", "tragus", "helix", "conch", "daith", "rook"] },
      { id: "face.ear_l", label: "Ear (Left)", shortLabel: "Ear (L)", searchAliases: ["ear", "left ear", "earlobe", "tragus", "helix", "conch", "daith", "rook"] },
    ],
  },

  // ── NECK ──────────────────────────────────────────────────────────────────
  { id: "neck_front", label: "Front of Neck", shortLabel: "Neck Front", view: "front", searchAliases: ["neck", "front neck", "throat"] },
  { id: "neck_back", label: "Back of Neck", shortLabel: "Neck Back", view: "back", searchAliases: ["neck", "back neck", "nape"] },
  { id: "neck_side_r", label: "Right Side of Neck", shortLabel: "Neck (R)", view: "front", searchAliases: ["side of neck", "neck side"] },
  { id: "neck_side_l", label: "Left Side of Neck", shortLabel: "Neck (L)", view: "front", searchAliases: ["side of neck", "neck side"] },

  // ── SHOULDER (both views, with front/back sub-regions) ────────────────────
  {
    id: "shoulder_r",
    label: "Right Shoulder",
    shortLabel: "Shoulder (R)",
    view: "both",
    searchAliases: ["shoulder", "deltoid", "right shoulder"],
    subRegions: [
      { id: "shoulder_r.front", label: "Front Shoulder (Right)", shortLabel: "Front (R)", searchAliases: ["front shoulder", "anterior deltoid"] },
      { id: "shoulder_r.back", label: "Back Shoulder (Right)", shortLabel: "Back (R)", searchAliases: ["back shoulder", "rear deltoid", "posterior deltoid"] },
    ],
  },
  {
    id: "shoulder_l",
    label: "Left Shoulder",
    shortLabel: "Shoulder (L)",
    view: "both",
    searchAliases: ["shoulder", "deltoid", "left shoulder"],
    subRegions: [
      { id: "shoulder_l.front", label: "Front Shoulder (Left)", shortLabel: "Front (L)", searchAliases: ["front shoulder", "anterior deltoid"] },
      { id: "shoulder_l.back", label: "Back Shoulder (Left)", shortLabel: "Back (L)", searchAliases: ["back shoulder", "rear deltoid", "posterior deltoid"] },
    ],
  },

  // ── CLAVICLE ──────────────────────────────────────────────────────────────
  { id: "clavicle_r", label: "Right Clavicle", shortLabel: "Clavicle (R)", view: "front", searchAliases: ["clavicle", "collarbone"] },
  { id: "clavicle_l", label: "Left Clavicle", shortLabel: "Clavicle (L)", view: "front", searchAliases: ["clavicle", "collarbone"] },

  // ── CHEST ─────────────────────────────────────────────────────────────────
  { id: "upper_chest_r", label: "Right Upper Chest", shortLabel: "Upper Chest (R)", view: "front", searchAliases: ["upper chest", "chest", "pectoral"] },
  { id: "upper_chest_l", label: "Left Upper Chest", shortLabel: "Upper Chest (L)", view: "front", searchAliases: ["upper chest", "chest", "pectoral"] },
  { id: "breast_r", label: "Right Breast", shortLabel: "Breast (R)", view: "front", searchAliases: ["breast", "boob"] },
  { id: "breast_l", label: "Left Breast", shortLabel: "Breast (L)", view: "front", searchAliases: ["breast", "boob"] },
  { id: "nipple_r", label: "Right Nipple / Areola", shortLabel: "Nipple (R)", view: "front", searchAliases: ["nipple", "areola", "nipple piercing"] },
  { id: "nipple_l", label: "Left Nipple / Areola", shortLabel: "Nipple (L)", view: "front", searchAliases: ["nipple", "areola", "nipple piercing"] },
  { id: "sternum", label: "Sternum", shortLabel: "Sternum", view: "front", searchAliases: ["sternum", "breastbone", "between breasts"] },

  // ── ABDOMEN ───────────────────────────────────────────────────────────────
  { id: "abdomen_upper", label: "Upper Abdomen", shortLabel: "Upper Abs", view: "front", searchAliases: ["upper abdomen", "upper stomach", "epigastric"] },
  { id: "abdomen_r", label: "Right Abdomen", shortLabel: "Abdomen (R)", view: "front", searchAliases: ["right abdomen", "right side"] },
  { id: "abdomen_l", label: "Left Abdomen", shortLabel: "Abdomen (L)", view: "front", searchAliases: ["left abdomen", "left side"] },
  { id: "abdomen_lower_r", label: "Right Lower Abdomen", shortLabel: "Lower Abs (R)", view: "front", searchAliases: ["lower abdomen", "lower belly", "suprapubic", "appendix"] },
  { id: "abdomen_lower_l", label: "Left Lower Abdomen", shortLabel: "Lower Abs (L)", view: "front", searchAliases: ["lower abdomen", "lower belly", "suprapubic"] },
  { id: "navel", label: "Navel", shortLabel: "Navel", view: "front", searchAliases: ["navel", "belly button", "umbilicus", "navel piercing"] },

  // ── RIBCAGE & FLANK ───────────────────────────────────────────────────────
  { id: "ribcage_r", label: "Right Ribcage", shortLabel: "Ribs (R)", view: "both", searchAliases: ["ribcage", "ribs", "rib", "side"] },
  { id: "ribcage_l", label: "Left Ribcage", shortLabel: "Ribs (L)", view: "both", searchAliases: ["ribcage", "ribs", "rib", "side"] },
  { id: "flank_r", label: "Right Flank", shortLabel: "Flank (R)", view: "both", searchAliases: ["flank", "love handle", "side"] },
  { id: "flank_l", label: "Left Flank", shortLabel: "Flank (L)", view: "both", searchAliases: ["flank", "love handle", "side"] },

  // ── GROIN & PUBIC ─────────────────────────────────────────────────────────
  { id: "groin_r", label: "Right Groin", shortLabel: "Groin (R)", view: "front", searchAliases: ["groin", "inguinal"] },
  { id: "groin_l", label: "Left Groin", shortLabel: "Groin (L)", view: "front", searchAliases: ["groin", "inguinal"] },
  {
    id: "pubic",
    label: "Pubic Region",
    shortLabel: "Pubic",
    view: "both",
    searchAliases: ["pubic", "pubic area", "genital", "intimate", "private"],
    subRegions: [
      { id: "pubic.mons", label: "Mons Pubis", shortLabel: "Mons", searchAliases: ["mons pubis", "pubic mound", "mons"] },
      { id: "pubic.labia", label: "Labia", shortLabel: "Labia", searchAliases: ["labia", "vulva", "vch", "hch", "christina"] },
      { id: "pubic.clitoris", label: "Clitoris", shortLabel: "Clitoris", searchAliases: ["clitoris", "clitoral hood", "vch", "hch"] },
      { id: "pubic.vagina", label: "Vagina", shortLabel: "Vagina", searchAliases: ["vagina", "vaginal"] },
      { id: "pubic.perineum", label: "Perineum", shortLabel: "Perineum", searchAliases: ["perineum", "guiche"] },
      { id: "pubic.anus", label: "Anus / Perianal", shortLabel: "Anus", searchAliases: ["anus", "anal", "perianal"] },
    ],
  },

  // ── BACK ──────────────────────────────────────────────────────────────────
  {
    id: "back_upper",
    label: "Upper Back",
    shortLabel: "Upper Back",
    view: "back",
    searchAliases: ["upper back", "thoracic"],
    subRegions: [
      { id: "back_upper.spine", label: "Spine", shortLabel: "Spine", searchAliases: ["spine", "spinal", "vertebrae", "spine tattoo"] },
    ],
  },
  { id: "shoulder_blade_r", label: "Right Shoulder Blade", shortLabel: "Scapula (R)", view: "back", searchAliases: ["shoulder blade", "scapula"] },
  { id: "shoulder_blade_l", label: "Left Shoulder Blade", shortLabel: "Scapula (L)", view: "back", searchAliases: ["shoulder blade", "scapula"] },
  {
    id: "back_mid",
    label: "Mid Back",
    shortLabel: "Mid Back",
    view: "back",
    searchAliases: ["mid back", "middle back"],
    subRegions: [
      { id: "back_mid.spine", label: "Spine", shortLabel: "Spine", searchAliases: ["spine", "spinal", "vertebrae", "spine tattoo"] },
    ],
  },
  {
    id: "back_lower",
    label: "Lower Back",
    shortLabel: "Lower Back",
    view: "back",
    searchAliases: ["lower back", "lumbar"],
    subRegions: [
      { id: "back_lower.spine", label: "Spine", shortLabel: "Spine", searchAliases: ["spine", "spinal", "vertebrae", "spine tattoo"] },
    ],
  },
  { id: "sacral", label: "Sacral Region", shortLabel: "Sacral", view: "back", searchAliases: ["sacral", "sacrum", "tailbone", "coccyx"] },

  // ── BUTTOCKS ──────────────────────────────────────────────────────────────
  { id: "buttock_r", label: "Right Buttock", shortLabel: "Buttock (R)", view: "back", searchAliases: ["buttock", "butt", "glute"] },
  { id: "buttock_l", label: "Left Buttock", shortLabel: "Buttock (L)", view: "back", searchAliases: ["buttock", "butt", "glute"] },
  { id: "gluteal_cleft", label: "Gluteal Cleft", shortLabel: "Glut. Cleft", view: "back", searchAliases: ["gluteal cleft", "butt crack", "intergluteal cleft"] },

  // ── ARM ────────────────────────────────────────────────────────────────────
  {
    id: "upper_arm_r",
    label: "Right Upper Arm",
    shortLabel: "Upper Arm (R)",
    view: "both",
    searchAliases: ["upper arm", "bicep", "right arm"],
    subRegions: [
      { id: "upper_arm_r.outer", label: "Outer Upper Arm (Right)", shortLabel: "Outer (R)", searchAliases: ["outer arm", "lateral arm"] },
      { id: "upper_arm_r.inner", label: "Inner Upper Arm (Right)", shortLabel: "Inner (R)", searchAliases: ["inner arm", "inner bicep"] },
    ],
  },
  {
    id: "upper_arm_l",
    label: "Left Upper Arm",
    shortLabel: "Upper Arm (L)",
    view: "both",
    searchAliases: ["upper arm", "bicep", "left arm"],
    subRegions: [
      { id: "upper_arm_l.outer", label: "Outer Upper Arm (Left)", shortLabel: "Outer (L)", searchAliases: ["outer arm", "lateral arm"] },
      { id: "upper_arm_l.inner", label: "Inner Upper Arm (Left)", shortLabel: "Inner (L)", searchAliases: ["inner arm", "inner bicep"] },
    ],
  },
  { id: "elbow_r", label: "Right Elbow", shortLabel: "Elbow (R)", view: "both", searchAliases: ["elbow"] },
  { id: "elbow_l", label: "Left Elbow", shortLabel: "Elbow (L)", view: "both", searchAliases: ["elbow"] },
  {
    id: "forearm_r",
    label: "Right Forearm",
    shortLabel: "Forearm (R)",
    view: "both",
    searchAliases: ["forearm", "right forearm"],
    subRegions: [
      { id: "forearm_r.outer", label: "Outer Forearm (Right)", shortLabel: "Outer (R)", searchAliases: ["outer forearm"] },
      { id: "forearm_r.inner", label: "Inner Forearm (Right)", shortLabel: "Inner (R)", searchAliases: ["inner forearm", "wrist area"] },
    ],
  },
  {
    id: "forearm_l",
    label: "Left Forearm",
    shortLabel: "Forearm (L)",
    view: "both",
    searchAliases: ["forearm", "left forearm"],
    subRegions: [
      { id: "forearm_l.outer", label: "Outer Forearm (Left)", shortLabel: "Outer (L)", searchAliases: ["outer forearm"] },
      { id: "forearm_l.inner", label: "Inner Forearm (Left)", shortLabel: "Inner (L)", searchAliases: ["inner forearm", "wrist area"] },
    ],
  },
  { id: "wrist_r", label: "Right Wrist", shortLabel: "Wrist (R)", view: "both", searchAliases: ["wrist"] },
  { id: "wrist_l", label: "Left Wrist", shortLabel: "Wrist (L)", view: "both", searchAliases: ["wrist"] },
  {
    id: "hand_r",
    label: "Right Hand",
    shortLabel: "Hand (R)",
    view: "both",
    searchAliases: ["hand", "right hand"],
    subRegions: [
      { id: "hand_r.back", label: "Back of Hand (Right)", shortLabel: "Back (R)", searchAliases: ["back of hand", "dorsum"] },
      { id: "hand_r.palm", label: "Palm (Right)", shortLabel: "Palm (R)", searchAliases: ["palm"] },
      { id: "hand_r.fingers", label: "Fingers (Right)", shortLabel: "Fingers (R)", searchAliases: ["finger", "fingers", "knuckle"] },
    ],
  },
  {
    id: "hand_l",
    label: "Left Hand",
    shortLabel: "Hand (L)",
    view: "both",
    searchAliases: ["hand", "left hand"],
    subRegions: [
      { id: "hand_l.back", label: "Back of Hand (Left)", shortLabel: "Back (L)", searchAliases: ["back of hand", "dorsum"] },
      { id: "hand_l.palm", label: "Palm (Left)", shortLabel: "Palm (L)", searchAliases: ["palm"] },
      { id: "hand_l.fingers", label: "Fingers (Left)", shortLabel: "Fingers (L)", searchAliases: ["finger", "fingers", "knuckle"] },
    ],
  },

  // ── HIP ────────────────────────────────────────────────────────────────────
  { id: "hip_r", label: "Right Hip", shortLabel: "Hip (R)", view: "both", searchAliases: ["hip"] },
  { id: "hip_l", label: "Left Hip", shortLabel: "Hip (L)", view: "both", searchAliases: ["hip"] },

  // ── LEG ────────────────────────────────────────────────────────────────────
  {
    id: "thigh_r",
    label: "Right Thigh",
    shortLabel: "Thigh (R)",
    view: "both",
    searchAliases: ["thigh", "right thigh", "quad", "hamstring"],
    subRegions: [
      { id: "thigh_r.front", label: "Front Thigh (Right)", shortLabel: "Front (R)", searchAliases: ["front thigh", "quad"] },
      { id: "thigh_r.back", label: "Back Thigh (Right)", shortLabel: "Back (R)", searchAliases: ["back thigh", "hamstring"] },
      { id: "thigh_r.inner", label: "Inner Thigh (Right)", shortLabel: "Inner (R)", searchAliases: ["inner thigh"] },
      { id: "thigh_r.outer", label: "Outer Thigh (Right)", shortLabel: "Outer (R)", searchAliases: ["outer thigh", "it band"] },
    ],
  },
  {
    id: "thigh_l",
    label: "Left Thigh",
    shortLabel: "Thigh (L)",
    view: "both",
    searchAliases: ["thigh", "left thigh", "quad", "hamstring"],
    subRegions: [
      { id: "thigh_l.front", label: "Front Thigh (Left)", shortLabel: "Front (L)", searchAliases: ["front thigh", "quad"] },
      { id: "thigh_l.back", label: "Back Thigh (Left)", shortLabel: "Back (L)", searchAliases: ["back thigh", "hamstring"] },
      { id: "thigh_l.inner", label: "Inner Thigh (Left)", shortLabel: "Inner (L)", searchAliases: ["inner thigh"] },
      { id: "thigh_l.outer", label: "Outer Thigh (Left)", shortLabel: "Outer (L)", searchAliases: ["outer thigh", "it band"] },
    ],
  },
  {
    id: "knee_r",
    label: "Right Knee",
    shortLabel: "Knee (R)",
    view: "both",
    searchAliases: ["knee", "kneecap", "right knee"],
    subRegions: [
      { id: "knee_r.front", label: "Front Knee (Right)", shortLabel: "Front (R)", searchAliases: ["kneecap", "patella"] },
      { id: "knee_r.behind", label: "Behind Knee (Right)", shortLabel: "Behind (R)", searchAliases: ["behind knee", "popliteal"] },
    ],
  },
  {
    id: "knee_l",
    label: "Left Knee",
    shortLabel: "Knee (L)",
    view: "both",
    searchAliases: ["knee", "kneecap", "left knee"],
    subRegions: [
      { id: "knee_l.front", label: "Front Knee (Left)", shortLabel: "Front (L)", searchAliases: ["kneecap", "patella"] },
      { id: "knee_l.behind", label: "Behind Knee (Left)", shortLabel: "Behind (L)", searchAliases: ["behind knee", "popliteal"] },
    ],
  },
  {
    id: "lower_leg_r",
    label: "Right Lower Leg",
    shortLabel: "Lower Leg (R)",
    view: "both",
    searchAliases: ["lower leg", "shin", "calf", "right leg"],
    subRegions: [
      { id: "lower_leg_r.shin", label: "Shin (Right)", shortLabel: "Shin (R)", searchAliases: ["shin", "tibia"] },
      { id: "lower_leg_r.calf", label: "Calf (Right)", shortLabel: "Calf (R)", searchAliases: ["calf", "gastrocnemius"] },
    ],
  },
  {
    id: "lower_leg_l",
    label: "Left Lower Leg",
    shortLabel: "Lower Leg (L)",
    view: "both",
    searchAliases: ["lower leg", "shin", "calf", "left leg"],
    subRegions: [
      { id: "lower_leg_l.shin", label: "Shin (Left)", shortLabel: "Shin (L)", searchAliases: ["shin", "tibia"] },
      { id: "lower_leg_l.calf", label: "Calf (Left)", shortLabel: "Calf (L)", searchAliases: ["calf", "gastrocnemius"] },
    ],
  },
  { id: "ankle_r", label: "Right Ankle", shortLabel: "Ankle (R)", view: "both", searchAliases: ["ankle"] },
  { id: "ankle_l", label: "Left Ankle", shortLabel: "Ankle (L)", view: "both", searchAliases: ["ankle"] },
  {
    id: "foot_r",
    label: "Right Foot",
    shortLabel: "Foot (R)",
    view: "both",
    searchAliases: ["foot", "right foot"],
    subRegions: [
      { id: "foot_r.top", label: "Top of Foot (Right)", shortLabel: "Top (R)", searchAliases: ["top of foot", "dorsum of foot"] },
      { id: "foot_r.sole", label: "Sole (Right)", shortLabel: "Sole (R)", searchAliases: ["sole", "bottom of foot"] },
      { id: "foot_r.toes", label: "Toes (Right)", shortLabel: "Toes (R)", searchAliases: ["toe", "toes"] },
    ],
  },
  {
    id: "foot_l",
    label: "Left Foot",
    shortLabel: "Foot (L)",
    view: "both",
    searchAliases: ["foot", "left foot"],
    subRegions: [
      { id: "foot_l.top", label: "Top of Foot (Left)", shortLabel: "Top (L)", searchAliases: ["top of foot", "dorsum of foot"] },
      { id: "foot_l.sole", label: "Sole (Left)", shortLabel: "Sole (L)", searchAliases: ["sole", "bottom of foot"] },
      { id: "foot_l.toes", label: "Toes (Left)", shortLabel: "Toes (L)", searchAliases: ["toe", "toes"] },
    ],
  },
];

// ─── Lookup Maps ────────────────────────────────────────────────────────────

export const BODY_REGIONS: readonly BodyRegion[] = regions;

/** Map of all top-level region IDs to their definitions */
export const BODY_REGION_MAP: ReadonlyMap<string, BodyRegion> = new Map(
  regions.map((r) => [r.id, r]),
);

/** Map of ALL IDs (top-level + sub-regions) to { label, shortLabel } */
const allLabels = new Map<string, { label: string; shortLabel: string }>();
for (const r of regions) {
  allLabels.set(r.id, { label: r.label, shortLabel: r.shortLabel });
  if (r.subRegions) {
    for (const sub of r.subRegions) {
      if (!allLabels.has(sub.id)) {
        allLabels.set(sub.id, { label: sub.label, shortLabel: sub.shortLabel });
      }
    }
  }
}

/** Map of sub-region ID → parent region IDs */
const subToParents = new Map<string, string[]>();
for (const r of regions) {
  if (r.subRegions) {
    for (const sub of r.subRegions) {
      const parents = subToParents.get(sub.id) ?? [];
      parents.push(r.id);
      subToParents.set(sub.id, parents);
    }
  }
}

// ─── Helper Functions ───────────────────────────────────────────────────────

/** Get the display label for any region or sub-region ID */
export function getRegionLabel(id: string): string {
  return allLabels.get(id)?.label ?? id;
}

/** Get the short display label for any region or sub-region ID */
export function getRegionShortLabel(id: string): string {
  return allLabels.get(id)?.shortLabel ?? id;
}

/**
 * Get a context-aware label for chips/pills.
 * Top-level regions use shortLabel. Sub-regions prepend their parent's
 * shortLabel so "knee_r.front" → "Knee (R): Front" instead of "Front (R)".
 * Strips redundant laterality when parent already indicates the side.
 */
export function getRegionChipLabel(id: string): string {
  // Top-level region — shortLabel is fine
  if (BODY_REGION_MAP.has(id)) return getRegionShortLabel(id);

  const parents = getParentIds(id);
  const subLabel = allLabels.get(id)?.shortLabel ?? id;

  if (parents.length === 0) return subLabel;

  const parentShort = getRegionShortLabel(parents[0]);

  // Strip redundant side suffix from sub-label when parent already has it
  // e.g. parent "Knee (R)" + sub "Front (R)" → "Knee (R): Front"
  let cleanSub = subLabel;
  const sideMatch = parentShort.match(/\((R|L)\)$/);
  if (sideMatch) {
    cleanSub = cleanSub.replace(` (${sideMatch[1]})`, "").trim();
  }

  return `${parentShort}: ${cleanSub}`;
}

/** Check if an ID is valid (top-level or sub-region) */
export function isValidRegionId(id: string): boolean {
  return allLabels.has(id);
}

/** Check if a top-level region has sub-regions (popover) */
export function hasSubRegions(id: string): boolean {
  const region = BODY_REGION_MAP.get(id);
  return (region?.subRegions?.length ?? 0) > 0;
}

/** Get sub-regions for a top-level region */
export function getSubRegions(id: string): SubRegion[] {
  return BODY_REGION_MAP.get(id)?.subRegions ?? [];
}

/** Get parent region IDs for a sub-region */
export function getParentIds(subId: string): string[] {
  return subToParents.get(subId) ?? [];
}

/** Get all sub-region IDs for a top-level region */
export function getSubRegionIds(id: string): string[] {
  const region = BODY_REGION_MAP.get(id);
  if (!region?.subRegions) return [];
  return region.subRegions.map((s) => s.id);
}

/**
 * Expand a set of filter region IDs for querying.
 * - Selecting a parent expands to include all its sub-region IDs.
 * - Selecting a sub-region expands to include its parent IDs.
 */
export function expandRegionFilter(ids: string[]): string[] {
  const expanded = new Set(ids);
  for (const id of ids) {
    // If it's a top-level region, add its sub-regions
    const subIds = getSubRegionIds(id);
    for (const sub of subIds) {
      expanded.add(sub);
    }
    // If it's a sub-region, add its parents
    const parentIds = getParentIds(id);
    for (const parent of parentIds) {
      expanded.add(parent);
    }
  }
  return Array.from(expanded);
}

/** Search regions by query (matches label, shortLabel, or searchAliases) */
export function searchRegions(query: string): Array<{ id: string; label: string; isSubRegion: boolean }> {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const results: Array<{ id: string; label: string; isSubRegion: boolean }> = [];

  for (const region of regions) {
    if (
      region.label.toLowerCase().includes(q) ||
      region.shortLabel.toLowerCase().includes(q) ||
      region.id.toLowerCase().includes(q) ||
      region.searchAliases.some((a) => a.toLowerCase().includes(q))
    ) {
      results.push({ id: region.id, label: region.label, isSubRegion: false });
    }
    if (region.subRegions) {
      for (const sub of region.subRegions) {
        if (
          sub.label.toLowerCase().includes(q) ||
          sub.shortLabel.toLowerCase().includes(q) ||
          sub.id.toLowerCase().includes(q) ||
          sub.searchAliases.some((a) => a.toLowerCase().includes(q))
        ) {
          if (!results.some((r) => r.id === sub.id)) {
            results.push({ id: sub.id, label: sub.label, isSubRegion: true });
          }
        }
      }
    }
  }
  return results;
}

/** Get regions visible on a specific body view */
export function getRegionsForView(view: "front" | "back"): BodyRegion[] {
  return regions.filter((r) => r.view === view || r.view === "both");
}

// ─── Preset Templates ──────────────────────────────────────────────────────

export type BodyRegionPreset = {
  id: string;
  label: string;
  regionIds: string[];
};

export const BODY_REGION_PRESETS: BodyRegionPreset[] = [
  {
    id: "full_back",
    label: "Full Back",
    regionIds: ["back_upper", "shoulder_blade_r", "shoulder_blade_l", "back_mid", "back_lower", "sacral"],
  },
  {
    id: "full_chest",
    label: "Full Chest",
    regionIds: ["upper_chest_r", "upper_chest_l", "breast_r", "breast_l", "sternum"],
  },
  {
    id: "full_sleeve_r",
    label: "Full Sleeve (Right)",
    regionIds: ["shoulder_r", "upper_arm_r", "elbow_r", "forearm_r", "wrist_r"],
  },
  {
    id: "full_sleeve_l",
    label: "Full Sleeve (Left)",
    regionIds: ["shoulder_l", "upper_arm_l", "elbow_l", "forearm_l", "wrist_l"],
  },
  {
    id: "half_sleeve_r",
    label: "Half Sleeve (Right)",
    regionIds: ["shoulder_r", "upper_arm_r", "elbow_r"],
  },
  {
    id: "half_sleeve_l",
    label: "Half Sleeve (Left)",
    regionIds: ["shoulder_l", "upper_arm_l", "elbow_l"],
  },
  {
    id: "both_ears",
    label: "Both Ears",
    regionIds: ["face.ear_r", "face.ear_l"],
  },
];

// ─── Free-text Migration Map ────────────────────────────────────────────────

export const FREE_TEXT_REGION_MAP: Record<string, string[]> = {
  "arm": ["upper_arm_l"],
  "left arm": ["upper_arm_l"],
  "right arm": ["upper_arm_r"],
  "upper arm": ["upper_arm_l"],
  "forearm": ["forearm_l"],
  "wrist": ["wrist_l"],
  "hand": ["hand_l"],
  "finger": ["hand_l.fingers"],
  "fingers": ["hand_l.fingers"],
  "shoulder": ["shoulder_l"],
  "chest": ["upper_chest_l", "upper_chest_r"],
  "breast": ["breast_l"],
  "back": ["back_upper", "back_mid", "back_lower"],
  "upper back": ["back_upper"],
  "lower back": ["back_lower"],
  "stomach": ["abdomen_upper", "abdomen_lower_r", "abdomen_lower_l"],
  "abdomen": ["abdomen_upper", "abdomen_lower_r", "abdomen_lower_l"],
  "ribs": ["ribcage_l", "ribcage_r"],
  "navel": ["navel"],
  "belly button": ["navel"],
  "hip": ["hip_l"],
  "sternum": ["sternum"],
  "nipple": ["nipple_l"],
  "face": ["face"],
  "forehead": ["face.forehead"],
  "eyebrow": ["face.eyebrow_l"],
  "nose": ["face.nose"],
  "nostril": ["face.nose"],
  "septum": ["face.nose"],
  "lip": ["face.lips"],
  "lips": ["face.lips"],
  "chin": ["face.chin"],
  "ear": ["face.ear_l"],
  "left ear": ["face.ear_l"],
  "right ear": ["face.ear_r"],
  "earlobe": ["face.ear_l"],
  "neck": ["neck_front"],
  "scalp": ["face.scalp"],
  "tongue": ["face.tongue"],
  "leg": ["thigh_l", "lower_leg_l"],
  "left leg": ["thigh_l", "lower_leg_l"],
  "right leg": ["thigh_r", "lower_leg_r"],
  "thigh": ["thigh_l"],
  "knee": ["knee_l"],
  "shin": ["lower_leg_l.shin"],
  "calf": ["lower_leg_l.calf"],
  "ankle": ["ankle_l"],
  "foot": ["foot_l"],
  "toe": ["foot_l.toes"],
  "toes": ["foot_l.toes"],
  "buttock": ["buttock_l", "buttock_r"],
  "butt": ["buttock_l", "buttock_r"],
  "groin": ["groin_l"],
  "pubic": ["pubic"],
  "tailbone": ["sacral"],
  "spine": ["back_upper.spine", "back_mid.spine", "back_lower.spine"],
  "clavicle": ["clavicle_l"],
  "collarbone": ["clavicle_l"],
  "flank": ["flank_l"],
};

/**
 * Map a free-text bodyRegion + side to standardized region IDs.
 */
export function mapFreeTextToRegions(
  bodyRegion: string,
  side?: string | null,
): string[] {
  const normalized = bodyRegion.toLowerCase().trim();
  const sideNorm = side?.toLowerCase().trim();

  // Try with side prefix: "left arm"
  if (sideNorm) {
    const withSide = `${sideNorm} ${normalized}`;
    if (FREE_TEXT_REGION_MAP[withSide]) return FREE_TEXT_REGION_MAP[withSide];
  }

  // Try raw
  if (FREE_TEXT_REGION_MAP[normalized]) {
    let ids = FREE_TEXT_REGION_MAP[normalized];
    if (sideNorm === "right") {
      ids = ids.map((id) => id.replace(/_l/g, "_r"));
    }
    return ids;
  }

  return [];
}
