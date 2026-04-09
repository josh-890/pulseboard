import { withTenantFromHeaders } from "@/lib/tenant-context";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Camera, Film, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { getArtistById, getArtistStats, getArtistCareer } from "@/lib/services/artist-service";
import { deleteArtistAction } from "@/lib/actions/artist-actions";
import { DeleteButton } from "@/components/shared/delete-button";
import { ArtistDetailHeader } from "@/components/artists/artist-detail-header";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

type ArtistDetailPageProps = {
  params: Promise<{ id: string }>;
};

function SectionCard({
  title,
  icon,
  children,
  className,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm",
        className,
      )}
    >
      <div className="mb-4 flex items-center gap-2">
        <span className="text-muted-foreground" aria-hidden="true">
          {icon}
        </span>
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  );
}

export default async function ArtistDetailPage({ params }: ArtistDetailPageProps) {
  return withTenantFromHeaders(async () => {
    const { id } = await params;
    const artist = await getArtistById(id);
    if (!artist) notFound();

    const [stats, career] = await Promise.all([
      getArtistStats(id),
      getArtistCareer(id),
    ]);

    return (
      <div className="space-y-6">
        {/* Back link */}
        <Link href="/artists">
          <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
            <ChevronLeft size={14} />
            Artists
          </Button>
        </Link>

        {/* Header card */}
        <ArtistDetailHeader artist={artist} />

        {/* KPI row */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KpiCard label="Sets" value={stats.setCount} />
          <KpiCard label="Channels" value={stats.channelCount} />
          <KpiCard label="Images" value={stats.imageCount} />
          <KpiCard label="Videos" value={stats.videoCount} />
        </div>

        {/* Career section */}
        {career.length > 0 ? (
          <SectionCard title="Career" icon={<Camera size={18} />}>
            <div className="space-y-6">
              {career.map((group) => (
                <div key={group.channelId ?? "unknown"}>
                  <div className="mb-2 flex items-center gap-2">
                    <h3 className="text-sm font-semibold">{group.channelName}</h3>
                    <span className="text-xs text-muted-foreground">
                      ({group.sets.length} {group.sets.length === 1 ? "set" : "sets"})
                    </span>
                  </div>
                  <div className="space-y-1">
                    {group.sets.map((set) => (
                      <Link
                        key={set.setId}
                        href={`/sets/${set.setId}`}
                        className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted/50"
                      >
                        <span className="w-24 shrink-0 text-xs text-muted-foreground">
                          {set.releaseDate
                            ? set.releaseDate.toISOString().split("T")[0]
                            : "????-??-??"}
                        </span>
                        {set.type === "video" && (
                          <Film size={12} className="shrink-0 text-violet-400" />
                        )}
                        <span className="truncate font-medium">{set.title}</span>
                        {set.participants.length > 0 && (
                          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                            {set.participants.map((p) => p.name).join(", ")}
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        ) : (
          <SectionCard title="Career" icon={<Camera size={18} />}>
            <p className="text-sm italic text-muted-foreground/70">
              No resolved credits yet.
            </p>
          </SectionCard>
        )}

        {/* Danger zone */}
        <div className="flex justify-end pt-4">
          <DeleteButton
            title={`Delete ${artist.name}`}
            description="This will permanently delete this artist and unresolve all linked credits."
            onDelete={deleteArtistAction.bind(null, artist.id)}
            redirectTo="/artists"
          />
        </div>
      </div>
    );
  });
}

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/70 p-4 shadow-sm">
      <p className="text-2xl font-bold">{value.toLocaleString()}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
