/**
 * Seed the Tag Composer vocabulary (ADR-0042) from the reviewed tables in
 * docs/Tag-Composer/ — composer-vocabulary.csv and composer-state-matrix.csv.
 *
 *     npx tsx scripts/add-composer-vocabulary.ts --dev              # dry run on dev
 *     npx tsx scripts/add-composer-vocabulary.ts --dev --apply
 *     npx tsx scripts/add-composer-vocabulary.ts xpulse             # dry run on xpulse
 *     npx tsx scripts/add-composer-vocabulary.ts xpulse --apply
 *
 * xpulse and dev only (the user's decision; pulse has no body/outfit groups).
 * Re-runnable: everything is matched before it is created.
 *   - groups: created, or the existing one taken over (Pose → Posture, View →
 *     Facing, Framing, Footwear, Legwear); all become photo-level, content
 *   - tags: an `origin` of `rename:<old>` renames that tag (the old name stays an
 *     alias — updateTagDefinition) and moves it into its group; a tag found by
 *     name moves too; otherwise it is created. A missing description is filled
 *   - the Danbooru name becomes an alias when it is spelled differently
 *   - parents: the first is `parentId`, the rest further parents
 *   - "do not confuse with" pairs, the state matrix, the Composer paths/sections
 *   - presets (composer-presets.csv): only a name not there yet is created — a
 *     preset already there is never changed
 * Nothing is deleted. A group left empty by the moves is reported, not removed.
 */

import dotenv from 'dotenv'
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const dev = args.includes('--dev')
const apply = args.includes('--apply')
const TENANT = args.filter((a) => !a.startsWith('--'))[0] ?? (dev ? 'default' : '')

if (!TENANT || TENANT === 'pulse') {
  console.error('usage: npx tsx scripts/add-composer-vocabulary.ts xpulse [--apply] | --dev [--apply]   (not pulse)')
  process.exit(1)
}

dotenv.config({ path: dev ? '.env' : '.env.production' })

// ─── The tables ─────────────────────────────────────────────────────────────

/** `;`-separated, `"`-quoted, UTF-8 with BOM (as Excel writes it) */
function readCsv(path: string): Record<string, string>[] {
  const text = readFileSync(path, 'utf8').replace(/^﻿/, '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ';') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some((x) => x !== '')) rows.push(row)
      row = []
    } else cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  const [head, ...body] = rows
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])))
}

type VocabRow = {
  path: string; section: string; group: string; exclusive: string; tag: string; danbooru: string
  parents: string; definition: string; confusable: string; origin: string
  // ADR-0043
  region_catalog: string; choice: string; relevance_default: string; framing_fill: string; framing_top: string; tile_aspect: string
}
const vocab = readCsv('docs/Tag-Composer/composer-vocabulary.csv') as unknown as VocabRow[]
const matrix = readCsv('docs/Tag-Composer/composer-state-matrix.csv')
const relevanceRows = readCsv('docs/Tag-Composer/composer-relevance.csv') as unknown as {
  context: string; target_kind: 'PATH' | 'GROUP' | 'TAG'; target: string; level: 'TYPICAL' | 'POSSIBLE' | 'IMPOSSIBLE'
}[]
const presetRows = readCsv('docs/Tag-Composer/composer-presets.csv') as unknown as { name: string; adds: string }[]
const list = (s: string) => s.split(';').map((x) => x.trim()).filter(Boolean)

// Existing groups taken over (slug → new name); everything else is matched by slug
const TAKE_OVER: Record<string, string> = { Posture: 'pose', Facing: 'view', Framing: 'framing', Footwear: 'footwear', Legwear: 'legwear', Orientation: 'lying-orientation' }

const PATH_STYLE: Record<string, { color: string; tileAspect: string; pinned: boolean; personal: boolean }> = {
  Figure: { color: '#a855f7', tileAspect: '3:4', pinned: false, personal: true },
  Clothing: { color: '#ec4899', tileAspect: '1:1', pinned: true, personal: true },
  Camera: { color: '#6366f1', tileAspect: '1:1', pinned: true, personal: false },
  Expression: { color: '#f59e0b', tileAspect: '1:1', pinned: false, personal: true },
  Detail: { color: '#14b8a6', tileAspect: '1:1', pinned: false, personal: true },
  // The detail behind the intensity acts (2026-11-27) — per person, like the pose
  Acts: { color: '#ef4444', tileAspect: '1:1', pinned: false, personal: true },
}
const PATH_ORDER = ['Figure', 'Clothing', 'Camera', 'Expression', 'Detail', 'Acts']
const SECTION_COLOR: Record<string, string> = { 'State matrix': '#f43f5e', Undress: '#e11d48', Impression: '#14b8a6' }
const PASSABLE = new Set(['Base posture', 'Framing', 'Seat', 'Torso', 'Camera angle', 'Facing', 'Gaze', 'Region'])
const sectionKind = (s: string) => (s === 'Refinement' ? 'REFINEMENT' : s === 'State matrix' ? 'MATRIX' : 'TILES') as 'TILES' | 'REFINEMENT' | 'MATRIX'

async function main() {
  const { prisma } = await import('../src/lib/db')
  const { runWithTenant } = await import('../src/lib/tenant-context')
  const { toTagName } = await import('../src/lib/tag-names')
  const { updateTagDefinition, setExtraParents } = await import('../src/lib/services/tag-service')

  await runWithTenant(TENANT, async () => {
    console.log(`\n════ Composer vocabulary on ${TENANT} — ${apply ? 'APPLY' : 'dry run'} ════`)
    const log: Record<string, string[]> = {}
    const note = (kind: string, text: string) => (log[kind] ??= []).push(text)

    // ── 1. Groups ──────────────────────────────────────────────────────────
    const groupDefs = new Map<string, { exclusive: boolean; path: string; section: string }>()
    for (const r of vocab) if (!groupDefs.has(r.group)) groupDefs.set(r.group, { exclusive: r.exclusive === 'yes', path: r.path, section: r.section })
    const groupId = new Map<string, string>()
    let order = ((await prisma.tagGroup.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0) + 1
    for (const [name, d] of groupDefs) {
      const slug = TAKE_OVER[name] ?? toTagName(name)
      const color = SECTION_COLOR[d.section] ?? PATH_STYLE[d.path].color
      const existing = await prisma.tagGroup.findUnique({ where: { slug } })
      if (existing) {
        const data: Record<string, unknown> = {}
        if (existing.name !== name) data.name = name
        if (existing.isExclusive !== d.exclusive) data.isExclusive = d.exclusive
        if (existing.typicalLevel !== 'MEDIA_ITEM') data.typicalLevel = 'MEDIA_ITEM'
        if (existing.domain !== 'CONTENT') data.domain = 'CONTENT'
        const meta = vocab.find((r) => r.group === name)!
        const choice = (meta.choice || (d.exclusive ? 'ONE' : 'MANY')) as 'ONE' | 'MANY'
        if (existing.composerChoice !== choice) data.composerChoice = choice
        const num = (v: string) => (v ? Number(v) : null)
        if ((existing.framingFill ?? null) !== num(meta.framing_fill)) data.framingFill = num(meta.framing_fill)
        if ((existing.framingTop ?? null) !== num(meta.framing_top)) data.framingTop = num(meta.framing_top)
        if ((existing.tileAspect ?? null) !== (meta.tile_aspect || null)) data.tileAspect = meta.tile_aspect || null
        const def = (meta.relevance_default || 'POSSIBLE') as 'TYPICAL' | 'POSSIBLE' | 'IMPOSSIBLE'
        if (existing.composerDefault !== def) data.composerDefault = def
        if (Object.keys(data).length) {
          note('group changes', `${existing.name} → ${JSON.stringify(data)}`)
          if (apply) await prisma.tagGroup.update({ where: { id: existing.id }, data })
        }
        groupId.set(name, existing.id)
      } else {
        note('new groups', `${name}${d.exclusive ? ' (exclusive)' : ''}`)
        if (apply) {
          const meta = vocab.find((r) => r.group === name)!
          const g = await prisma.tagGroup.create({
            data: {
              name, slug, color, domain: 'CONTENT', typicalLevel: 'MEDIA_ITEM', isExclusive: d.exclusive, sortOrder: order++,
              composerChoice: (meta.choice || (d.exclusive ? 'ONE' : 'MANY')) as 'ONE' | 'MANY',
              framingFill: meta.framing_fill ? Number(meta.framing_fill) : null,
              framingTop: meta.framing_top ? Number(meta.framing_top) : null,
              tileAspect: meta.tile_aspect || null,
              composerDefault: (meta.relevance_default || 'POSSIBLE') as 'TYPICAL' | 'POSSIBLE' | 'IMPOSSIBLE',
            },
          })
          groupId.set(name, g.id)
        }
      }
    }

    // ── 2. Tags ────────────────────────────────────────────────────────────
    const tagId = new Map<string, string>()
    const orderInGroup = new Map<string, number>()
    for (const r of vocab) {
      const gid = groupId.get(r.group)
      const renameFrom = r.origin.startsWith('rename:') ? r.origin.slice(7).replace(/\s*\(.*\)$/, '').trim() : null
      // A rename source wins; else the tag by its own name, anywhere in the catalogue
      const found =
        (renameFrom && (await prisma.tagDefinition.findFirst({ where: { slug: toTagName(renameFrom) }, select: { id: true, name: true, groupId: true, description: true } }))) ||
        (await prisma.tagDefinition.findFirst({ where: { slug: r.tag }, select: { id: true, name: true, groupId: true, description: true } }))
      const pos = (orderInGroup.get(r.group) ?? 0) + 1
      orderInGroup.set(r.group, pos)
      if (found) {
        if (found.name !== r.tag) {
          note('renames', `${found.name} → ${r.tag}`)
          if (apply) await updateTagDefinition(found.id, { name: r.tag })
        }
        if (gid && found.groupId !== gid) {
          note('moves', `${r.tag} → ${r.group}`)
          if (apply) await prisma.tagDefinition.update({ where: { id: found.id }, data: { groupId: gid } })
        } else if (!gid) note('moves', `${r.tag} → ${r.group} (new group)`)
        if (!found.description && r.definition) {
          note('definitions', r.tag)
          if (apply) await prisma.tagDefinition.update({ where: { id: found.id }, data: { description: r.definition } })
        }
        if (apply) await prisma.tagDefinition.update({ where: { id: found.id }, data: { sortOrder: pos, regionCatalogId: r.region_catalog || null } })
        tagId.set(r.tag, found.id)
      } else {
        note('new tags', `${r.group}: ${r.tag}`)
        if (apply && gid) {
          const t = await prisma.tagDefinition.create({
            data: { groupId: gid, name: r.tag, slug: r.tag, nameNorm: r.tag, description: r.definition || null, sortOrder: pos, regionCatalogId: r.region_catalog || null },
          })
          tagId.set(r.tag, t.id)
        }
      }
    }

    // A renamed tag may carry an alias that now equals its own name (view-back had from-behind)
    if (apply) {
      const dupes = await prisma.$executeRaw`
        DELETE FROM tag_alias a USING tag_definition t
        WHERE a."tagDefinitionId" = t.id AND a.slug = t.slug AND a.name = t.name`
      if (dupes) note('aliases', `${dupes} alias(es) equal to their tag's new name removed`)
    }

    // ── 3. Danbooru aliases ────────────────────────────────────────────────
    for (const r of vocab) {
      if (!r.danbooru || r.danbooru === r.tag) continue
      const id = tagId.get(r.tag)
      const have = id ? await prisma.tagAlias.findFirst({ where: { tagDefinitionId: id, name: r.danbooru } }) : null
      if (have) continue
      // Alias slugs are unique; a Danbooru name spelled like the tag shares the tag's slug,
      // so it is keyed apart — the query box already reads `a_b` as `a-b`
      const slug = `danbooru-${toTagName(r.danbooru)}`
      const taken = await prisma.tagAlias.findUnique({ where: { slug } })
      if (taken) continue
      note('danbooru aliases', `${r.tag} ← ${r.danbooru}`)
      if (apply && id) await prisma.tagAlias.create({ data: { tagDefinitionId: id, name: r.danbooru, nameNorm: r.danbooru.toLowerCase(), slug } })
    }

    // ── 4. Parents ─────────────────────────────────────────────────────────
    for (const r of vocab) {
      const parents = list(r.parents)
      if (!parents.length) continue
      const id = tagId.get(r.tag)
      const ids = parents.map((p) => tagId.get(p))
      if (!id || ids.some((x) => !x)) {
        if (apply) throw new Error(`Unknown tag or parent in ${r.tag}: ${parents.join(', ')}`)
        note('parents', `${r.tag} ⊂ ${parents.join(', ')}`)
        continue
      }
      const current = await prisma.tagDefinition.findUniqueOrThrow({ where: { id }, select: { parentId: true, extraParents: { select: { parentId: true } } } })
      const want = ids as string[]
      const extraWant = want.slice(1)
      const same = current.parentId === want[0] && extraWant.every((p) => current.extraParents.some((e) => e.parentId === p))
      if (same) continue
      note('parents', `${r.tag} ⊂ ${parents.join(', ')}`)
      if (!apply) continue
      if (current.parentId !== want[0]) await updateTagDefinition(id, { parentId: want[0] })
      const keep = current.extraParents.map((e) => e.parentId).filter((p) => p !== want[0])
      await setExtraParents(id, [...new Set([...extraWant, ...keep])])
    }

    // ── 5. Do not confuse with ─────────────────────────────────────────────
    for (const r of vocab) {
      for (const other of list(r.confusable)) {
        const a = tagId.get(r.tag)
        const b = tagId.get(other)
        if (!a || !b) {
          if (apply || !vocab.some((v) => v.tag === other)) note('confusables skipped', `${r.tag} ↔ ${other} (unknown)`)
          else if (r.tag < other) note('confusables', `${r.tag} ↔ ${other}`)
          continue
        }
        const [x, y] = a < b ? [a, b] : [b, a]
        const exists = await prisma.tagConfusable.findUnique({ where: { tagAId_tagBId: { tagAId: x, tagBId: y } } })
        if (exists) continue
        note('confusables', `${r.tag} ↔ ${other}`)
        if (apply) await prisma.tagConfusable.create({ data: { tagAId: x, tagBId: y } })
      }
    }

    // ── 6. State matrix ────────────────────────────────────────────────────
    for (const m of matrix) {
      const gid = groupId.get(m.state_group)
      const generic = tagId.get(m.generic_tag)
      note('state rules', `${m.state_group}: ${m.name_pattern} → ${m.applies_to}`)
      if (!apply) continue
      if (!gid || !generic) throw new Error(`State rule ${m.state_group}: group or generic tag missing`)
      const rule = await prisma.tagStateRule.upsert({
        where: { stateGroupId: gid },
        create: { stateGroupId: gid, genericTagId: generic, namePattern: m.name_pattern },
        update: { genericTagId: generic, namePattern: m.name_pattern },
      })
      await prisma.tagStateRuleTarget.deleteMany({ where: { ruleId: rule.id } })
      const overrides = new Map(
        list(m.irregular_names.replace(/,/g, ';')).map((x) => x.split('→').map((s) => s.trim()) as [string, string]),
      )
      for (const target of m.applies_to.split(',').map((x) => x.trim()).filter(Boolean)) {
        const tg = groupId.get(target)
        if (tg) await prisma.tagStateRuleTarget.create({ data: { ruleId: rule.id, groupId: tg } })
        else {
          const tt = tagId.get(target)
          if (!tt) throw new Error(`State rule ${m.state_group}: unknown target ${target}`)
          await prisma.tagStateRuleTarget.create({ data: { ruleId: rule.id, tagId: tt, nameOverride: overrides.get(target) ?? null } })
          overrides.delete(target)
        }
      }
      // Irregular names on a garment reached through its group
      for (const [garment, name] of overrides) {
        const tt = tagId.get(garment)
        if (!tt) throw new Error(`State rule ${m.state_group}: unknown garment ${garment}`)
        await prisma.tagStateRuleTarget.create({ data: { ruleId: rule.id, tagId: tt, nameOverride: name } })
      }
    }

    // ── 7. Composer paths and sections ─────────────────────────────────────
    // Tab order as decided (ADR-0042), whatever order the table lists them in
    const paths = [...new Set(vocab.map((r) => r.path))].sort((a, b) => PATH_ORDER.indexOf(a) - PATH_ORDER.indexOf(b))
    for (const [pi, path] of paths.entries()) {
      const style = PATH_STYLE[path]
      note('composer', `path ${path}`)
      if (!apply) continue
      const p = await prisma.composerPath.upsert({
        where: { name: path },
        create: { name: path, sortOrder: pi, tileAspect: style.tileAspect, pinned: style.pinned, personal: style.personal },
        update: { sortOrder: pi, tileAspect: style.tileAspect, personal: style.personal },
      })
      const sections = [...new Set(vocab.filter((r) => r.path === path).map((r) => r.section))]
      // The table is the starting structure: a section it no longer names goes (ADR-0043 retires Refinement)
      const stale = await prisma.composerSection.findMany({ where: { pathId: p.id, name: { notIn: sections } }, select: { id: true, name: true } })
      for (const st of stale) {
        note('composer', `section removed: ${path} › ${st.name}`)
        await prisma.composerSection.delete({ where: { id: st.id } })
      }
      for (const [si, section] of sections.entries()) {
        const s = await prisma.composerSection.upsert({
          where: { pathId_name: { pathId: p.id, name: section } },
          create: { pathId: p.id, name: section, sortOrder: si, kind: sectionKind(section), passable: PASSABLE.has(section) },
          update: { sortOrder: si, kind: sectionKind(section), passable: PASSABLE.has(section) },
        })
        const groups = [...new Set(vocab.filter((r) => r.path === path && r.section === section).map((r) => r.group))]
        await prisma.composerSectionGroup.deleteMany({ where: { sectionId: s.id, groupId: { notIn: groups.map((g) => groupId.get(g)!) } } })
        for (const [gi, g] of groups.entries()) {
          const gid = groupId.get(g)!
          await prisma.composerSectionGroup.upsert({
            where: { sectionId_groupId: { sectionId: s.id, groupId: gid } },
            create: { sectionId: s.id, groupId: gid, sortOrder: gi },
            update: { sortOrder: gi },
          })
        }
      }
    }

    // ── 8. Relevance (ADR-0043) ────────────────────────────────────────────
    if (apply) {
      const paths = new Map((await prisma.composerPath.findMany({ select: { id: true, name: true } })).map((p) => [p.name, p.id]))
      const tagBySlug = async (slug: string) => (await prisma.tagDefinition.findFirst({ where: { slug }, select: { id: true } }))?.id
      const groupBySlugOrName = async (name: string) =>
        (await prisma.tagGroup.findFirst({ where: { OR: [{ name }, { slug: TAKE_OVER[name] ?? toTagName(name) }] }, select: { id: true } }))?.id
      let n = 0
      for (const r of relevanceRows) {
        const ctx = tagId.get(r.context) ?? (await tagBySlug(r.context))
        const target =
          r.target_kind === 'PATH' ? paths.get(r.target) : r.target_kind === 'GROUP' ? groupId.get(r.target) ?? (await groupBySlugOrName(r.target)) : tagId.get(r.target) ?? (await tagBySlug(r.target))
        if (!ctx || !target) { note('relevance skipped', `${r.context} → ${r.target_kind} ${r.target}`); continue }
        await prisma.tagRelevance.upsert({
          where: { contextTagId_targetKind_targetId: { contextTagId: ctx, targetKind: r.target_kind, targetId: target } },
          create: { contextTagId: ctx, targetKind: r.target_kind, targetId: target, level: r.level },
          update: { level: r.level },
        })
        n++
      }
      note('relevance', `${n} rows`)
    } else note('relevance', `${relevanceRows.length} rows to write`)

    // ── 9. Presets (ADR-0042 S6): added, never overwritten ─────────────────
    for (const pr of presetRows) {
      if (await prisma.composerPreset.findUnique({ where: { name: pr.name } })) continue
      const names = pr.adds.split(',').map((x) => x.trim()).filter(Boolean)
      const ids: string[] = []
      for (const n of names) {
        const id = tagId.get(n) ?? (await prisma.tagDefinition.findFirst({ where: { slug: toTagName(n) }, select: { id: true } }))?.id
        if (!id && apply) throw new Error(`Preset ${pr.name}: unknown tag ${n}`)
        if (id) ids.push(id)
      }
      note('presets', `${pr.name}: ${names.join(', ')}`)
      if (!apply) continue
      const last = (await prisma.composerPreset.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? -1
      await prisma.composerPreset.create({ data: { name: pr.name, adds: ids, removes: [], sortOrder: last + 1 } })
    }

    // ── Report ─────────────────────────────────────────────────────────────
    for (const [kind, items] of Object.entries(log)) {
      console.log(`\n  ${kind} (${items.length}):`)
      for (const i of items.slice(0, 400)) console.log(`    ${i}`)
    }
    const empty = await prisma.tagGroup.findMany({ where: { tags: { none: {} } }, select: { name: true } })
    if (empty.length) console.log(`\n  empty groups (not removed): ${empty.map((g) => g.name).join(', ')}`)
  })
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
