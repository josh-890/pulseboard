import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  buildContactSearchNorm,
  getContactDetail,
  renameContact,
  setContactPortrait,
  upsertImportedContact,
} from "@/lib/services/contact-service";
import { getContactsPage } from "@/lib/services/relationship-service";

// ADR-0038, S2: one name rule for Contacts, one search key, the Contact page's data.
// Runs against the DEV database (vitest.config.ts loads .env); throwaway data is
// prefixed and wiped in afterEach.

const ICG = (n: string) => `ZZ-95@${n}`;

afterEach(async () => {
  await prisma.catalogueSet.deleteMany({ where: { coverId: { startsWith: "CST-TEST" } } });
  await prisma.contact.deleteMany({ where: { icgId: { startsWith: "ZZ-95@" } } });
  await prisma.channel.deleteMany({ where: { name: { startsWith: "CST-TEST" } } });
});

describe("the name rule", () => {
  it("a thin Contact takes the latest import's spelling, as before", async () => {
    const { id } = await upsertImportedContact(prisma, { icgId: ICG("AAA"), name: "Anna" });
    await upsertImportedContact(prisma, { icgId: ICG("AAA"), name: "Anna Y" });
    const c = await prisma.contact.findUniqueOrThrow({ where: { id } });
    expect(c.name).toBe("Anna Y");
    expect(c.searchNorm).toBe("anna y zz-95@aaa");
  });

  it("her own catalogue name stays — another file's spelling does not rename her", async () => {
    const { id } = await upsertImportedContact(prisma, { icgId: ICG("BBB"), name: "Bella" });
    await prisma.contact.update({ where: { id }, data: { catalogueName: "Bella", name: "Bella" } });
    await upsertImportedContact(prisma, { icgId: ICG("BBB"), name: "Bella B" });
    expect((await prisma.contact.findUniqueOrThrow({ where: { id } })).name).toBe("Bella");
  });

  it("a rename sticks against imports; going back takes the catalogue name", async () => {
    const { id } = await upsertImportedContact(prisma, { icgId: ICG("CCC"), name: "Cleo" });
    await prisma.contact.update({ where: { id }, data: { catalogueName: "Cleo C" } });
    await renameContact(id, "Cleo (blonde)");
    await upsertImportedContact(prisma, { icgId: ICG("CCC"), name: "Cleo X" });
    let c = await prisma.contact.findUniqueOrThrow({ where: { id } });
    expect(c).toMatchObject({ name: "Cleo (blonde)", nameSetByUser: true });
    expect(c.searchNorm).toContain("cleo (blonde)");

    await renameContact(id, null);
    c = await prisma.contact.findUniqueOrThrow({ where: { id } });
    expect(c).toMatchObject({ name: "Cleo C", nameSetByUser: false });
  });

  it("going back without a catalogue name is refused", async () => {
    const { id } = await upsertImportedContact(prisma, { icgId: ICG("DDD"), name: "Dana" });
    await expect(renameContact(id, null)).rejects.toThrow(/catalogue name/);
  });
});

describe("search", () => {
  it("the key holds name, catalogue name, AKA, channel aliases and ICG-ID, once each", () => {
    expect(
      buildContactSearchNorm({ name: "Renée", catalogueName: "Renée", aka: ["Nina"], aliases: ["Renee A"], icgId: "RX-00AB" }),
    ).toBe("renee nina renee a rx-00ab");
  });

  it("the register finds a Contact by a channel alias", async () => {
    const { id } = await upsertImportedContact(prisma, { icgId: ICG("EEE"), name: "Eva" });
    await prisma.contact.update({
      where: { id },
      data: { searchNorm: buildContactSearchNorm({ name: "Eva", aliases: ["Evita Lux"], icgId: ICG("EEE") }) },
    });
    const page = await getContactsPage({ q: "evita lux" });
    expect(page.rows.map((r) => r.id)).toContain(id);
  });
});

describe("the Contact page", () => {
  it("marks catalogue sets and links channel names through import aliases only", async () => {
    const icg = ICG("FFF");
    const { id } = await upsertImportedContact(prisma, { icgId: icg, name: "Fay" });
    const linked = await prisma.channel.create({
      data: { name: "CST-TEST Linked", nameNorm: "cst-test linked", importAliases: ["CST-TEST LINKED"] },
    });
    await prisma.channel.create({ data: { name: "CST-TEST Unlinked", nameNorm: "cst-test unlinked" } });
    await prisma.contactChannelAlias.createMany({
      data: [
        { contactId: id, channelName: "CST-TEST LINKED", alias: "Fay", aliasNorm: "fay" },
        { contactId: id, channelName: "CST-TEST UNLINKED", alias: "Fay F", aliasNorm: "fay f" },
      ],
    });
    await prisma.catalogueSet.createMany({
      data: [
        { coverId: "CST-TEST-1", date: new Date("2020-01-02"), channelName: "CST-TEST LINKED", title: "Morning", castIcgIds: [icg] },
        { coverId: "CST-TEST-2", date: null, channelName: "CST-TEST UNLINKED", title: "Evening", castIcgIds: [icg, ICG("GGG")] },
      ],
    });

    const d = (await getContactDetail(id))!;
    expect(d.catalogueSetCount).toBe(2);
    expect(d.catalogueSets.map((s) => [s.coverId, s.inApp, s.inArchive])).toEqual([
      ["CST-TEST-1", null, false],
      ["CST-TEST-2", null, false],
    ]);
    expect(d.channelAliases.map((a) => [a.channelName, a.channel?.id ?? null])).toEqual([
      ["CST-TEST LINKED", linked.id],
      ["CST-TEST UNLINKED", null],
    ]);
  });
});

describe("portrait", () => {
  it("a damaged image is refused before anything is stored", async () => {
    const { id } = await upsertImportedContact(prisma, { icgId: ICG("HHH"), name: "Hana" });
    await expect(setContactPortrait(id, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0]))).rejects.toThrow();
    expect((await prisma.contact.findUniqueOrThrow({ where: { id } })).portraitKey).toBeNull();
  });
});
