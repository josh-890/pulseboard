import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildInventory,
  headerPollution,
  imageStructureProblem,
  inCoverSample,
  inspectFolder,
  looksMangled,
  selectPortrait,
  type FolderInput,
  type InventoryContext,
} from "@/lib/services/catalogue-inventory";

// The inventory decides go/no-go on the catalogue (ADR-0038), so the sorting
// behind its numbers is tested rather than trusted. The base file is a real
// catalogue import file (docs/), changed only where a case needs it.
const ANNA = readFileSync(path.join(process.cwd(), "docs", "2026-02-22_Anna_Y_(AY-006S)"), "utf8");
const ANNA_FILE = "2026-02-22_Anna_Y_(AY-006S)";

function folder(over: Partial<FolderInput> = {}): FolderInput {
  return {
    path: "A\\Anna_Y_(AY-006S)",
    dirName: "Anna_Y_(AY-006S)",
    importFiles: [{ name: ANNA_FILE, content: ANNA }],
    metaImages: [{ name: "Anna_Y_(AY-006S).jpg", size: 20_000 }],
    personImages: [],
    covers: 0,
    coverChecks: [],
    ...over,
  };
}

const codes = (f: FolderInput) => inspectFolder(f).problems.map((p) => p.code);

const context = (over: Partial<InventoryContext> = {}): InventoryContext => ({
  persons: [],
  contacts: [],
  avatars: [],
  staged: { open: 0, noCast: 0, waiting: [] },
  size: { databaseBytes: 1_000_000, contactBytes: 0, contactRows: 0, avatarRows: 0 },
  ...over,
});

describe("one folder", () => {
  it("a clean folder becomes an identity with its sets and channel aliases", () => {
    const r = inspectFolder(folder());
    expect(r.problems).toEqual([]);
    expect(r).toMatchObject({ icgId: "AY-006S", name: "Anna Y", setIds: ["13850"], aliases: ["METART|Anna Y"] });
    expect(r.portrait).toEqual({ kind: "keyed", file: "Anna_Y_(AY-006S).jpg" });
  });

  it("Q1 — no import file", () => {
    expect(codes(folder({ importFiles: [] }))).toContain("Q1");
    expect(inspectFolder(folder({ importFiles: [{ name: "notes", content: "x" }] })).problems[0]).toMatchObject({
      code: "Q1",
      detail: expect.stringContaining("notes"),
    });
  });

  it("Q2 — unreadable, empty, or nothing recognisable", () => {
    expect(codes(folder({ importFiles: [{ name: ANNA_FILE, content: null, readError: "EACCES" }] }))).toContain("Q2");
    expect(codes(folder({ importFiles: [{ name: ANNA_FILE, content: "  \r\n" }] }))).toContain("Q2");
    expect(codes(folder({ importFiles: [{ name: ANNA_FILE, content: "just some text\r\n" }] }))).toContain("Q2");
  });

  it("Q3 — the file's ICG-ID is missing or malformed: no identity", () => {
    const polluted = ANNA.replace("ICGID       : AY-006S", 'ICGID       : AY-006S" class="model-title">');
    const r = inspectFolder(folder({ importFiles: [{ name: ANNA_FILE, content: polluted }] }));
    expect(r.problems[0]).toMatchObject({ code: "Q3", line: 5 });
    expect(r.icgId).toBeNull();
  });

  it("Q4 — folder, file name and file must agree", () => {
    expect(codes(folder({ dirName: "Anna_Y_(AY-006X)" }))).toContain("Q4");
    expect(codes(folder({ importFiles: [{ name: "2026-02-22_Anna_Y_(AY-007S)", content: ANNA }] }))).toContain("Q4");
    expect(codes(folder({ dirName: "Anna Y" }))).toContain("Q4");
  });

  it("F1 — HTML or repeated keys in the header; the identity is still taken", () => {
    const content = ANNA.replace("Tattoos     : —", 'Tattoos     : <a href="x">\r\nICGID: MB-003G" class="model-title">');
    const r = inspectFolder(folder({ importFiles: [{ name: ANNA_FILE, content }] }));
    expect(r.icgId).toBe("AY-006S");
    expect(r.problems.map((p) => p.code)).toEqual(["F1"]);
  });

  it("F2 — a biography claiming far more sets than the file lists", () => {
    const content = ANNA.replace("1 covers, 1 photosets", "40 covers, 40 photosets");
    expect(codes(folder({ importFiles: [{ name: ANNA_FILE, content }] }))).toEqual(["F2"]);
  });

  it("F3 — broken special characters in the name", () => {
    expect(looksMangled("Ren�e")).toBe(true);
    expect(looksMangled("RenÃ©e")).toBe(true);
    expect(looksMangled("Renée")).toBe(false);
    const content = ANNA.replace("Name (extrahiert): Anna Y", "Name (extrahiert): Anna ?");
    expect(codes(folder({ importFiles: [{ name: ANNA_FILE, content }] }))).toEqual(["F3"]);
  });

  it("F6 — the newest file wins, older ones fill gaps and are reported", () => {
    const newest = ANNA.slice(0, ANNA.indexOf("Titeltxt"));
    const r = inspectFolder(
      folder({
        importFiles: [
          { name: ANNA_FILE, content: newest },
          { name: "2025-01-01_Anna_Y_(AY-006S)", content: ANNA },
        ],
      }),
    );
    expect(r.newestFile).toBe(ANNA_FILE);
    expect(r.setIds).toEqual(["13850"]);
    expect(r.problems.find((p) => p.code === "F6")?.detail).toContain("1 set(s)");
  });

  it("F4 and F5 — portrait and sampled covers", () => {
    expect(codes(folder({ metaImages: [] }))).toEqual(["F4"]);
    expect(codes(folder({ coverChecks: [{ file: "_meta\\_Cover\\x.jpg", problem: "JPEG cut off" }] }))).toEqual(["F5"]);
  });
});

describe("portrait selection (catalogue-avatar.ps1 rules)", () => {
  it("keyed beats unnamed, the smaller keyed one wins, never a guess between unnamed", () => {
    const keyed = [
      { name: "A_(AY-006S).jpg", size: 90 },
      { name: "A_(AY-006S)_thumb.jpg", size: 10 },
      { name: "other.jpg", size: 5 },
    ];
    expect(selectPortrait([keyed], "AY-006S")).toEqual({ kind: "keyed", file: "A_(AY-006S)_thumb.jpg" });
    expect(selectPortrait([[{ name: "x.jpg", size: 1 }]], "AY-006S")).toEqual({ kind: "single", file: "x.jpg" });
    expect(selectPortrait([[{ name: "x.jpg", size: 1 }, { name: "y.jpg", size: 1 }], []], "AY-006S").kind).toBe("ambiguous");
    expect(selectPortrait([[], [{ name: "p.jpg", size: 1 }]], "AY-006S")).toEqual({ kind: "single", file: "p.jpg" });
    expect(selectPortrait([[], []], "AY-006S")).toEqual({ kind: "missing" });
  });
});

describe("image structure", () => {
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9]);
  it("accepts a sound JPEG and names the damage otherwise", () => {
    expect(imageStructureProblem(jpeg)).toBeNull();
    expect(imageStructureProblem(jpeg.subarray(0, jpeg.length - 2))).toMatch(/no end marker/);
    expect(imageStructureProblem(jpeg.subarray(0, 5))).toMatch(/cut off/);
    expect(imageStructureProblem(new Uint8Array())).toBe("empty file");
    expect(imageStructureProblem(Uint8Array.from([1, 2, 3, 4]))).toMatch(/not an image/);
  });

  it("samples about 5 % of covers, the same ones every run", () => {
    const files = Array.from({ length: 4000 }, (_, i) => `P_(XX-00${i})\\_meta\\_Cover\\${i}.jpg`);
    const picked = files.filter(inCoverSample);
    expect(picked.length).toBeGreaterThan(120);
    expect(picked.length).toBeLessThan(280);
    expect(files.filter(inCoverSample)).toEqual(picked);
  });
});

describe("header pollution", () => {
  it("is null for a clean header", () => {
    expect(headerPollution(ANNA)).toBeNull();
  });
});

describe("the aggregate", () => {
  const anna = inspectFolder(folder());
  const twin = inspectFolder(folder({ path: "A\\Anna_Y_2_(AY-006S)", dirName: "Anna_Y_2_(AY-006S)", metaImages: [] }));
  const callie = inspectFolder(folder({ path: "C\\C_(CX-00BZ)", dirName: "C_(CX-00BZ)" }));

  it("Q5 — the same ICG-ID in two folders quarantines both; quarantined folders list only why", () => {
    const inv = buildInventory([anna, twin], null, null);
    expect(inv.records.map((r) => r.problems.map((p) => p.code))).toEqual([["Q5"], ["Q5"]]);
    expect(inv.health).toMatchObject({ quarantined: 2, clean: 0 });
    expect(inv.noGo.quarantine).toBe(true);
  });

  it("overlap: a Person is a hint, a Contact is enriched, an ignored one stays ignored", () => {
    const inv = buildInventory([anna], context({ persons: ["AY-006S"] }), null);
    expect(inv.overlap).toEqual({ I1: 1, I2: 0, I3: 0, I4: 0 });
    expect(inv.cost.newContacts).toBe(0);
    expect(buildInventory([anna], context({ contacts: [{ icgId: "AY-006S", ignored: true, hasThumb: false }] }), null).overlap?.I3).toBe(1);
    const fresh = buildInventory([anna, callie], context(), null);
    expect(fresh.overlap?.I4).toBe(1);
    expect(fresh.health).toMatchObject({ clean: 1, quarantined: 1 });
    expect(fresh.noGo.quarantine).toBe(true);
  });

  it("payoff: a staged set waits on non-Persons; the catalogue makes them recognisable", () => {
    const inv = buildInventory(
      [anna, callie],
      context({
        persons: ["MB-003G"],
        contacts: [{ icgId: "AY-006S", ignored: false, hasThumb: false }],
        staged: {
          open: 5,
          noCast: 1,
          waiting: [
            { id: "s1", title: "Bonjour", nonPersons: ["AY-006S"] },
            { id: "s2", title: "X", nonPersons: ["AY-006S", "ZZ-00ZZ"] },
          ],
        },
      }),
      null,
    );
    expect(inv.staged).toMatchObject({
      open: 5,
      noCast: 1,
      readyToday: 2,
      waiting: 2,
      nonPersonMembers: 2,
      recognisable: 1,
      withFace: 1,
      setsUnblocked: 1,
    });
    expect(inv.staged?.sets[1]).toMatchObject({ recognisable: ["AY-006S"], missing: ["ZZ-00ZZ"] });
  });

  it("payoff: a recognisable member whose portrait the app refused has no face", () => {
    const inv = buildInventory(
      [anna],
      context({
        avatars: [{ icgId: "AY-006S", ok: false, error: "bad" }],
        staged: { open: 1, noCast: 0, waiting: [{ id: "s1", title: "B", nonPersons: ["AY-006S"] }] },
      }),
      null,
    );
    expect(inv.staged).toMatchObject({ recognisable: 1, withFace: 0, setsUnblocked: 1 });
  });

  it("payoff: an orphan folder token gets a catalogue name; one the app already has is not counted", () => {
    const inv = buildInventory(
      [anna],
      null,
      {
        orphans: [
          { archiveKey: "k1", folderName: "2005-08-28-MA Anna Y - Bonjour", aliasToken: "Anna Y" },
          { archiveKey: "k2", folderName: "2005-08-28-MA Lena - X", aliasToken: "Lena" },
          { archiveKey: "k3", folderName: "nothing", aliasToken: null },
        ],
        aliases: [{ nameNorm: "lena", icgId: "LX-00AA" }],
      },
    );
    expect(inv.archive).toMatchObject({ orphans: 3, withToken: 2, knownToday: 1, gainName: 1, ambiguous: 0 });
  });

  it("a portrait the app refused is flagged F4", () => {
    const inv = buildInventory([anna], context({ avatars: [{ icgId: "AY-006S", ok: false, error: "VipsJpeg: premature end" }] }), null);
    expect(inv.records[0].problems).toEqual([expect.objectContaining({ code: "F4", detail: expect.stringContaining("premature end") })]);
    expect(inv.portraits).toMatchObject({ found: 1, refused: 1 });
  });
});
