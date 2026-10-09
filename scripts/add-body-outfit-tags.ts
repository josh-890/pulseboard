/**
 * Add the body-appearance and outfit-detail tag groups (2026-10-06), add-only.
 *
 *     npx tsx scripts/add-body-outfit-tags.ts --dev              # dry run on dev
 *     npx tsx scripts/add-body-outfit-tags.ts --dev --apply
 *     npx tsx scripts/add-body-outfit-tags.ts xpulse             # dry run on xpulse
 *     npx tsx scripts/add-body-outfit-tags.ts xpulse --apply
 *
 * Creates only what is missing (`extendTagVocabulary`): existing groups and tags
 * keep their names, colours and positions. Then merges an existing `tanlines`
 * (a visible skin state, filed under Theme before) into `skin-tanlines`: its
 * sets, folders and images move, and `tanlines` stays as an alias, so
 * `.pb\#tanlines` files keep resolving.
 */

import dotenv from 'dotenv'

const args = process.argv.slice(2)
const dev = args.includes('--dev')
const apply = args.includes('--apply')
const TENANT = args.filter((a) => !a.startsWith('--'))[0] ?? (dev ? 'default' : '')

if (!TENANT) {
  console.error('usage: npx tsx scripts/add-body-outfit-tags.ts <pulse|xpulse> [--apply] | --dev [--apply]')
  process.exit(1)
}

dotenv.config({ path: dev ? '.env' : '.env.production' })

async function main() {
  const { prisma } = await import('../src/lib/db')
  const { runWithTenant } = await import('../src/lib/tenant-context')
  const { BODY_AND_OUTFIT_VOCABULARY, extendTagVocabulary } = await import('../src/lib/tag-vocabulary')
  const { mergeTagDefinitions } = await import('../src/lib/services/tag-service')

  await runWithTenant(TENANT, async () => {
    console.log(`\n════ body + outfit tags on ${TENANT} — ${apply ? 'APPLY' : 'dry run'} ════`)
    const changes = await extendTagVocabulary(prisma, BODY_AND_OUTFIT_VOCABULARY, { dryRun: !apply })
    for (const kind of ['group', 'tag', 'alias', 'parent'] as const) {
      const list = changes.filter((c) => c.kind === kind)
      if (!list.length) continue
      console.log(`\n  ${kind === 'alias' ? 'aliases' : kind + 's'} (${list.length}):`)
      for (const c of list) console.log(`    + ${c.text}`)
    }
    if (!changes.length) console.log('  nothing to add')

    // tanlines → skin-tanlines
    const old = await prisma.tagDefinition.findFirst({
      where: { slug: 'tanlines', group: { slug: { not: 'skin' } } },
      select: { id: true, group: { select: { name: true } } },
    })
    if (old) {
      const where = { tagDefinitionId: old.id }
      const [sets, sessions, media, folders, persons] = await Promise.all([
        prisma.setTag.count({ where }),
        prisma.sessionTag.count({ where }),
        prisma.mediaItemTag.count({ where }),
        prisma.archiveFolderTag.count({ where }),
        prisma.personTag.count({ where }),
      ])
      console.log(
        `\n  merge: tanlines (${old.group.name}) → skin-tanlines — ${sets} sets, ${sessions} sessions, ` +
          `${media} images, ${folders} folders, ${persons} people; “tanlines” stays as alias`,
      )
      if (apply) {
        const target = await prisma.tagDefinition.findFirst({ where: { slug: 'skin-tanlines', group: { slug: 'skin' } }, select: { id: true } })
        if (!target) throw new Error('skin-tanlines missing after extend')
        await mergeTagDefinitions([old.id], target.id)
      }
    }

    console.log(apply ? '\n✔ applied.' : '\nDry run — pass --apply to write.')
  })
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
