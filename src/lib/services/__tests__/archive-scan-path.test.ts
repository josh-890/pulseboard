import { describe, expect, it, vi } from "vitest";
import { buildArchivePathEntry } from "@/lib/services/archive-service";

// Reconstruct a full path the way getArchivePaths' injected toFullPath does,
// using a single fixed photo/video root (the first configured root).
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
  it("uses the folder's absolute fullPath as the verify path", () => {
    const spy = vi.fn(toFullPath);
    const entry = buildArchivePathEntry(
      { id: "l1", archivePath: folder.relativePath, archiveVideoFilename: null, archiveFolder: folder },
      spy,
    );
    expect(entry).toEqual({
      archiveLinkId: "l1",
      path: "I:\\Sites\\MA-MetArt\\2005\\2005-08-28-MA Anna Y - Bonjour",
      isVideo: false,
      folderName: "2005-08-28-MA Anna Y - Bonjour",
      confirmedVideoFilename: null,
    });
    // fullPath is authoritative — no root reconstruction needed.
    expect(spy).not.toHaveBeenCalled();
  });

  it("is multi-root correct: a folder under a non-first root keeps its own absolute path", () => {
    // toFullPath only knows the first root (i:\Sites), but this folder lives under
    // a second root (E:\Archive). Reconstructing from the relative path would point
    // at the wrong root; preferring fullPath avoids that false 'missing'.
    const secondRootFolder = {
      ...folder,
      fullPath: "E:\\Archive\\MA-MetArt\\2005\\2005-08-28-MA Anna Y - Bonjour",
    };
    const entry = buildArchivePathEntry(
      { id: "l2", archivePath: folder.relativePath, archiveVideoFilename: null, archiveFolder: secondRootFolder },
      toFullPath,
    );
    expect(entry?.path).toBe("E:\\Archive\\MA-MetArt\\2005\\2005-08-28-MA Anna Y - Bonjour");
  });

  it("falls back to relative reconstruction when fullPath is absent", () => {
    const entry = buildArchivePathEntry(
      {
        id: "l3",
        archivePath: folder.relativePath,
        archiveVideoFilename: null,
        archiveFolder: { ...folder, fullPath: "" },
      },
      toFullPath,
    );
    expect(entry?.path).toBe("i:\\Sites\\MA-MetArt\\2005\\2005-08-28-MA Anna Y - Bonjour");
    expect(entry?.folderName).toBe("2005-08-28-MA Anna Y - Bonjour");
  });

  it("falls back to the folder's relativePath when fullPath and link path are both absent (legacy pre-c20bf61 link)", () => {
    const entry = buildArchivePathEntry(
      {
        id: "l4",
        archivePath: null,
        archiveVideoFilename: null,
        archiveFolder: { ...folder, fullPath: "" },
      },
      toFullPath,
    );
    expect(entry?.path).toBe("i:\\Sites\\MA-MetArt\\2005\\2005-08-28-MA Anna Y - Bonjour");
  });

  it("returns null when fullPath is absent and no root is configured", () => {
    const noRoot = vi.fn().mockReturnValue(null);
    const entry = buildArchivePathEntry(
      {
        id: "l5",
        archivePath: folder.relativePath,
        archiveVideoFilename: null,
        archiveFolder: { ...folder, fullPath: "" },
      },
      noRoot,
    );
    expect(entry).toBeNull();
    expect(noRoot).toHaveBeenCalledWith(folder.relativePath, false);
  });

  it("returns null when neither a fullPath nor any relative path is available", () => {
    const entry = buildArchivePathEntry(
      {
        id: "l6",
        archivePath: null,
        archiveVideoFilename: null,
        archiveFolder: { ...folder, fullPath: "", relativePath: null },
      },
      toFullPath,
    );
    expect(entry).toBeNull();
  });

  it("carries through isVideo and a confirmed video filename for videosets", () => {
    const videoFolder = {
      ...folder,
      isVideo: true,
      fullPath: "M:\\VSites\\MA-MetArt\\2005\\2005-08-28-MA Anna Y - Bonjour",
    };
    const entry = buildArchivePathEntry(
      { id: "l7", archivePath: folder.relativePath, archiveVideoFilename: "clip.mp4", archiveFolder: videoFolder },
      toFullPath,
    );
    expect(entry?.isVideo).toBe(true);
    expect(entry?.path).toBe("M:\\VSites\\MA-MetArt\\2005\\2005-08-28-MA Anna Y - Bonjour");
    expect(entry?.confirmedVideoFilename).toBe("clip.mp4");
  });
});
