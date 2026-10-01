import type { PrismaClient, TagDomain, TagGroupKind, TagLevel } from "@/generated/prisma/client";

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
      { name: "B&W", aliases: ["black and white", "monochrome"] },
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

export function slugifyTagName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

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
          name: t.name,
          slug,
          nameNorm: t.name.toLowerCase().trim(),
          description: t.description ?? null,
          sortOrder: i,
        },
        update: { name: t.name, nameNorm: t.name.toLowerCase().trim() },
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
