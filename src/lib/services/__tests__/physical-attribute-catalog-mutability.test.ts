import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  createPhysicalAttributeDefinition,
  updatePhysicalAttributeDefinition,
} from "@/lib/services/physical-attribute-catalog-service";

// Slice 1 (ADR-0005): mutability policy on PhysicalAttributeDefinition.
// Hits the dev DB directly (consistent with the repo's existing test style).

const TEST_NAME_PREFIX = "TestMut_";

async function getTestGroupId(): Promise<string> {
  // Use any existing group; tests are read-mostly on the group side.
  const g = await prisma.physicalAttributeGroup.findFirst();
  if (!g) throw new Error("No PhysicalAttributeGroup exists in dev DB — seed it first");
  return g.id;
}

describe("PhysicalAttributeDefinition mutability", () => {
  afterEach(async () => {
    await prisma.physicalAttributeDefinition.deleteMany({
      where: { name: { startsWith: TEST_NAME_PREFIX } },
    });
  });

  it("defaults to RARELY_CHANGES when no mutability provided", async () => {
    const groupId = await getTestGroupId();
    const def = await createPhysicalAttributeDefinition({
      groupId,
      name: `${TEST_NAME_PREFIX}default_${Date.now()}`,
      valueType: "TEXT",
    });
    expect(def.mutability).toBe("RARELY_CHANGES");
  });

  it("persists an explicit ALWAYS_STATIC mutability on create", async () => {
    const groupId = await getTestGroupId();
    const def = await createPhysicalAttributeDefinition({
      groupId,
      name: `${TEST_NAME_PREFIX}static_${Date.now()}`,
      valueType: "TEXT",
      mutability: "ALWAYS_STATIC",
    });
    expect(def.mutability).toBe("ALWAYS_STATIC");
  });

  it("persists an explicit VOLATILE mutability on create", async () => {
    const groupId = await getTestGroupId();
    const def = await createPhysicalAttributeDefinition({
      groupId,
      name: `${TEST_NAME_PREFIX}volatile_${Date.now()}`,
      valueType: "NUMERIC",
      unit: "kg",
      mutability: "VOLATILE",
    });
    expect(def.mutability).toBe("VOLATILE");
  });

  it("changes mutability on update without touching other fields", async () => {
    const groupId = await getTestGroupId();
    const created = await createPhysicalAttributeDefinition({
      groupId,
      name: `${TEST_NAME_PREFIX}update_${Date.now()}`,
      valueType: "TEXT",
      mutability: "RARELY_CHANGES",
    });
    const updated = await updatePhysicalAttributeDefinition(created.id, {
      mutability: "VOLATILE",
    });
    expect(updated.mutability).toBe("VOLATILE");
    expect(updated.name).toBe(created.name);
    expect(updated.valueType).toBe("TEXT");
  });

  it("leaves mutability unchanged when update payload omits it", async () => {
    const groupId = await getTestGroupId();
    const created = await createPhysicalAttributeDefinition({
      groupId,
      name: `${TEST_NAME_PREFIX}preserve_${Date.now()}`,
      valueType: "TEXT",
      mutability: "ALWAYS_STATIC",
    });
    const updated = await updatePhysicalAttributeDefinition(created.id, {
      name: created.name + "_renamed",
    });
    expect(updated.mutability).toBe("ALWAYS_STATIC");
  });

  // ─── statusBearing (Phase G Slice 6½) ──────────────────────────────────────

  it("statusBearing defaults to FALSE when not provided", async () => {
    const groupId = await getTestGroupId();
    const def = await createPhysicalAttributeDefinition({
      groupId,
      name: `${TEST_NAME_PREFIX}sb_default_${Date.now()}`,
      valueType: "TEXT",
    });
    expect(def.statusBearing).toBe(false);
  });

  it("persists explicit statusBearing=true on create", async () => {
    const groupId = await getTestGroupId();
    const def = await createPhysicalAttributeDefinition({
      groupId,
      name: `${TEST_NAME_PREFIX}sb_true_${Date.now()}`,
      valueType: "TEXT",
      statusBearing: true,
    });
    expect(def.statusBearing).toBe(true);
  });

  it("update can flip statusBearing without touching other fields", async () => {
    const groupId = await getTestGroupId();
    const created = await createPhysicalAttributeDefinition({
      groupId,
      name: `${TEST_NAME_PREFIX}sb_flip_${Date.now()}`,
      valueType: "TEXT",
      statusBearing: false,
    });
    const updated = await updatePhysicalAttributeDefinition(created.id, {
      statusBearing: true,
    });
    expect(updated.statusBearing).toBe(true);
    expect(updated.name).toBe(created.name);
    expect(updated.mutability).toBe(created.mutability);
  });
});
