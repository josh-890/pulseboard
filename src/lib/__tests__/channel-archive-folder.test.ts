import { describe, expect, it } from "vitest";
import { channelArchiveFolder } from "@/lib/utils";

describe("channelArchiveFolder", () => {
  it("follows the archive's norm SHORT-Channelname, dropping spaces and dashes from the name", () => {
    expect(channelArchiveFolder("TLE", "The Life Erotic")).toBe("TLE-TheLifeErotic");
    expect(channelArchiveFolder("ARTL", "Art-Lingerie")).toBe("ARTL-ArtLingerie");
    expect(channelArchiveFolder(" SB ", "ShowyBeauty")).toBe("SB-ShowyBeauty");
    expect(channelArchiveFolder("", "ShowyBeauty")).toBe("");
    expect(channelArchiveFolder("SB", "")).toBe("");
  });
});
