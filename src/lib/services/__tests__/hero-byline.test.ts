import { describe, expect, it } from "vitest";
import { heroByline, type BylineCredit } from "@/lib/services/session-contributors";

const brand = { logoKey: null, markFont: null, markColor: null };
const credit = (over: Partial<BylineCredit> = {}): BylineCredit => ({
  artistId: "a1",
  artistName: "John Doe",
  rawName: "J. Doe",
  roleName: "Photographer",
  groupKind: "BEHIND_CAMERA",
  presence: "LEAD",
  brand,
  ...over,
});

describe("heroByline", () => {
  it("names a behind-camera lead by the resolved artist's name, with its mark", () => {
    expect(heroByline([credit()])).toEqual([{ artistId: "a1", name: "John Doe", roleName: "Photographer", brand }]);
  });

  it("leaves out on-camera credits and behind-camera support roles", () => {
    expect(
      heroByline([
        credit({ groupKind: "ON_CAMERA", artistId: null, artistName: null, rawName: "Anna" }),
        credit({ presence: "SUPPORT", artistId: "a2", artistName: "Makeup Mia" }),
      ]),
    ).toEqual([]);
  });

  it("leaves out ignored credits", () => {
    expect(heroByline([credit({ ignored: true })])).toEqual([]);
  });

  it("keeps an unresolved credit as its raw name, without a mark", () => {
    expect(heroByline([credit({ artistId: null, artistName: null, rawName: " Max Raw " })])).toEqual([
      { artistId: null, name: "Max Raw", roleName: "Photographer", brand: null },
    ]);
  });

  it("names an artist once, and a raw name once regardless of case — in credit order", () => {
    const out = heroByline([
      credit(),
      credit({ artistId: null, artistName: null, rawName: "Max Raw" }),
      credit({ rawName: "John" }),
      credit({ artistId: null, artistName: null, rawName: "max raw" }),
      credit({ artistId: "a3", artistName: "Zed" }),
    ]);
    expect(out.map((e) => e.name)).toEqual(["John Doe", "Max Raw", "Zed"]);
  });
});
