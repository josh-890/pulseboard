import { prisma } from "@/lib/db";
import type {
  AuditTier,
  Mutability,
  PhysicalAttributeValueType,
} from "@/generated/prisma/client";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ─── Type validation ─────────────────────────────────────────────────────────

export type DefinitionTypedInput = {
  valueType: PhysicalAttributeValueType;
  allowedValues?: string[];
  ordinalMin?: number | null;
  ordinalMax?: number | null;
  unit?: string | null;
};

function validateTypedFields(input: DefinitionTypedInput): void {
  const { valueType, allowedValues = [], ordinalMin, ordinalMax } = input;
  switch (valueType) {
    case "BOOLEAN":
    case "TEXT":
      // No allowed values; ordinal min/max irrelevant
      if (allowedValues.length > 0) {
        throw new Error(`${valueType} attributes must not have allowed values`);
      }
      break;
    case "SINGLE_SELECT":
    case "MULTI_SELECT":
      if (allowedValues.length === 0) {
        throw new Error(`${valueType} attributes need at least one allowed value`);
      }
      // De-dupe + trim
      {
        const cleaned = Array.from(
          new Set(allowedValues.map((v) => v.trim()).filter(Boolean)),
        );
        if (cleaned.length === 0) {
          throw new Error(`${valueType} attributes need at least one non-empty value`);
        }
        input.allowedValues = cleaned;
      }
      break;
    case "ORDINAL":
      if (ordinalMin == null || ordinalMax == null) {
        throw new Error("ORDINAL attributes need ordinalMin and ordinalMax");
      }
      if (ordinalMin >= ordinalMax) {
        throw new Error("ORDINAL ordinalMin must be less than ordinalMax");
      }
      break;
    case "NUMERIC":
      // No allowed values; unit is optional but recommended
      if (allowedValues.length > 0) {
        throw new Error("NUMERIC attributes must not have allowed values");
      }
      break;
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type PhysicalAttributeGroupWithDefinitions = Awaited<
  ReturnType<typeof getAllPhysicalAttributeGroups>
>[number];

// ─── Group CRUD ──────────────────────────────────────────────────────────────

export async function getAllPhysicalAttributeGroups() {
  return prisma.physicalAttributeGroup.findMany({
    include: {
      definitions: {
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { sortOrder: "asc" },
  });
}

export async function createPhysicalAttributeGroup(data: {
  name: string;
  sortOrder?: number;
}) {
  const maxOrder = await prisma.physicalAttributeGroup.aggregate({
    _max: { sortOrder: true },
  });
  return prisma.physicalAttributeGroup.create({
    data: {
      name: data.name,
      sortOrder: data.sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1,
    },
  });
}

export async function updatePhysicalAttributeGroup(
  id: string,
  data: { name?: string; sortOrder?: number },
) {
  return prisma.physicalAttributeGroup.update({
    where: { id },
    data,
  });
}

export async function deletePhysicalAttributeGroup(id: string) {
  const count = await prisma.physicalAttributeDefinition.count({
    where: { groupId: id },
  });
  if (count > 0) {
    throw new Error("Cannot delete group with existing definitions");
  }
  return prisma.physicalAttributeGroup.delete({ where: { id } });
}

// ─── Definition CRUD ─────────────────────────────────────────────────────────

export async function createPhysicalAttributeDefinition(data: {
  groupId: string;
  name: string;
  unit?: string | null;
  sortOrder?: number;
  valueType?: PhysicalAttributeValueType;
  allowedValues?: string[];
  ordinalMin?: number | null;
  ordinalMax?: number | null;
  mutability?: Mutability;
  statusBearing?: boolean;
  tier?: AuditTier;
}) {
  const valueType: PhysicalAttributeValueType = data.valueType ?? "TEXT";
  const typedInput: DefinitionTypedInput = {
    valueType,
    allowedValues: data.allowedValues ?? [],
    ordinalMin: data.ordinalMin ?? null,
    ordinalMax: data.ordinalMax ?? null,
    unit: data.unit ?? null,
  };
  validateTypedFields(typedInput);

  const maxOrder = await prisma.physicalAttributeDefinition.aggregate({
    _max: { sortOrder: true },
    where: { groupId: data.groupId },
  });
  return prisma.physicalAttributeDefinition.create({
    data: {
      groupId: data.groupId,
      name: data.name,
      slug: slugify(data.name),
      unit: data.unit ?? null,
      valueType,
      allowedValues: typedInput.allowedValues ?? [],
      ordinalMin: data.ordinalMin ?? null,
      ordinalMax: data.ordinalMax ?? null,
      mutability: data.mutability ?? "RARELY_CHANGES",
      statusBearing: data.statusBearing ?? false,
      tier: data.tier ?? "NONE",
      sortOrder: data.sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1,
    },
  });
}

export async function updatePhysicalAttributeDefinition(
  id: string,
  data: {
    name?: string;
    unit?: string | null;
    sortOrder?: number;
    valueType?: PhysicalAttributeValueType;
    allowedValues?: string[];
    ordinalMin?: number | null;
    ordinalMax?: number | null;
    mutability?: Mutability;
    statusBearing?: boolean;
    tier?: AuditTier;
  },
) {
  // When changing typed fields, validate against the resulting state. We need
  // the current row to fill in any fields not present in the patch.
  if (
    data.valueType !== undefined ||
    data.allowedValues !== undefined ||
    data.ordinalMin !== undefined ||
    data.ordinalMax !== undefined
  ) {
    const current = await prisma.physicalAttributeDefinition.findUniqueOrThrow({
      where: { id },
    });
    const typedInput: DefinitionTypedInput = {
      valueType: data.valueType ?? current.valueType,
      allowedValues: data.allowedValues ?? current.allowedValues,
      ordinalMin: data.ordinalMin !== undefined ? data.ordinalMin : current.ordinalMin,
      ordinalMax: data.ordinalMax !== undefined ? data.ordinalMax : current.ordinalMax,
      unit: data.unit !== undefined ? data.unit : current.unit,
    };
    validateTypedFields(typedInput);
    // Reflect any normalization (de-duping / trimming) the validator applied
    if (typedInput.allowedValues !== undefined) {
      data.allowedValues = typedInput.allowedValues;
    }
  }

  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) {
    updateData.name = data.name;
    updateData.slug = slugify(data.name);
  }
  if (data.unit !== undefined) updateData.unit = data.unit;
  if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;
  if (data.valueType !== undefined) updateData.valueType = data.valueType;
  if (data.allowedValues !== undefined) updateData.allowedValues = data.allowedValues;
  if (data.ordinalMin !== undefined) updateData.ordinalMin = data.ordinalMin;
  if (data.ordinalMax !== undefined) updateData.ordinalMax = data.ordinalMax;
  if (data.mutability !== undefined) updateData.mutability = data.mutability;
  if (data.statusBearing !== undefined) updateData.statusBearing = data.statusBearing;
  if (data.tier !== undefined) updateData.tier = data.tier;

  return prisma.physicalAttributeDefinition.update({
    where: { id },
    data: updateData,
  });
}

export async function deletePhysicalAttributeDefinition(id: string) {
  const [attrCount, procCount] = await Promise.all([
    prisma.scalarDelta.count({
      where: { attributeDefinitionId: id },
    }),
    prisma.cosmeticProcedure.count({
      where: { attributeDefinitionId: id },
    }),
  ]);
  if (attrCount > 0) {
    throw new Error(
      "Cannot delete definition that is in use by era physical attributes",
    );
  }
  if (procCount > 0) {
    throw new Error(
      "Cannot delete definition that is linked to cosmetic procedures",
    );
  }
  return prisma.physicalAttributeDefinition.delete({ where: { id } });
}

// ─── Reorder ─────────────────────────────────────────────────────────────────

export async function reorderPhysicalAttributeGroups(orderedIds: string[]) {
  await prisma.$transaction(
    orderedIds.map((id, i) =>
      prisma.physicalAttributeGroup.update({
        where: { id },
        data: { sortOrder: i + 1 },
      }),
    ),
  );
}

export async function reorderPhysicalAttributeDefinitions(
  orderedIds: string[],
) {
  await prisma.$transaction(
    orderedIds.map((id, i) =>
      prisma.physicalAttributeDefinition.update({
        where: { id },
        data: { sortOrder: i + 1 },
      }),
    ),
  );
}
