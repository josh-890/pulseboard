import type { PrismaClient, TagDomain, TagGroupKind, TagLevel } from "@/generated/prisma/client";
import { toTagName } from "@/lib/tag-names";

// The starter tag vocabulary (ADR-0033). Seeded into every tenant by
// `scripts/seed-tag-vocabulary.ts` and into a fresh dev DB by `prisma/seed.ts`.
// A starting point, edited afterwards in the app — re-applying never deletes a
// tag the user added, and only rewrites the fields listed here.

type VocabularyTag = {
  name: string;
  /** Name of another tag in the same group: this tag implies it */
  parent?: string;
  description?: string;
  aliases?: string[];
};

type VocabularyGroup = {
  slug: string;
  name: string;
  color: string;
  description: string;
  domain: TagDomain;
  typicalLevel?: TagLevel;
  kind?: TagGroupKind;
  isExclusive?: boolean;
  tags: VocabularyTag[];
};

export const TAG_VOCABULARY: VocabularyGroup[] = [
  {
    slug: "setting",
    name: "Setting",
    color: "#10b981",
    description: "Where the production took place, broadly",
    domain: "CONTENT",
    typicalLevel: "SESSION",
    isExclusive: true,
    tags: [
      { name: "Indoor" },
      { name: "Outdoor", aliases: ["outdoors", "outside", "exterior"] },
      { name: "Studio" },
    ],
  },
  {
    slug: "location",
    name: "Location",
    color: "#14b8a6",
    description: "The kind of place",
    domain: "CONTENT",
    typicalLevel: "SESSION",
    tags: [
      { name: "Beach" },
      { name: "Pool" },
      { name: "Hotel" },
      { name: "Home" },
      { name: "Nature" },
      { name: "Urban" },
      { name: "Car" },
      { name: "Gym" },
    ],
  },
  {
    slug: "mood-light",
    name: "Mood & Light",
    color: "#f59e0b",
    description: "Atmosphere and lighting of the production",
    domain: "CONTENT",
    typicalLevel: "SESSION",
    tags: [
      { name: "Natural light" },
      { name: "Golden hour" },
      { name: "Night" },
      { name: "Low-key" },
      { name: "High-key" },
      { name: "black-and-white", aliases: ["B&W", "monochrome"] },
    ],
  },
  {
    slug: "outfit",
    name: "Outfit",
    color: "#ec4899",
    description: "Wardrobe; a sub-tag implies its parent",
    domain: "CONTENT",
    typicalLevel: "SET",
    tags: [
      { name: "Swimwear" },
      { name: "Bikini", parent: "Swimwear" },
      { name: "One-piece", parent: "Swimwear", aliases: ["swimsuit"] },
      { name: "Lingerie" },
      { name: "Casual" },
      { name: "Jeans", parent: "Casual" },
      { name: "Dress" },
      { name: "Sport" },
      { name: "Costume", aliases: ["cosplay"] },
    ],
  },
  {
    slug: "pose",
    name: "Pose",
    color: "#a855f7",
    description: "Body pose in the image",
    domain: "CONTENT",
    typicalLevel: "MEDIA_ITEM",
    tags: [
      { name: "Standing" },
      { name: "Sitting" },
      { name: "Lying" },
      { name: "Kneeling" },
      { name: "Squat front" },
    ],
  },
  {
    slug: "framing",
    name: "Framing",
    color: "#6366f1",
    description: "Shot size of the image",
    domain: "CONTENT",
    typicalLevel: "MEDIA_ITEM",
    isExclusive: true,
    tags: [
      { name: "Close-up" },
      { name: "Portrait" },
      { name: "Half-body" },
      { name: "Full-body" },
      { name: "Detail" },
    ],
  },
  {
    slug: "publication-theme",
    name: "Publication theme",
    color: "#3b82f6",
    description: "What the release was published as",
    domain: "CONTENT",
    typicalLevel: "SET",
    tags: [
      { name: "Holiday special" },
      { name: "Behind the scenes", aliases: ["bts"] },
      { name: "Debut" },
    ],
  },
  {
    slug: "person-traits",
    name: "Person traits",
    color: "#8b5cf6",
    description: "Characterises a person; grows as you tag",
    domain: "PERSON",
    tags: [],
  },
  {
    slug: "workflow",
    name: "Workflow",
    color: "#f97316",
    description: "To-do markers — remove when done; never inherited",
    domain: "ANY",
    kind: "WORKFLOW",
    tags: [
      { name: "needs-crop" },
      { name: "check-cast" },
      { name: "upload-HD" },
      { name: "review" },
      { name: "missing-cover" },
    ],
  },
  {
    slug: "judgment",
    name: "Judgment",
    color: "#ef4444",
    description: "Your own assessment",
    domain: "ANY",
    tags: [
      { name: "best-of" },
      { name: "iconic" },
      { name: "weak-light" },
      { name: "duplicate-suspect" },
    ],
  },
];

/** The tag-name rule (kebab-case) — vocabulary names are written in it */
export const slugifyTagName = toTagName;

type TagClient = Pick<PrismaClient, "tagGroup" | "tagDefinition" | "tagAlias">;

/**
 * Upsert the starter vocabulary. Groups match by slug, tags by (group, slug),
 * aliases by their global slug — an alias already owned by another tag is left
 * alone. Groups keep the user's sort position when they already exist.
 */
export async function applyTagVocabulary(client: TagClient): Promise<void> {
  const maxOrder = await client.tagGroup.aggregate({ _max: { sortOrder: true } });
  let nextOrder = (maxOrder._max.sortOrder ?? -1) + 1;

  for (const g of TAG_VOCABULARY) {
    const fields = {
      name: g.name,
      color: g.color,
      description: g.description,
      domain: g.domain,
      typicalLevel: g.typicalLevel ?? null,
      kind: g.kind ?? "DESCRIPTIVE",
      isExclusive: g.isExclusive ?? false,
    };
    const group = await client.tagGroup.upsert({
      where: { slug: g.slug },
      create: { slug: g.slug, ...fields, sortOrder: nextOrder++ },
      update: fields,
    });

    const idByName = new Map<string, string>();
    for (let i = 0; i < g.tags.length; i++) {
      const t = g.tags[i];
      const slug = slugifyTagName(t.name);
      const def = await client.tagDefinition.upsert({
        where: { groupId_slug: { groupId: group.id, slug } },
        create: {
          groupId: group.id,
          name: slug,
          slug,
          nameNorm: slug,
          description: t.description ?? null,
          sortOrder: i,
        },
        update: { name: slug, nameNorm: slug },
      });
      idByName.set(t.name, def.id);

      for (const alias of t.aliases ?? []) {
        const aliasSlug = slugifyTagName(alias);
        const existing = await client.tagAlias.findUnique({ where: { slug: aliasSlug } });
        if (!existing) {
          await client.tagAlias.create({
            data: { tagDefinitionId: def.id, name: alias, nameNorm: alias.toLowerCase().trim(), slug: aliasSlug },
          });
        }
      }
    }

    // Parents in a second pass so declaration order inside a group is free
    for (const t of g.tags) {
      if (!t.parent) continue;
      const id = idByName.get(t.name);
      const parentId = idByName.get(t.parent);
      if (!id || !parentId) throw new Error(`Vocabulary: unknown parent "${t.parent}" in ${g.slug}`);
      await client.tagDefinition.update({ where: { id }, data: { parentId } });
    }
  }
}

// ─── Body appearance + outfit detail (2026-10-06) ───────────────────────────
// How a model *appears in the material* — styling and passing states — as
// opposed to the person attributes (hair colour/length, skin tone, freckles,
// build, sizes, eyes, vision aids) and body marks/modifications (tattoos,
// piercings), which describe the person and are tracked over time. Names follow
// the guide: kebab-case, the thing first (`nailpolish-red`, `footwear-heels`).
// Added with `extendTagVocabulary` — add-only, never rewrites what exists.

export const BODY_AND_OUTFIT_VOCABULARY: VocabularyGroup[] = [
  {
    slug: "skin",
    name: "Skin",
    color: "#d97706",
    description: "Visible state of the skin in this material — not the skin tone (a person attribute)",
    domain: "CONTENT",
    typicalLevel: "SET",
    tags: [
      { name: "skin-tanlines", aliases: ["tan-lines"] },
      { name: "skin-tanned" },
      { name: "skin-pale" },
      { name: "skin-oiled" },
      { name: "skin-wet" },
      { name: "skin-sandy" },
    ],
  },
  {
    slug: "hair-styling",
    name: "Hair styling",
    color: "#b45309",
    description: "How the hair is worn — not colour or length (person attributes)",
    domain: "CONTENT",
    typicalLevel: "MEDIA_ITEM",
    tags: [
      { name: "hair-ponytail" },
      { name: "hair-pigtails" },
      { name: "hair-braids" },
      { name: "hair-bun" },
      { name: "hair-up" },
      { name: "hair-down" },
      { name: "hair-wet" },
      { name: "hair-messy" },
    ],
  },
  {
    slug: "makeup",
    name: "Makeup",
    color: "#db2777",
    description: "Makeup worn in this material",
    domain: "CONTENT",
    typicalLevel: "SET",
    tags: [
      { name: "makeup-none" },
      { name: "makeup-natural" },
      { name: "makeup-glam" },
      { name: "makeup-red-lips" },
      { name: "makeup-smoky-eyes" },
    ],
  },
  {
    slug: "nails",
    name: "Nails",
    color: "#e11d48",
    description: "Nails in this material; a polish colour implies nails-polished",
    domain: "CONTENT",
    typicalLevel: "SET",
    tags: [
      { name: "nails-natural" },
      { name: "nails-polished" },
      { name: "nailpolish-red", parent: "nails-polished" },
      { name: "nailpolish-black", parent: "nails-polished" },
      { name: "nailpolish-pink", parent: "nails-polished" },
      { name: "nailpolish-white", parent: "nails-polished" },
      { name: "nailpolish-nude", parent: "nails-polished" },
      { name: "nails-french", parent: "nails-polished" },
      { name: "nails-long" },
    ],
  },
  {
    slug: "grooming",
    name: "Grooming",
    color: "#9f1239",
    description: "Intimate grooming in this material — one state per shoot",
    domain: "CONTENT",
    typicalLevel: "SET",
    isExclusive: true,
    tags: [{ name: "grooming-shaved" }, { name: "grooming-trimmed" }, { name: "grooming-natural" }],
  },
  {
    slug: "body-decoration",
    name: "Body decoration",
    color: "#7c3aed",
    description: "Temporary decoration — real tattoos and piercings are body marks/modifications",
    domain: "CONTENT",
    typicalLevel: "SET",
    tags: [
      { name: "decoration-body-paint" },
      { name: "decoration-glitter" },
      { name: "decoration-temporary-tattoo" },
    ],
  },
  {
    // Extends the starter group; on tenants that have it, only missing tags are added
    slug: "outfit",
    name: "Outfit",
    color: "#ec4899",
    description: "Wardrobe; a sub-tag implies its parent",
    domain: "CONTENT",
    typicalLevel: "SET",
    tags: [
      { name: "lingerie" },
      { name: "corset", parent: "lingerie" },
      { name: "babydoll", parent: "lingerie" },
      { name: "nightwear", aliases: ["pajamas", "nightgown"] },
      { name: "robe", aliases: ["bathrobe", "kimono"] },
      { name: "top" },
      { name: "shirt" },
      { name: "blouse" },
      { name: "sweater", aliases: ["pullover", "jumper"] },
      { name: "skirt" },
      { name: "shorts" },
      { name: "bodysuit", aliases: ["body"] },
      { name: "uniform" },
    ],
  },
  {
    slug: "outfit-color",
    name: "Outfit color",
    color: "#f472b6",
    description: "Main colour of the outfit",
    domain: "CONTENT",
    typicalLevel: "SET",
    tags: [
      { name: "outfit-red" },
      { name: "outfit-black" },
      { name: "outfit-white" },
      { name: "outfit-pink" },
      { name: "outfit-blue" },
      { name: "outfit-green" },
      { name: "outfit-yellow" },
      { name: "outfit-purple" },
      { name: "outfit-beige", aliases: ["outfit-nude-color"] },
      { name: "outfit-multicolor", aliases: ["outfit-colorful"] },
    ],
  },
  {
    slug: "outfit-material",
    name: "Outfit material",
    color: "#c026d3",
    description: "What the outfit is made of",
    domain: "CONTENT",
    typicalLevel: "SET",
    tags: [
      { name: "material-lace" },
      { name: "material-leather" },
      { name: "material-latex" },
      { name: "material-denim" },
      { name: "material-satin", aliases: ["material-silk"] },
      { name: "material-sheer", aliases: ["material-see-through", "material-mesh"] },
      { name: "material-knit" },
      { name: "material-cotton" },
    ],
  },
  {
    slug: "footwear",
    name: "Footwear",
    color: "#0ea5e9",
    description: "Shoes — or none",
    domain: "CONTENT",
    typicalLevel: "SET",
    tags: [
      { name: "footwear-heels", aliases: ["high-heels"] },
      { name: "footwear-boots" },
      { name: "footwear-sneakers" },
      { name: "footwear-sandals" },
      { name: "footwear-barefoot", aliases: ["barefoot"] },
    ],
  },
  {
    slug: "legwear",
    name: "Legwear",
    color: "#0284c7",
    description: "Stockings, tights, socks",
    domain: "CONTENT",
    typicalLevel: "SET",
    tags: [
      { name: "legwear-stockings" },
      { name: "legwear-pantyhose", aliases: ["legwear-tights"] },
      { name: "legwear-fishnets" },
      { name: "legwear-knee-socks" },
      { name: "legwear-socks" },
    ],
  },
  {
    slug: "accessories",
    name: "Accessories",
    color: "#64748b",
    description: "Worn in this material — glasses here are styling, not the vision-aids attribute",
    domain: "CONTENT",
    typicalLevel: "SET",
    tags: [
      { name: "accessory-glasses" },
      { name: "accessory-sunglasses" },
      { name: "accessory-hat" },
      { name: "accessory-choker" },
      { name: "accessory-necklace" },
      { name: "accessory-earrings" },
      { name: "accessory-gloves" },
      { name: "accessory-scarf" },
    ],
  },
];

export type VocabularyChange = { kind: "group" | "tag" | "alias" | "parent"; text: string };

/**
 * Add a vocabulary without touching what exists: a group or tag already there
 * (matched by slug) keeps its name, colour, settings and position; only missing
 * groups, tags and aliases are created, and a parent is set only on a tag that
 * has none. `dryRun` reports the same changes without writing.
 */
export async function extendTagVocabulary(
  client: TagClient,
  groups: VocabularyGroup[],
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<VocabularyChange[]> {
  const changes: VocabularyChange[] = [];
  const maxOrder = await client.tagGroup.aggregate({ _max: { sortOrder: true } });
  let nextGroupOrder = (maxOrder._max.sortOrder ?? -1) + 1;

  for (const g of groups) {
    let group = await client.tagGroup.findUnique({ where: { slug: g.slug } });
    if (!group) {
      changes.push({ kind: "group", text: `${g.name} (${g.domain.toLowerCase()}${g.isExclusive ? ", exclusive" : ""})` });
      if (!dryRun) {
        group = await client.tagGroup.create({
          data: {
            slug: g.slug,
            name: g.name,
            color: g.color,
            description: g.description,
            domain: g.domain,
            typicalLevel: g.typicalLevel ?? null,
            kind: g.kind ?? "DESCRIPTIVE",
            isExclusive: g.isExclusive ?? false,
            sortOrder: nextGroupOrder++,
          },
        });
      }
    }

    const existing = group
      ? await client.tagDefinition.findMany({ where: { groupId: group.id }, select: { id: true, slug: true, parentId: true, sortOrder: true } })
      : [];
    const bySlug = new Map(existing.map((t) => [t.slug, t]));
    let nextTagOrder = existing.reduce((m, t) => Math.max(m, t.sortOrder), -1) + 1;

    for (const t of g.tags) {
      const slug = toTagName(t.name);
      if (!bySlug.has(slug)) {
        changes.push({ kind: "tag", text: `${g.name}: ${slug}` });
        if (!dryRun && group) {
          const def = await client.tagDefinition.create({
            data: { groupId: group.id, name: slug, slug, nameNorm: slug, description: t.description ?? null, sortOrder: nextTagOrder++ },
          });
          bySlug.set(slug, { id: def.id, slug, parentId: null, sortOrder: def.sortOrder });
        }
      }
      for (const alias of t.aliases ?? []) {
        const aliasSlug = toTagName(alias);
        const taken = await client.tagAlias.findUnique({ where: { slug: aliasSlug } });
        if (taken) continue;
        changes.push({ kind: "alias", text: `${alias} → ${slug}` });
        const def = bySlug.get(slug);
        if (!dryRun && def) {
          await client.tagAlias.create({ data: { tagDefinitionId: def.id, name: alias, nameNorm: alias.toLowerCase().trim(), slug: aliasSlug } });
        }
      }
    }

    for (const t of g.tags) {
      if (!t.parent) continue;
      const child = bySlug.get(toTagName(t.name));
      const parent = bySlug.get(toTagName(t.parent));
      if (child && child.parentId) continue;
      changes.push({ kind: "parent", text: `${toTagName(t.name)} ⊂ ${toTagName(t.parent)}` });
      if (!dryRun) {
        if (!child || !parent) throw new Error(`Vocabulary: unknown parent "${t.parent}" in ${g.slug}`);
        await client.tagDefinition.update({ where: { id: child.id }, data: { parentId: parent.id } });
      }
    }
  }
  return changes;
}
