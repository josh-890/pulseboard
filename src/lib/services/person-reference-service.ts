/**
 * A face to compare an archive cover against.
 *
 * Deciding "is this folder this person" from a name is guesswork; every
 * comparable system (Lightroom, digiKam, Immich, Google Photos) puts a reference
 * image beside the candidate. The difficulty here is coverage: of 5,074 suggested
 * identities on xpulse only 94 are curated Persons and 711 are Contacts. The other
 * 4,269 have no app record at all — and they are precisely the ones where the
 * operator has nothing to go on.
 *
 * So the reference is resolved down a ladder, first hit wins:
 *
 *   1. curated Person  — the headshot the user chose
 *   2. catalogue       — the portrait from the person catalogue, keyed on ICG-ID
 *                        alone, which is the only source that reaches the 4,269
 *   3. archive         — covers of folders ALREADY confirmed as this person
 *
 * `Contact.thumbUrl` is deliberately NOT a rung. It is a URL on the source site,
 * which is hotlink-protected — 200 without a `Referer`, 403 to a browser, which
 * always sends one. It renders as a broken image, never as a face.
 *
 * Rung 3 is worth more than it looks: it needs no import and no agent, it is at
 * 100% cover coverage, and it improves as the operator works — confirm three
 * folders as Alisa and the fourth arrives with three reference images.
 */
import { prisma } from '@/lib/db'
import { buildUrl } from '@/lib/media-url'
import { getHeadshotsForPersons } from '@/lib/services/media-service'

export type PersonReferenceKind = 'person' | 'catalogue' | 'archive' | 'none'

export type PersonReference = {
  icgId: string
  /** The single best face, or null when nothing is known yet. */
  avatarUrl: string | null
  kind: PersonReferenceKind
  /** Extra archive covers already confirmed as this person, for a wider look. */
  sampleCovers: string[]
  /** Set when this person exists as a curated Person — the workbench links to them. */
  personId: string | null
}

const MAX_SAMPLE_COVERS = 4

/**
 * Resolve references for a batch of ICG-IDs.
 *
 * Batched on purpose: the review grid asks for every candidate in a group at once,
 * and a per-candidate query would be dozens of round trips per keystroke.
 */
export async function resolvePersonReferences(icgIds: string[]): Promise<Map<string, PersonReference>> {
  const ids = [...new Set(icgIds.filter(Boolean))]
  const out = new Map<string, PersonReference>()
  if (ids.length === 0) return out

  const [persons, catalogue, attributions] = await Promise.all([
    prisma.person.findMany({ where: { icgId: { in: ids } }, select: { id: true, icgId: true } }),
    prisma.catalogueAvatar.findMany({
      where: { icgId: { in: ids }, key: { not: null } },
      select: { icgId: true, key: true },
    }),
    prisma.archiveFolderAttribution.findMany({
      where: { icgId: { in: ids }, archiveFolder: { coverKey: { not: null } } },
      select: { icgId: true, archiveFolder: { select: { coverKey: true } } },
      orderBy: { confirmedAt: 'desc' },
      take: ids.length * MAX_SAMPLE_COVERS,
    }),
  ])

  const headshots = await getHeadshotsForPersons(persons.map((p) => p.id))
  const personByIcg = new Map(persons.map((p) => [p.icgId, p]))
  const catalogueByIcg = new Map(catalogue.map((c) => [c.icgId, c]))

  const coversByIcg = new Map<string, string[]>()
  for (const a of attributions) {
    const key = a.archiveFolder.coverKey
    if (!key) continue
    const list = coversByIcg.get(a.icgId) ?? []
    if (list.length < MAX_SAMPLE_COVERS) {
      list.push(buildUrl(key))
      coversByIcg.set(a.icgId, list)
    }
  }

  for (const icgId of ids) {
    const person = personByIcg.get(icgId)
    const headshot = person ? headshots.get(person.id) : undefined
    const cat = catalogueByIcg.get(icgId)
    const covers = coversByIcg.get(icgId) ?? []

    const [avatarUrl, kind]: [string | null, PersonReferenceKind] = headshot?.thumbUrl
      ? [headshot.thumbUrl, 'person']
      : cat?.key
        ? [buildUrl(cat.key), 'catalogue']
        : covers[0]
          ? [covers[0], 'archive']
          : [null, 'none']

    out.set(icgId, {
      icgId,
      avatarUrl,
      kind,
      // When the avatar already came from the archive, do not repeat it below.
      sampleCovers: kind === 'archive' ? covers.slice(1) : covers,
      personId: person?.id ?? null,
    })
  }

  return out
}
