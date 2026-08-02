import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { reconcileContacts } from "@/lib/services/relationship-service";
import { normalizeForSearch } from "@/lib/normalize";

// DB-integration test for plan slice 2: a set credit pinned to a Contact must be
// repointed onto the Person when that Person appears, BEFORE the contact row is
// deleted. The FK is onDelete: SetNull, so a missing repoint would not fail
// loudly — it would silently strip the credit back to a bare name, which is the
// exact bug this slice removes. That silence is why this test exists.
//
// Requires a reachable Postgres (see vitest env note); throwaway data is
// prefixed and wiped in afterEach.

const PREFIX = "CCR-TEST";

afterEach(async () => {
  const sets = await prisma.set.findMany({
    where: { title: { startsWith: PREFIX } },
    select: { id: true },
  });
  const setIds = sets.map((s) => s.id);
  if (setIds.length) {
    await prisma.setCreditRaw.deleteMany({ where: { setId: { in: setIds } } });
    await prisma.set.deleteMany({ where: { id: { in: setIds } } });
  }
  await prisma.contact.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.personAlias.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.person.deleteMany({ where: { icgId: { startsWith: "ZZ-99" } } });
});

async function makeSet(title: string) {
  return prisma.set.create({
    data: { title, titleNorm: normalizeForSearch(title), type: "photo" },
  });
}

describe("credit → contact repoint (reconcileContacts)", () => {
  it("moves a contact-pinned credit onto the Person and marks it resolved", async () => {
    const icgId = "ZZ-99@AAA";
    const contact = await prisma.contact.create({
      data: { icgId, name: `${PREFIX} Ghost`, nameNorm: normalizeForSearch(`${PREFIX} Ghost`) },
    });
    const set = await makeSet(`${PREFIX} One`);
    const credit = await prisma.setCreditRaw.create({
      data: {
        setId: set.id,
        rawName: `${PREFIX} Ghost`,
        nameNorm: normalizeForSearch(`${PREFIX} Ghost`),
        resolutionStatus: "UNRESOLVED",
        resolvedContactId: contact.id,
      },
    });

    // The person turns up with that ICG-ID.
    const person = await prisma.person.create({ data: { icgId } });
    await prisma.$transaction(async (tx) => {
      await reconcileContacts(tx, icgId, person.id);
    });

    const after = await prisma.setCreditRaw.findUniqueOrThrow({ where: { id: credit.id } });
    expect(after.resolvedPersonId).toBe(person.id);
    expect(after.resolvedContactId).toBeNull();
    expect(after.resolutionStatus).toBe("RESOLVED");

    // The ghost is retired — the delete must not have been blocked by the credit.
    expect(await prisma.contact.findUnique({ where: { id: contact.id } })).toBeNull();
  });

  it("leaves the credit's raw name intact — it is the used-name evidence (ADR-0024)", async () => {
    const icgId = "ZZ-99@BBB";
    const contact = await prisma.contact.create({
      data: { icgId, name: `${PREFIX} Common`, nameNorm: normalizeForSearch(`${PREFIX} Common`) },
    });
    const set = await makeSet(`${PREFIX} Two`);
    const credit = await prisma.setCreditRaw.create({
      data: {
        setId: set.id,
        rawName: `${PREFIX} UsedName`,
        nameNorm: normalizeForSearch(`${PREFIX} UsedName`),
        resolutionStatus: "UNRESOLVED",
        resolvedContactId: contact.id,
      },
    });

    const person = await prisma.person.create({ data: { icgId } });
    await prisma.$transaction(async (tx) => {
      await reconcileContacts(tx, icgId, person.id);
    });

    const after = await prisma.setCreditRaw.findUniqueOrThrow({ where: { id: credit.id } });
    expect(after.rawName).toBe(`${PREFIX} UsedName`);
  });

  it("does not touch credits pinned to a different contact", async () => {
    const other = await prisma.contact.create({
      data: {
        icgId: "ZZ-99@CCC",
        name: `${PREFIX} Other`,
        nameNorm: normalizeForSearch(`${PREFIX} Other`),
      },
    });
    const target = await prisma.contact.create({
      data: {
        icgId: "ZZ-99@DDD",
        name: `${PREFIX} Target`,
        nameNorm: normalizeForSearch(`${PREFIX} Target`),
      },
    });
    const set = await makeSet(`${PREFIX} Three`);
    const otherCredit = await prisma.setCreditRaw.create({
      data: {
        setId: set.id,
        rawName: `${PREFIX} Other`,
        nameNorm: normalizeForSearch(`${PREFIX} Other`),
        resolutionStatus: "UNRESOLVED",
        resolvedContactId: other.id,
      },
    });

    const person = await prisma.person.create({ data: { icgId: "ZZ-99@DDD" } });
    await prisma.$transaction(async (tx) => {
      await reconcileContacts(tx, "ZZ-99@DDD", person.id);
    });

    const after = await prisma.setCreditRaw.findUniqueOrThrow({ where: { id: otherCredit.id } });
    expect(after.resolvedContactId).toBe(other.id);
    expect(after.resolutionStatus).toBe("UNRESOLVED");
    expect(await prisma.contact.findUnique({ where: { id: target.id } })).toBeNull();
  });
});
