import { describe, expect, it, vi } from "vitest";
import { buildArchivePathEntry } from "@/lib/services/archive-service";

// Reconstruct a full path the way getArchivePaths' injected toFullPath does,
// using a single fixed photo/video root.
const toFullPath = (relativePath: string, isVideo: boolean): string | null => {
  const root = isVideo ? "i:\\VSites" : "i:\\Sites";
  return `${root}\\${relativePath}`;
};

const folder = {
  isVideo: false,
  folderName: "2005-08-28-MA Anna Y - Bonjour",
  relativePath: "MA-MetArt\\2005\\2005-08-28-MA Anna Y - Bonjour",
  fullPath: "I:\\Sites\\MA-MetArt\\2005\\2005-08-28-MA Anna Y - Bonjour",
};

describe("buildArchivePathEntry", () => {
  it("uses the link's own archivePath when present", () => {
    const entry = buildArchivePathEntry(
      { id: "l1", archivePath: folder.relativePath, archiveVideoFilename: null, archiveFolder: folder },
      toFullPath,
    );
    expect(entry).toEqual({
      archiveLinkId: "l1",
      path: "i:\\Sites\\MA-MetArt\\2005\\2005-08-28-MA Anna Y - Bonjour",
      isVideo: false,
      folderName: "2005-08-28-MA Anna Y - Bonjour",
      confirmedVideoFilename: null,
    });
  });

  it("falls back to the folder's relativePath when the link path is null (legacy pre-c20bf61 link)", () => {
    const entry = buildArchivePathEntry(
      { id: "l2", archivePath: null, archiveVideoFilename: null, archiveFolder: folder },
      toFullPath,
    );
    expect(entry?.path).toBe("i:\\Sites\\MA-MetArt\\2005\\2005-08-28-MA Anna Y - Bonjour");
    expect(entry?.folderName).toBe("2005-08-28-MA Anna Y - Bonjour");
  });

  it("falls back to the folder's absolute fullPath when no relative path exists on either side", () => {
    const entry = buildArchivePathEntry(
      {
        id: "l3",
        archivePath: null,
        archiveVideoFilename: null,
        archiveFolder: { ...folder, relativePath: null },
      },
      toFullPath,
    );
    expect(entry?.path).toBe("I:\\Sites\\MA-MetArt\\2005\\2005-08-28-MA Anna Y - Bonjour");
    expect(entry?.folderName).toBe("2005-08-28-MA Anna Y - Bonjour");
  });

  it("returns null when a relative path exists but no root is configured", () => {
    const noRoot = vi.fn().mockReturnValue(null);
    const entry = buildArchivePathEntry(
      { id: "l4", archivePath: folder.relativePath, archiveVideoFilename: null, archiveFolder: folder },
      noRoot,
    );
    expect(entry).toBeNull();
    expect(noRoot).toHaveBeenCalledWith(folder.relativePath, false);
  });

  it("returns null when neither a relative path nor a fullPath is available", () => {
    const entry = buildArchivePathEntry(
      {
        id: "l5",
        archivePath: null,
        archiveVideoFilename: null,
        archiveFolder: { ...folder, relativePath: null, fullPath: "" },
      },
      toFullPath,
    );
    expect(entry).toBeNull();
  });

  it("carries through a confirmed video filename for videosets", () => {
    const videoFolder = { ...folder, isVideo: true };
    const entry = buildArchivePathEntry(
      { id: "l6", archivePath: folder.relativePath, archiveVideoFilename: "clip.mp4", archiveFolder: videoFolder },
      toFullPath,
    );
    expect(entry?.isVideo).toBe(true);
    expect(entry?.path).toBe("i:\\VSites\\MA-MetArt\\2005\\2005-08-28-MA Anna Y - Bonjour");
    expect(entry?.confirmedVideoFilename).toBe("clip.mp4");
  });
});
