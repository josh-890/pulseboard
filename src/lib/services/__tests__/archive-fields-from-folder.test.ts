import { describe, expect, it } from "vitest";
import { archiveFieldsFromFolder } from "@/lib/services/archive-service";

// What a link says about its folder the moment it is made.
//
// The develop paths recorded PENDING — "a path was noted, nobody has looked at
// it" — for a folder the scan had already counted. On the set page that shows as
// a blue "Pending" beside the word Archive, which reads as "this link is not
// confirmed yet", while no confirm button exists, because the link *is*
// confirmed. Found on "Exploring Myself Color": developed from its own folder,
// 105 files counted, displayed as pending until a targeted scan happened to run.
//
// An ArchiveFolder row exists because a scan made it (`scannedAt` is
// non-nullable), so linking to one is never pending.

const folder = {
  relativePath: "KC-KatyaClover\\2013\\2013-12-23-KC Katya - Exploring Myself Color",
  fullPath: "I:\\Sites\\KC-KatyaClover\\2013\\2013-12-23-KC Katya - Exploring Myself Color",
  fileCount: 105,
  videoPresent: null,
  missingOnDisk: false,
};

describe("archiveFieldsFromFolder", () => {
  it("reports what the scan established, not PENDING", () => {
    expect(archiveFieldsFromFolder(folder)).toEqual({
      archivePath: folder.relativePath,
      archiveStatus: "OK",
      archiveFileCount: 105,
      archiveVideoPresent: null,
    });
  });

  it("falls back to the full path when no configured root matched", () => {
    const { archivePath } = archiveFieldsFromFolder({ ...folder, relativePath: null });
    expect(archivePath).toBe(folder.fullPath);
  });

  // Confirming the link does not put the folder back on disk.
  it("keeps saying MISSING for a folder the last scan could not find", () => {
    expect(archiveFieldsFromFolder({ ...folder, missingOnDisk: true }).archiveStatus).toBe("MISSING");
  });

  it("carries the video flag through for videosets", () => {
    expect(archiveFieldsFromFolder({ ...folder, videoPresent: true }).archiveVideoPresent).toBe(true);
  });
});
