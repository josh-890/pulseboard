import { describe, expect, it } from "vitest";
import { isProvisionalCoverKey } from "@/lib/services/import/cover-transfer";

// Which transferred covers a later upload may displace.
//
// The first cut of this marked every transferred cover as a stand-in, on the
// belief that it is always a small copy of one of the set's own images. On xpulse
// that is true of none of them: all 435 came from the import, up to 1200 px, and
// the nearest set image is 14–19 bits away in dHash — a different photograph.
// Marking those provisional would have handed the cover to an arbitrary image on
// the next upload and lost the publisher's cover art.
//
// Only the thumbnail the app makes of a folder's own images is a stand-in, and
// the prefix is what tells them apart.

describe("isProvisionalCoverKey", () => {
  it("treats an archive thumbnail as a stand-in", () => {
    expect(
      isProvisionalCoverKey("archive/17b1d6b7-b2a7-4691-84bc-08fa174a99d1/cover-1785697187912.jpg"),
    ).toBe(true);
  });

  it("leaves a publisher cover from the import alone", () => {
    expect(isProvisionalCoverKey("staging/cmnp8dn5r002k01qb6kynvxhr/cover.jpg")).toBe(false);
  });

  // Nothing else may be guessed at: an unknown prefix is not a stand-in, because
  // the failure mode of a false positive is losing a picture.
  it("does not guess about anything else", () => {
    expect(isProvisionalCoverKey("session/abc/def/master_4000.webp")).toBe(false);
    expect(isProvisionalCoverKey("set/abc/def/master_4000.webp")).toBe(false);
    expect(isProvisionalCoverKey("catalogue/avatar/IC-87VY-1.jpg")).toBe(false);
  });
});
