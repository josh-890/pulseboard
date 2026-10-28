import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Clock } from "lucide-react";
import { withTenantFromHeaders } from "@/lib/tenant-context";
import { getContactDetail } from "@/lib/services/contact-service";
import {
  ContactActionsBar,
  ContactCatalogueSets,
  ContactName,
  ContactNote,
  ContactPortrait,
} from "@/components/people/contact";

export const dynamic = "force-dynamic";

type ContactPageProps = { params: Promise<{ id: string }> };

const day = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : null);

function Section({ id, title, count, children }: { id: string; title: string; count?: number; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h2 id={id} className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
        {count !== undefined && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium tabular-nums">{count.toLocaleString()}</span>
        )}
      </h2>
      {children}
    </section>
  );
}

/** A Contact — known, not developed (ADR-0038): deliberately plainer than a Person page */
export default async function ContactPage({ params }: ContactPageProps) {
  return withTenantFromHeaders(async () => {
    const { id } = await params;
    const c = await getContactDetail(id);
    if (!c) notFound();
    if (c.personId) redirect(`/people/${c.personId}`);

    const linkedChannels = Object.fromEntries(
      c.channelAliases.filter((a) => a.channel).map((a) => [a.channelName, a.channel!.id]),
    );
    const aids = [c.nationality, c.birthYear].filter(Boolean).join(" · ");

    return (
      <div className="space-y-8">
        <Link
          href="/people/contacts"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
        >
          <ArrowLeft size={14} aria-hidden /> Contacts
        </Link>

        <header className="flex flex-col gap-5 rounded-2xl border border-white/20 bg-card/70 p-5 shadow-md backdrop-blur-sm sm:flex-row sm:items-start">
          <ContactPortrait
            contactId={c.id}
            name={c.name}
            avatarUrl={c.avatarUrl}
            hasChosenPortrait={c.hasChosenPortrait}
            hasCataloguePortrait={c.hasCataloguePortrait}
          />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="space-y-1">
              <span className="inline-flex items-center rounded-full border border-dashed border-white/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Contact — not yet developed
              </span>
              <ContactName contactId={c.id} name={c.name} catalogueName={c.catalogueName} nameSetByUser={c.nameSetByUser} />
              <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                {c.icgId && <span className="font-mono">{c.icgId}</span>}
                {aids && <span>· {aids}</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                {c.catalogueDate
                  ? `Catalogue file from ${day(c.catalogueDate)}`
                  : "No catalogue file loaded for her yet"}
                {c.goneFromCatalogueAt && ` · no longer in the catalogue since ${day(c.goneFromCatalogueAt)}`}
                {c.ignoredAt && " · ignored"}
              </p>
            </div>
            <ContactActionsBar contactId={c.id} name={c.name} icgId={c.icgId} ignored={Boolean(c.ignoredAt)} />
          </div>
        </header>

        {c.waitingStagedSets.length > 0 && (
          <Section id="contact-waiting" title="In staged sets" count={c.waitingStagedSets.length}>
            <ul className="space-y-1.5">
              {c.waitingStagedSets.map((s) => (
                <li key={s.id} className="flex items-center gap-3 rounded-xl border border-white/15 bg-card/40 px-3 py-2 text-sm">
                  <Clock size={14} className="shrink-0 text-muted-foreground" aria-hidden />
                  <span className="w-24 shrink-0 tabular-nums text-xs text-muted-foreground">{day(s.releaseDate) ?? "no date"}</span>
                  <span className="w-36 shrink-0 truncate text-xs text-muted-foreground">{s.channelName}</span>
                  <Link href={`/staging-sets?select=${s.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                    {s.title}
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section id="contact-known-as" title="Known as">
          <div className="space-y-3 rounded-xl border border-white/15 bg-card/40 p-4 text-sm">
            {c.aka.length > 0 && (
              <p>
                <span className="text-muted-foreground">Also known as </span>
                {c.aka.join(", ")}
              </p>
            )}
            {c.channelAliases.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label="Aliases per channel">
                {c.channelAliases.map((a) => (
                  <li
                    key={`${a.channelName}|${a.alias}`}
                    className="rounded-full border border-white/15 bg-muted/40 px-2.5 py-0.5 text-xs"
                    title={a.channel ? `Linked to ${a.channel.name}` : "Channel not linked — no import alias names it"}
                  >
                    {a.alias} <span className="text-muted-foreground">on</span>{" "}
                    {a.channel ? (
                      <Link href={`/channels/${a.channel.id}`} className="hover:underline">
                        {a.channel.name}
                      </Link>
                    ) : (
                      <span className="italic text-muted-foreground">{a.channelName}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {c.listedAs.length > 0 && (
              <p>
                <span className="text-muted-foreground">Credited elsewhere as </span>
                {c.listedAs.join(", ")}
              </p>
            )}
            {c.mentionedBy.length > 0 && (
              <p>
                <span className="text-muted-foreground">Co-model of </span>
                {c.mentionedBy.map((p, i) => (
                  <span key={p.id}>
                    {i > 0 && ", "}
                    <Link href={`/people/${p.id}`} className="hover:underline">
                      {p.name} ({p.icgId})
                    </Link>
                  </span>
                ))}
              </p>
            )}
            {c.aka.length + c.channelAliases.length + c.listedAs.length + c.mentionedBy.length === 0 && (
              <p className="text-muted-foreground">Nothing more yet — aliases arrive with the catalogue load.</p>
            )}
          </div>
        </Section>

        <Section id="contact-sets" title="Catalogue sets" count={c.catalogueSetCount}>
          <ContactCatalogueSets sets={c.catalogueSets} total={c.catalogueSetCount} linkedChannels={linkedChannels} />
        </Section>

        {c.creditedSets.length > 0 && (
          <Section id="contact-credited" title="Credited in your sets" count={c.creditedSets.length}>
            <ul className="space-y-1.5">
              {c.creditedSets.map((s) => (
                <li key={s.id} className="flex items-center gap-3 rounded-xl border border-white/15 bg-card/40 px-3 py-2 text-sm">
                  <span className="w-24 shrink-0 tabular-nums text-xs text-muted-foreground">{day(s.releaseDate) ?? "no date"}</span>
                  <span className="w-36 shrink-0 truncate text-xs text-muted-foreground">{s.channel?.name ?? "—"}</span>
                  <Link href={`/sets/${s.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                    {s.title}
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {c.archiveFolders.length > 0 && (
          <Section id="contact-archive" title="Archive folders" count={c.archiveFolders.length}>
            <ul className="space-y-1 rounded-xl border border-white/15 bg-card/40 px-3 py-2 text-sm">
              {c.archiveFolders.map((f) => (
                <li key={f.id} className="truncate">
                  {f.folderName}
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section id="contact-note" title="Note">
          <ContactNote contactId={c.id} note={c.note} />
        </Section>
      </div>
    );
  });
}
