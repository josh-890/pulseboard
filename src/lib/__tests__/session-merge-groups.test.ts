import { describe, expect, it } from "vitest";
import { groupPhotosBySet, photosInShownOrder } from "@/lib/session-merge-groups";
import type { GalleryItem, SessionMergeSet } from "@/lib/types";

const set = (id: string): SessionMergeSet => ({
  id,
  title: id,
  type: "photo",
  channelName: null,
  releaseDate: null,
  releaseDatePrecision: "DAY",
  coverUrl: null,
});
const photo = (id: string, setIds: string[], cast: string[] = [], hidden: string[] = []) =>
  ({ id, setLinks: setIds.map((setId) => ({ setId, setTitle: setId })), sessionCastIds: cast, hiddenPersonIds: hidden }) as GalleryItem;

describe("groupPhotosBySet", () => {
  const sets = [set("s1"), set("s2")];
  const photos = [photo("a", ["s1"], ["p1", "p2"]), photo("b", ["s1", "s2"], ["p1", "p2"], ["p1"]), photo("c", [], ["p1"])];

  it("groups by the card's sets, a photo under each of its sets, loose ones last", () => {
    const groups = groupPhotosBySet(sets, photos);
    expect(groups.map((g) => [g.key, g.photos.map((p) => p.id)])).toEqual([
      ["s1", ["a", "b"]],
      ["s2", ["b"]],
      ["none", ["c"]],
    ]);
  });

  it("keeps only the photos showing the person — hidden on the image counts as not shown", () => {
    const groups = groupPhotosBySet(sets, photos, "p1");
    expect(groups.map((g) => [g.key, g.photos.map((p) => p.id)])).toEqual([
      ["s1", ["a"]],
      ["s2", []],
      ["none", ["c"]],
    ]);
  });

  it("lists each photo once in shown order", () => {
    expect(photosInShownOrder(groupPhotosBySet(sets, photos)).map((p) => p.id)).toEqual(["a", "b", "c"]);
  });
});
