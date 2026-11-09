import Link from "next/link";
import NextImage from "next/image";
import { Camera } from "lucide-react";
import { cn, focalStyle, getInitialsFromName } from "@/lib/utils";
import type { ChannelModel } from "@/lib/services/channel-wall-service";

export type ModelsFilter = "all" | "library" | "persons" | "contacts";

export const MODELS_PAGE = 300;

type ChannelModelsProps = {
  models: ChannelModel[];
  filter: ModelsFilter;
  /** How many cards to render */
  limit: number;
  /** The tab's own address, e.g. /channels/x?tab=models */
  basePath: string;
};

function hrefOf(m: ChannelModel): string | null {
  if (m.kind === "person" && m.id) return `/people/${m.id}`;
  if (m.kind === "contact" && m.id) return `/people/contacts/${m.id}`;
  return null;
}

function Card({ m }: { m: ChannelModel }) {
  const name = m.name ?? m.icgId;
  const href = hrefOf(m);
  const inner = (
    <>
      <span className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            "relative h-11 w-11 shrink-0 overflow-hidden rounded-full bg-muted/50",
            // A Contact is recognisable, not developed: the dashed frame, as everywhere (ADR-0038)
            m.kind === "person" ? "ring-2 ring-white/15" : "border-2 border-dashed border-white/30",
          )}
        >
          {m.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- MinIO URL, not a static asset
            <img src={m.avatarUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-sm font-semibold text-muted-foreground">
              {getInitialsFromName(name)}
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate text-sm font-medium group-hover:text-primary">{name}</span>
            {m.kind === "contact" && (
              <span className="shrink-0 rounded bg-muted/60 px-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Contact</span>
            )}
          </span>
          <span className="block truncate font-mono text-[10px] text-muted-foreground">
            {m.name ? m.icgId : <span className="font-sans italic">not in the app</span>}
            {m.aids && <span className="font-sans"> · {m.aids}</span>}
          </span>
        </span>
      </span>

      {/* Her newest covers here — what she shot for it, at a glance */}
      <span className="grid grid-cols-3 gap-1.5">
        {Array.from({ length: 3 }, (_, i) => {
          const c = m.covers[i];
          return (
            <span
              key={i}
              className="relative block aspect-[2/3] overflow-hidden rounded-md bg-black/[0.06] ring-1 ring-black/10 dark:bg-white/[0.06] dark:ring-white/10"
            >
              {c ? (
                <NextImage
                  src={c.url}
                  alt={c.title}
                  fill
                  unoptimized
                  loading="lazy"
                  sizes="120px"
                  style={focalStyle(c.focalX, c.focalY)}
                  className="object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.03]"
                />
              ) : (
                i === 0 && (
                  <span className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                    <Camera size={16} aria-hidden="true" />
                  </span>
                )
              )}
            </span>
          );
        })}
      </span>

      <span className="mt-auto block text-[11px] tabular-nums text-muted-foreground">
        <span className="font-semibold text-foreground">{m.inLibrary}</span> of {m.known} {m.known === 1 ? "set" : "sets"} in your library
      </span>
    </>
  );
  const className = cn(
    "group flex h-full flex-col gap-3 rounded-2xl border p-3 shadow-sm transition-all duration-150",
    m.kind === "person" ? "border-white/20 bg-card/70" : "border-white/10 bg-card/40",
  );
  return href ? (
    <Link
      href={href}
      className={cn(className, "hover:-translate-y-px hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
    >
      {inner}
    </Link>
  ) : (
    <div className={className} title="Not in the app yet">
      {inner}
    </div>
  );
}

/** Everyone seen on the channel: Persons first, then Contacts — by how many of its sets */
export function ChannelModels({ models, filter, limit, basePath }: ChannelModelsProps) {
  const persons = models.filter((m) => m.kind === "person").length;
  const contacts = models.filter((m) => m.kind === "contact").length;
  // Who leads a set you have — the number on the tab and the hero's "Models"
  const inLibrary = models.filter((m) => m.inLibrary > 0).length;
  const shown = models.filter((m) =>
    filter === "library" ? m.inLibrary > 0 : filter === "persons" ? m.kind === "person" : filter === "contacts" ? m.kind !== "person" : true,
  );
  const pills: { key: ModelsFilter; label: string; n: number }[] = [
    { key: "all", label: "Everyone", n: models.length },
    { key: "library", label: "In your library", n: inLibrary },
    { key: "persons", label: "Persons", n: persons },
    { key: "contacts", label: "Not developed", n: models.length - persons },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {models.length === 0
            ? "No one known here yet."
            : `${persons} developed, ${contacts} Contacts${models.length - persons - contacts > 0 ? `, ${models.length - persons - contacts} not in the app` : ""} — from its sets you have, staged and in the catalogue.`}
        </p>
        <div role="group" aria-label="Who" className="inline-flex flex-wrap gap-0.5 rounded-md border border-border bg-background p-0.5">
          {pills.map((p) => (
            <Link
              key={p.key}
              href={p.key === "all" ? basePath : `${basePath}&who=${p.key}`}
              scroll={false}
              aria-current={filter === p.key ? "true" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                filter === p.key ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground hover:bg-muted",
              )}
            >
              {p.label} <span className="tabular-nums opacity-70">{p.n}</span>
            </Link>
          ))}
        </div>
      </div>
      <ul className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        {shown.slice(0, limit).map((m) => (
          <li key={m.icgId}>
            <Card m={m} />
          </li>
        ))}
      </ul>
      {shown.length > limit && (
        <div className="flex flex-col items-center gap-1 py-2">
          <p className="text-xs text-muted-foreground">
            Showing {limit.toLocaleString()} of {shown.length.toLocaleString()}
          </p>
          <Link
            href={`${basePath}${filter === "all" ? "" : `&who=${filter}`}&limit=${limit + MODELS_PAGE}`}
            scroll={false}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Show {Math.min(MODELS_PAGE, shown.length - limit).toLocaleString()} more
          </Link>
        </div>
      )}
    </div>
  );
}
