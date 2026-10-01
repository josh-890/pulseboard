/**
 * Seed the starter tag vocabulary and retire the old seed groups (ADR-0033).
 *
 *     npx tsx scripts/seed-tag-vocabulary.ts --dev              # dry run on dev
 *     npx tsx scripts/seed-tag-vocabulary.ts xpulse --apply     # write to xpulse
 *     npx tsx scripts/seed-tag-vocabulary.ts pulse --apply
 *
 * Dry run by default: prints what would move and what would be deleted.
 *
 * Retirement, as decided 2026-10-01 (per item, with the user's go):
 *   - Style:outdoor / Style:studio assignments move to Setting:Outdoor /
 *     Setting:Studio (same meaning), and the old aliases move with them.
 *   - Content Type, Style, Status, Tier and Uncategorized are deleted with
 *     their tags and remaining assignments (they overlap Person.status/rating
 *     and MediaCategory). On pulse that drops 3 person and 1 project
 *     assignment; on xpulse nothing once the moves are done.
 *   - Appearance (xpulse only) is kept and becomes Content · set.
 */

import dotenv from 'dotenv'

const args = process.argv.slice(2)
const dev = args.includes('--dev')
const apply = args.includes('--apply')
const TENANT = args.filter((a) => !a.startsWith('--'))[0] ?? (dev ? 'default' : '')

if (!TENANT) {
  console.error('usage: npx tsx scripts/seed-tag-vocabulary.ts <pulse|xpulse> [--apply] | --dev [--apply]')
  process.exit(1)
}

dotenv.config({ path: dev ? '.env' : '.env.production' })

const RETIRED_GROUP_SLUGS = ['content-type', 'style', 'status', 'tier', 'uncategorized']

// old (group slug, tag slug) → new (group slug, tag slug)
const MOVES: Array<{ from: [string, string]; to: [string, string] }> = [
  { from: ['style', 'outdoor'], to: ['setting', 'outdoor'] },
  { from: ['style', 'studio'], to: ['setting', 'studio'] },
]

async function main() {
  const { prisma } = await import('../src/lib/db')
  const { runWithTenant } = await import('../src/lib/tenant-context')
  const { applyTagVocabulary, TAG_VOCABULARY } = await import('../src/lib/tag-vocabulary')

  await runWithTenant(TENANT, async () => {
    console.log(`\n════ tag vocabulary on ${TENANT} — ${apply ? 'APPLY' : 'dry run'} ════`)

    const findTag = (groupSlug: string, slug: string) =>
      prisma.tagDefinition.findFirst({ where: { slug, group: { slug: groupSlug } }, select: { id: true, name: true } })

    const countAssignments = async (tagIds: string[]) => {
      const where = { tagDefinitionId: { in: tagIds } }
      const [person, session, media, set, project] = await Promise.all([
        prisma.personTag.count({ where }),
        prisma.sessionTag.count({ where }),
        prisma.mediaItemTag.count({ where }),
        prisma.setTag.count({ where }),
        prisma.projectTag.count({ where }),
      ])
      return { person, session, media, set, project }
    }

    await prisma.$transaction(async (tx) => {
      // 1. Vocabulary first, so the move targets exist
      if (apply) await applyTagVocabulary(tx)
      else console.log(`would upsert the starter vocabulary (${TAG_VOCABULARY.length} groups); counts below are before the moves`)

      // 2. Moves
      for (const m of MOVES) {
        const from = await findTag(...m.from)
        if (!from) continue
        const to = apply ? await tx.tagDefinition.findFirst({
          where: { slug: m.to[1], group: { slug: m.to[0] } }, select: { id: true },
        }) : null
        const counts = await countAssignments([from.id])
        console.log(`move ${m.from.join(':')} → ${m.to.join(':')}:`, counts)
        if (!apply) continue
        if (!to) throw new Error(`move target ${m.to.join(':')} missing`)
        const rows = { tagDefinitionId: from.id }
        for (const r of await tx.personTag.findMany({ where: rows })) {
          await tx.personTag.upsert({ where: { personId_tagDefinitionId: { personId: r.personId, tagDefinitionId: to.id } }, create: { personId: r.personId, tagDefinitionId: to.id, source: r.source }, update: {} })
        }
        for (const r of await tx.sessionTag.findMany({ where: rows })) {
          await tx.sessionTag.upsert({ where: { sessionId_tagDefinitionId: { sessionId: r.sessionId, tagDefinitionId: to.id } }, create: { sessionId: r.sessionId, tagDefinitionId: to.id, source: r.source }, update: {} })
        }
        for (const r of await tx.mediaItemTag.findMany({ where: rows })) {
          await tx.mediaItemTag.upsert({ where: { mediaItemId_tagDefinitionId: { mediaItemId: r.mediaItemId, tagDefinitionId: to.id } }, create: { mediaItemId: r.mediaItemId, tagDefinitionId: to.id, source: r.source }, update: {} })
        }
        for (const r of await tx.setTag.findMany({ where: rows })) {
          await tx.setTag.upsert({ where: { setId_tagDefinitionId: { setId: r.setId, tagDefinitionId: to.id } }, create: { setId: r.setId, tagDefinitionId: to.id, source: r.source }, update: {} })
        }
        for (const r of await tx.projectTag.findMany({ where: rows })) {
          await tx.projectTag.upsert({ where: { projectId_tagDefinitionId: { projectId: r.projectId, tagDefinitionId: to.id } }, create: { projectId: r.projectId, tagDefinitionId: to.id, source: r.source }, update: {} })
        }
        await tx.tagAlias.updateMany({ where: { tagDefinitionId: from.id }, data: { tagDefinitionId: to.id } })
      }

      // 3. Retire the old groups with their tags and whatever is left on them
      const retired = await tx.tagGroup.findMany({
        where: { slug: { in: RETIRED_GROUP_SLUGS } },
        select: { id: true, name: true, tags: { select: { id: true, name: true } } },
      })
      for (const g of retired) {
        const ids = g.tags.map((t) => t.id)
        console.log(`delete group ${g.name} [${g.tags.map((t) => t.name).join(', ')}] — remaining assignments:`,
          await countAssignments(ids))
        if (!apply) continue
        const where = { tagDefinitionId: { in: ids } }
        await tx.personTag.deleteMany({ where })
        await tx.sessionTag.deleteMany({ where })
        await tx.mediaItemTag.deleteMany({ where })
        await tx.setTag.deleteMany({ where })
        await tx.projectTag.deleteMany({ where })
        await tx.tagAlias.deleteMany({ where })
        await tx.tagDefinition.updateMany({ where: { parentId: { in: ids } }, data: { parentId: null } })
        await tx.tagDefinition.deleteMany({ where: { id: { in: ids } } })
        await tx.tagGroup.delete({ where: { id: g.id } })
      }

      // 4. Vocabulary groups in their intended order, any other group after them
      if (apply) {
        const order = new Map(TAG_VOCABULARY.map((g, i) => [g.slug, i]))
        const all = await tx.tagGroup.findMany({ select: { id: true, slug: true, sortOrder: true }, orderBy: { sortOrder: 'asc' } })
        const sorted = [...all].sort((a, b) =>
          (order.get(a.slug) ?? order.size) - (order.get(b.slug) ?? order.size) || a.sortOrder - b.sortOrder)
        for (let i = 0; i < sorted.length; i++) {
          await tx.tagGroup.update({ where: { id: sorted[i].id }, data: { sortOrder: i } })
        }
      }

      // 5. Appearance (xpulse) — kept, placed in the content chain at set level
      const appearance = await tx.tagGroup.findUnique({ where: { slug: 'appearance' }, select: { id: true } })
      if (appearance) {
        console.log('appearance → domain CONTENT, typical level SET')
        if (apply) {
          await tx.tagGroup.update({ where: { id: appearance.id }, data: { domain: 'CONTENT', typicalLevel: 'SET' } })
        }
      }
    }, { timeout: 60_000 })

    const groups = await prisma.tagGroup.findMany({
      orderBy: { sortOrder: 'asc' },
      select: { name: true, domain: true, typicalLevel: true, kind: true, isExclusive: true, _count: { select: { tags: true } } },
    })
    console.log('\ngroups now:')
    for (const g of groups) {
      console.log(`  ${g.name.padEnd(18)} ${g.domain.padEnd(8)} ${(g.typicalLevel ?? '').padEnd(10)} ${g.kind === 'WORKFLOW' ? 'workflow ' : ''}${g.isExclusive ? 'exclusive ' : ''}${g._count.tags} tags`)
    }
  })
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .then(() => process.exit(0))
