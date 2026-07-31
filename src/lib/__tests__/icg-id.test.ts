import { describe, expect, it } from "vitest";
import {
  ICG_ID_EXTERNAL_RE,
  ICG_ID_LOCAL_RE,
  ICG_ID_RE,
  icgIdPrefix,
  isSelfAssignedIcgId,
  mintLocalIcgIdCandidate,
} from "@/lib/icg-id";

// Real values from the production data, used to pin the external shape.
const REAL_EXTERNAL_IDS = [
  "CX-82HO",   // Corinna, b. 1982 — no surname, so 'X'
  "AY-006S",   // Anna Y — unknown birth year at mint time
  "CR-00KI7",  // Calista Roxxx
  "JJ-00G8T",  // Jasmine Jazz
  "AX-0025",   // Anna-Leah — single hyphenated word
  "NX-0073W",  // Nikoleta — 4-char suffix
  "NK-67112",
];

// The three self-assigned IDs already in the production data, minted by the
// original client-side generator. They are canonical — same shape the minter
// still produces — so nothing about them needs migrating.
const LEGACY_LOCAL_IDS = ["NX-86@7C0", "GP-72@F5D", "MB-79@E76"];

describe("icgIdPrefix", () => {
  it("takes the initials of the first two words plus the birth-year digits", () => {
    expect(icgIdPrefix("Jane Doe", "1996-03-14")).toBe("JD-96");
    expect(icgIdPrefix("Anna Y", "1986-01-01")).toBe("AY-86");
  });

  it("substitutes X for a missing second word", () => {
    expect(icgIdPrefix("Corinna", "1982-03-01")).toBe("CX-82");
    // A hyphenated name is one word — matches AX-0025 (Anna-Leah).
    expect(icgIdPrefix("Anna-Leah", "1985-02-01")).toBe("AX-85");
  });

  it("uses the 00 sentinel when the birth year is unknown or unusable", () => {
    expect(icgIdPrefix("Cali Kayden")).toBe("CK-00");
    expect(icgIdPrefix("Cali Kayden", "")).toBe("CK-00");
    expect(icgIdPrefix("Cali Kayden", "not-a-date")).toBe("CK-00");
  });

  it("folds accents to ASCII so the result stays inside the ID alphabet", () => {
    // The old client-side generator uppercased without folding and produced
    // "ÖI-…", which the validation regex then rejected.
    expect(icgIdPrefix("Ölga Ivanova", "1990-05-05")).toBe("OI-90");
    expect(icgIdPrefix("Éva Ćurić", "2001-01-01")).toBe("EC-01");
  });

  it("falls back to X for a word with no letters at all", () => {
    expect(icgIdPrefix("!!! ???", "1990-01-01")).toBe("XX-90");
    expect(icgIdPrefix("", "1990-01-01")).toBe("XX-90");
  });

  it("always yields a prefix that can complete into a valid local ID", () => {
    for (const name of ["Jane Doe", "Corinna", "Ölga Ivanova", "!!!", ""]) {
      expect(mintLocalIcgIdCandidate(icgIdPrefix(name))).toMatch(ICG_ID_LOCAL_RE);
    }
  });
});

describe("ICG_ID_EXTERNAL_RE", () => {
  it("accepts every real external ID", () => {
    for (const id of REAL_EXTERNAL_IDS) expect(id).toMatch(ICG_ID_EXTERNAL_RE);
  });

  it("rejects the reserved marker anywhere in the ID", () => {
    // This rejection is what keeps the two namespaces disjoint, and therefore
    // what makes the derived self-assigned filter trustworthy.
    expect("JD-95@K7R").not.toMatch(ICG_ID_EXTERNAL_RE);
    for (const id of LEGACY_LOCAL_IDS) expect(id).not.toMatch(ICG_ID_EXTERNAL_RE);
  });

  it("rejects malformed shapes", () => {
    expect("J-95ABC").not.toMatch(ICG_ID_EXTERNAL_RE);   // one prefix letter
    expect("JD95ABC").not.toMatch(ICG_ID_EXTERNAL_RE);   // no separator
    expect("JD-9ABC").not.toMatch(ICG_ID_EXTERNAL_RE);   // one year digit
    expect("JD-95A").not.toMatch(ICG_ID_EXTERNAL_RE);    // suffix too short
    expect("JD-95ABCDE").not.toMatch(ICG_ID_EXTERNAL_RE); // suffix too long
    expect("jd-95abc").not.toMatch(ICG_ID_EXTERNAL_RE);  // lowercase
  });
});

describe("ICG_ID_LOCAL_RE", () => {
  it("accepts what the minter produces", () => {
    for (let i = 0; i < 50; i++) {
      expect(mintLocalIcgIdCandidate("JD-95")).toMatch(ICG_ID_LOCAL_RE);
    }
  });

  it("accepts the self-assigned IDs already in production", () => {
    for (const id of LEGACY_LOCAL_IDS) expect(id).toMatch(ICG_ID_LOCAL_RE);
  });

  it("rejects the marker at any other offset", () => {
    expect("JD-95K@7R").not.toMatch(ICG_ID_LOCAL_RE);
    expect("JD@95-K7R").not.toMatch(ICG_ID_LOCAL_RE);
    expect("JD-95K7R@").not.toMatch(ICG_ID_LOCAL_RE);
  });

  it("rejects external IDs", () => {
    for (const id of REAL_EXTERNAL_IDS) expect(id).not.toMatch(ICG_ID_LOCAL_RE);
  });
});

describe("ICG_ID_RE", () => {
  it("accepts both namespaces, including legacy local values", () => {
    for (const id of [...REAL_EXTERNAL_IDS, ...LEGACY_LOCAL_IDS, "JD-95@K7R"]) {
      expect(id).toMatch(ICG_ID_RE);
    }
  });
});

describe("isSelfAssignedIcgId", () => {
  it("is true for minted and for legacy local IDs", () => {
    expect(isSelfAssignedIcgId(mintLocalIcgIdCandidate("JD-95"))).toBe(true);
    for (const id of LEGACY_LOCAL_IDS) expect(isSelfAssignedIcgId(id)).toBe(true);
  });

  it("is false for every external ID", () => {
    for (const id of REAL_EXTERNAL_IDS) expect(isSelfAssignedIcgId(id)).toBe(false);
  });
});

describe("mintLocalIcgIdCandidate", () => {
  it("keeps the prefix and varies the suffix", () => {
    const candidates = new Set(
      Array.from({ length: 200 }, () => mintLocalIcgIdCandidate("JD-95")),
    );
    for (const c of candidates) expect(c.startsWith("JD-95@")).toBe(true);
    // Random over 36^3; 200 draws collapsing to a handful would mean the
    // suffix isn't actually varying.
    expect(candidates.size).toBeGreaterThan(150);
  });
});
