import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createAlias, mergeAliases } from "@/lib/services/alias-service";
import { normalizeForSearch } from "@/lib/normalize";

// DB-integration tests for the alias find-or-reuse fix and the mergeAliases
// pin re-point fix. Throwaway data is prefixed and wiped in afterEach. Requires
// a local Postgres on 127.0.0.1:5432 (skipped/failing on connection in WSL).

const ICG_PREFIX = "TACM-";
const NAME_PREFIX = "TACM_";

async function makePerson() {
  return prisma.person.create({
    data: { icgId: `${ICG_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 7)}` },
  });
}

async function makeChannel(label: string) {
  return prisma.channel.create({ data: { name: `${NAME_PREFIX}${label}` } });
}

afterEach(async () => {
  const persons = await prisma.person.findMany({
    where: { icgId: { startsWith: ICG_PREFIX } },
    select: { id: true },
  });
  const personIds = persons.map((p) => p.id);
  const aliasIds = (
    await prisma.personAlias.findMany({ where: { personId: { in: personIds } }, select: { id: true } })
  ).map((a) => a.id);

  await prisma.setCreditRaw.deleteMany({ where: { set: { title: { startsWith: NAME_PREFIX } } } });
  await prisma.personAliasChannel.deleteMany({ where: { aliasId: { in: aliasIds } } });
  await prisma.personAlias.deleteMany({ where: { id: { in: aliasIds } } });
  await prisma.set.deleteMany({ where: { title: { startsWith: NAME_PREFIX } } });
  await prisma.channel.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } });
  await prisma.person.deleteMany({ where: { id: { in: personIds } } });
});

describe("createAlias find-or-reuse", () => {
  it("reuses an existing alias by nameNorm instead of duplicating, merging channel links", async () => {
    const person = await makePerson();
    const chanA = await makeChannel("A");
    const chanB = await makeChannel("B");

    await createAlias(person.id, "Ariel", false, false, "MANUAL", null, [chanA.id]);
    // Different casing → same nameNorm → must reuse, not duplicate.
    const second = await createAlias(person.id, "ariel", false, false, "MANUAL", null, [chanB.id]);

    const aliases = await prisma.personAlias.findMany({
      where: { personId: person.id, nameNorm: normalizeForSearch("Ariel") },
    });
    expect(aliases).toHaveLength(1);
    expect(second.id).toBe(aliases[0].id);

    const links = await prisma.personAliasChannel.findMany({ where: { aliasId: aliases[0].id } });
    expect(links.map((l) => l.channelId).sort()).toEqual([chanA.id, chanB.id].sort());
    // First (and only) alias on each channel → both links primary.
    expect(links.every((l) => l.isPrimary)).toBe(true);
  });

  it("does not clobber isCommon on the existing alias when reusing", async () => {
    const person = await makePerson();
    const chan = await makeChannel("C");

    await createAlias(person.id, "Wiska", true, false, "MANUAL", null, [chan.id]);
    await createAlias(person.id, "Wiska", false, false, "MANUAL", null, []);

    const alias = await prisma.personAlias.findFirstOrThrow({
      where: { personId: person.id, nameNorm: normalizeForSearch("Wiska") },
    });
    expect(alias.isCommon).toBe(true);
  });

  it("marks a channel link primary only for the person's first alias on that channel", async () => {
    const person = await makePerson();
    const chan = await makeChannel("D");

    await createAlias(person.id, "Ariel", false, false, "MANUAL", null, [chan.id]);
    const mila = await createAlias(person.id, "Mila", false, false, "MANUAL", null, [chan.id]);

    const milaLink = await prisma.personAliasChannel.findUniqueOrThrow({
      where: { aliasId_channelId: { aliasId: mila.id, channelId: chan.id } },
    });
    expect(milaLink.isPrimary).toBe(false);
  });
});

describe("mergeAliases re-points pins", () => {
  it("re-points SetCreditRaw.resolvedAliasId from source to target before deleting source", async () => {
    const person = await makePerson();
    const target = await createAlias(person.id, "Canonical", false, false, "MANUAL", null, []);
    const source = await createAlias(person.id, "Duplicate", false, false, "MANUAL", null, []);

    const set = await prisma.set.create({ data: { type: "photo", title: `${NAME_PREFIX}set` } });
    const credit = await prisma.setCreditRaw.create({
      data: { setId: set.id, rawName: "Duplicate", resolvedAliasId: source.id },
    });

    await mergeAliases(target.id, [source.id]);

    const reloaded = await prisma.setCreditRaw.findUniqueOrThrow({ where: { id: credit.id } });
    expect(reloaded.resolvedAliasId).toBe(target.id);
    expect(await prisma.personAlias.findUnique({ where: { id: source.id } })).toBeNull();
  });
});
