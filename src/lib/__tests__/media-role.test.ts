import { describe, expect, it } from "vitest";
import { isCoverArtFilename, isPhotoItem } from "@/lib/media-role";
import { redundantArtCopies } from "@/lib/services/cover-art-service";

// Cover art vs photo (ADR-0040)
describe("isCoverArtFilename — the cover agent's rule", () => {
  it.each([
    "2017-02-21-SA Cara Mell - Encara-c.jpg",
    "2021-09-30-MA Cara Mell - Towards You-c.JPG",
    "2007-03-16-MPL Nata & Alisa - Winter Angels - c.jpg",
    "Title_c.webp",
    "c.png",
    "MetArt - Elle D - Pamilya (19 Dec 2013)-c.jpeg",
  ])("%s is cover art", (name) => expect(isCoverArtFilename(name)).toBe(true));

  it.each(["Jasmine - Music - 054.jpg", "Monaco.jpg", "abc.jpg", "cover.jpg", "Title-c.gif", "Title-cc.jpg", "Title-c.jpg.txt"])(
    "%s is not",
    (name) => expect(isCoverArtFilename(name)).toBe(false),
  );
});

describe("isPhotoItem", () => {
  it("a photo, or cover art let into the photos", () => {
    expect(isPhotoItem({ role: "PHOTO", artInPhotos: false })).toBe(true);
    expect(isPhotoItem({ role: "COVER_ART", artInPhotos: false })).toBe(false);
    expect(isPhotoItem({ role: "COVER_ART", artInPhotos: true })).toBe(true);
  });
});

describe("redundantArtCopies", () => {
  const f = (id: string, phash: string | null, w: number, h = w) => ({ id, phash, originalWidth: w, originalHeight: h });
  const kept = f("new", "0000000000000000", 2000);

  it("a near copy with no more pixels goes", () => {
    expect(redundantArtCopies(kept, [f("standin", "000000000000003f", 512)])).toEqual(["standin"]); // 6 bits
  });
  it("seven bits apart is another picture", () => {
    expect(redundantArtCopies(kept, [f("other", "000000000000007f", 512)])).toEqual([]);
  });
  it("a larger copy stays (the arrival never deletes something better than itself)", () => {
    expect(redundantArtCopies(kept, [f("bigger", "0000000000000000", 3000)])).toEqual([]);
  });
  it("no hash, no verdict", () => {
    expect(redundantArtCopies(f("x", null, 2000), [f("a", "0000000000000000", 1)])).toEqual([]);
    expect(redundantArtCopies(kept, [f("a", null, 1)])).toEqual([]);
  });
  it("never itself", () => {
    expect(redundantArtCopies(kept, [kept])).toEqual([]);
  });
});
