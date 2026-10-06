/**
 * Rename every tag into the one spelling — kebab-case (decided 2026-10-06).
 *
 *     npx tsx scripts/normalize-tag-names.ts --dev              # dry run on dev
 *     npx tsx scripts/normalize-tag-names.ts --dev --apply
 *     npx tsx scripts/normalize-tag-names.ts xpulse             # dry run on xpulse
 *     npx tsx scripts/normalize-tag-names.ts xpulse --apply
 *
 * Dry run by default: prints each rename. Renames go through
 * `updateTagDefinition`, so a tag whose slug changes keeps its old name as an
 * alias (`#B&W` files, saved queries and typing habits still resolve). A name
 * that differs only in case or spaces keeps its slug and needs no alias.
 * Two tags of one group landing on the same name stop the run — nothing is
 * written then.
 */

import dotenv from 'dotenv'

const args = process.argv.slice(2)
const dev = args.includes('--dev')
const apply = args.includes('--apply')
const TENANT = args.filter((a) => !a.startsWith('--'))[0] ?? (dev ? 'default' : '')

if (!TENANT) {
  console.error('usage: npx tsx scripts/normalize-tag-names.ts <pulse|xpulse> [--apply] | --dev [--apply]')
  process.exit(1)
}

dotenv.config({ path: dev ? '.env' : '.env.production' })

// Names the mechanical rule would spell badly — confirmed with the user
const OVERRIDES: Record<string, string> = {
  'B&W': 'black-and-white',
  'Skimpy2Nude': 'skimpy-to-nude',
}

async function main() {
  const { prisma } = await import('../src/lib/db')
  const { runWithTenant } = await import('../src/lib/tenant-context')
  const { updateTagDefinition } = await import('../src/lib/services/tag-service')
  const { toTagName } = await import('../src/lib/tag-names')

  await runWithTenant(TENANT, async () => {
    console.log(`\n════ tag names on ${TENANT} — ${apply ? 'APPLY' : 'dry run'} ════`)
    const tags = await prisma.tagDefinition.findMany({
      select: { id: true, name: true, slug: true, groupId: true, group: { select: { name: true } } },
      orderBy: [{ group: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
    })

    const plan = tags
      .map((t) => ({ ...t, next: OVERRIDES[t.name] ?? toTagName(t.name) }))
      .filter((t) => t.next !== t.name)

    // Collisions: two tags of one group on the same final name
    const finalName = new Map(tags.map((t) => [t.id, t.name]))
    for (const p of plan) finalName.set(p.id, p.next)
    const seen = new Map<string, string>()
    const collisions: string[] = []
    for (const t of tags) {
      const key = `${t.groupId}|${finalName.get(t.id)}`
      if (seen.has(key)) collisions.push(`${t.group.name}: “${seen.get(key)}” and “${t.name}” → ${finalName.get(t.id)}`)
      else seen.set(key, t.name)
    }
    if (!plan.length) console.log('  all tag names already in kebab-case')
    for (const p of plan) {
      const alias = toTagName(p.name) !== p.next ? `   (alias “${p.name}” kept)` : ''
      console.log(`  ${p.group.name.padEnd(14)} ${p.name.padEnd(20)} → ${p.next}${alias}`)
    }
    if (collisions.length) {
      console.error(`\n✖ ${collisions.length} collision(s) — nothing written:`)
      for (const c of collisions) console.error(`  ${c}`)
      process.exitCode = 1
      return
    }
    if (!apply) {
      console.log(`\n${plan.length} rename(s). Dry run — pass --apply to write.`)
      return
    }
    for (const p of plan) await updateTagDefinition(p.id, { name: p.next })
    console.log(`\n✔ ${plan.length} tag(s) renamed.`)
  })
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
