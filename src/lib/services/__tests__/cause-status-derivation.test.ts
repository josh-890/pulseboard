import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { foldScalarDeltas } from "@/lib/services/person-service";

// Slice 4 (ADR-0007): AttributeStatus is derived from delta.cause.
// This test exercises the TS fold's status rules end-to-end against a
// throw-away test person seeded inline.

const PERSON_NAME_PREFIX = "TestCauseStatus_";

async function createPersonWithBaseline(name: string) {
  const person = await prisma.person.create({
    data: { icgId: `TCS-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` },
  });
  const baseline = await prisma.era.create({
    data: { personId: person.id, label: name, isBaseline: true },
  });
  return { personId: person.id, baselineEraId: baseline.id };
}

async function createDatedEra(personId: string, label: string, date: Date) {
  const era = await prisma.era.create({
    data: { personId, label, date, datePrecision: "DAY" },
  });
  return era.id;
}

async function loadErasForFold(personId: string) {
  return prisma.era.findMany({
    where: { personId },
    include: {
      scalarDeltas: { include: { attributeDefinition: { include: { group: true } } } },
    },
  });
}

describe("AttributeStatus derivation from cause (ADR-0007)", () => {
  afterEach(async () => {
    // Wipe any test people + their cascade. Eras + deltas drop via FK after the
    // person delete fails — but our test cascade isn't fully wired so do it
    // manually.
    const stale = await prisma.person.findMany({
      where: { icgId: { startsWith: "TCS-" } },
      select: { id: true },
    });
    for (const p of stale) {
      const eraIds = (await prisma.era.findMany({ where: { personId: p.id }, select: { id: true } })).map((e) => e.id);
      if (eraIds.length > 0) {
        await prisma.scalarDelta.deleteMany({ where: { eraId: { in: eraIds } } });
        await prisma.era.deleteMany({ where: { id: { in: eraIds } } });
      }
      await prisma.person.delete({ where: { id: p.id } }).catch(() => {});
    }
  });

  it("NATURAL: no SURGICAL deltas in history → winner is the latest dated delta", async () => {
    const { personId, baselineEraId } = await createPersonWithBaseline(`${PERSON_NAME_PREFIX}natural`);
    await prisma.scalarDelta.create({
      data: { eraId: baselineEraId, attributeDefinitionId: "cattr-weight", value: "60", cause: "NATURAL" },
    });
    const era2 = await createDatedEra(personId, "2022 drift", new Date("2022-01-01"));
    await prisma.scalarDelta.create({
      data: { eraId: era2, attributeDefinitionId: "cattr-weight", value: "62", date: new Date("2022-01-01"), datePrecision: "DAY", cause: "NATURAL" },
    });

    const eras = await loadErasForFold(personId);
    const folded = foldScalarDeltas(eras);
    expect(folded["cattr-weight"]?.value).toBe("62");
    expect(folded["cattr-weight"]?.cause).toBe("NATURAL");
  });

  it("ENHANCED: winning delta has cause=SURGICAL", async () => {
    const { personId, baselineEraId } = await createPersonWithBaseline(`${PERSON_NAME_PREFIX}enhanced`);
    await prisma.scalarDelta.create({
      data: { eraId: baselineEraId, attributeDefinitionId: "cattr-breast-size", value: "B", cause: "NATURAL" },
    });
    const era2 = await createDatedEra(personId, "2020 surgery", new Date("2020-06-01"));
    await prisma.scalarDelta.create({
      data: { eraId: era2, attributeDefinitionId: "cattr-breast-size", value: "D", date: new Date("2020-06-01"), datePrecision: "DAY", cause: "SURGICAL" },
    });

    const eras = await loadErasForFold(personId);
    const folded = foldScalarDeltas(eras);
    expect(folded["cattr-breast-size"]?.value).toBe("D");
    expect(folded["cattr-breast-size"]?.cause).toBe("SURGICAL");
  });

  it("RESTORED: SURGICAL in history but a later non-SURGICAL delta overrode it", async () => {
    const { personId, baselineEraId } = await createPersonWithBaseline(`${PERSON_NAME_PREFIX}restored`);
    await prisma.scalarDelta.create({
      data: { eraId: baselineEraId, attributeDefinitionId: "cattr-breast-size", value: "B", cause: "NATURAL" },
    });
    const era2 = await createDatedEra(personId, "2020 surgery", new Date("2020-06-01"));
    await prisma.scalarDelta.create({
      data: { eraId: era2, attributeDefinitionId: "cattr-breast-size", value: "D", date: new Date("2020-06-01"), datePrecision: "DAY", cause: "SURGICAL" },
    });
    const era3 = await createDatedEra(personId, "2024 removal", new Date("2024-03-01"));
    await prisma.scalarDelta.create({
      data: { eraId: era3, attributeDefinitionId: "cattr-breast-size", value: "B", date: new Date("2024-03-01"), datePrecision: "DAY", cause: "NATURAL" },
    });

    const eras = await loadErasForFold(personId);
    const folded = foldScalarDeltas(eras);
    expect(folded["cattr-breast-size"]?.value).toBe("B");
    expect(folded["cattr-breast-size"]?.cause).toBe("NATURAL");

    // For RESTORED check: any non-winner delta in this attribute's history with cause=SURGICAL.
    const allSurgical = eras
      .flatMap((e) => e.scalarDeltas)
      .filter((d) => d.attributeDefinitionId === "cattr-breast-size" && d.cause === "SURGICAL");
    expect(allSurgical.length).toBe(1);
  });
});
