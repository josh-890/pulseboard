export type GallerySortMode = "user" | "alpha" | "newest" | "oldest" | "size";

export const GALLERY_SORT_OPTIONS: { value: GallerySortMode; label: string }[] = [
  { value: "user", label: "User defined" },
  { value: "alpha", label: "A → Z" },
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "size", label: "Largest first" },
];

type SortableItem = {
  filename: string;
  createdAt: Date | string;
  originalWidth: number | null;
  originalHeight: number | null;
};

export function applyGallerySort<T extends SortableItem>(items: T[], mode: GallerySortMode): T[] {
  if (mode === "user") return items;
  return [...items].sort((a, b) => {
    switch (mode) {
      case "alpha":
        return a.filename.localeCompare(b.filename);
      case "newest":
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case "oldest":
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case "size": {
        const aArea = (a.originalWidth ?? 0) * (a.originalHeight ?? 0);
        const bArea = (b.originalWidth ?? 0) * (b.originalHeight ?? 0);
        return bArea - aArea;
      }
      default:
        return 0;
    }
  });
}
