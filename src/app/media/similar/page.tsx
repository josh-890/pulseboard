import { notFound } from "next/navigation";
import {
  getMediaItemPhash,
  findSimilarImages,
} from "@/lib/services/media-service";
import { SimilarSearchResults } from "./similar-search-results";

type SimilarPageProps = {
  searchParams: Promise<{ id?: string; threshold?: string }>;
};

export default async function SimilarPage({ searchParams }: SimilarPageProps) {
  const params = await searchParams;
  const mediaItemId = params.id;
  if (!mediaItemId) notFound();

  const source = await getMediaItemPhash(mediaItemId);
  if (!source) notFound();

  const threshold = params.threshold ? Number(params.threshold) : 10;

  const matches = source.phash
    ? await findSimilarImages(source.phash, { limit: 50, threshold })
    : [];

  // Filter out the source item itself
  const filtered = matches.filter((m) => m.mediaItemId !== mediaItemId);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <SimilarSearchResults
        source={{
          mediaItemId,
          filename: source.filename,
          thumbnailUrl: source.thumbnailUrl,
          originalWidth: source.originalWidth,
          originalHeight: source.originalHeight,
        }}
        matches={filtered}
      />
    </div>
  );
}
