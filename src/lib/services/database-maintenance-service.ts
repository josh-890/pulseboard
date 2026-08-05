import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { cascadeHardDeleteMediaItems } from "@/lib/services/cascade-helpers";
import { minioClient, getMinioBucket } from "@/lib/minio";
import type { PhotoVariants } from "@/lib/types";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import {
  refreshDashboardStats,
  refreshPersonAffiliations,
} from "@/lib/services/view-service";
import { rebuildAllCurrentState, verifyCurrentStateIntegrity } from "@/lib/services/current-state-service";
import { normalizeForSearch } from "@/lib/normalize";
import { refreshAllParticipantStatuses } from "@/lib/services/import/participant-status-service";
import { resolveNationalityToIoc } from "@/lib/constants/countries";
import { ICG_ID_EXTERNAL_RE, ICG_ID_LOCAL_RE, isSelfAssignedIcgId } from "@/lib/icg-id";
import { getCoverStats, listCoverFailures } from "@/lib/services/archive-cover-service";
import {
  getCatalogueAvatarStats,
  listCatalogueAvatarFailures,
} from "@/lib/services/catalogue-avatar-service";

export type MaintenanceResult = {
  found: number;
  fixed: number;
  details: string[];
};

/**
 * Find MediaItems with no file variants (null, empty object, or missing `original` key)
 * and hard-delete them along with all referencing rows.
 */
export async function findAndFixOrphanedMedia(): Promise<MaintenanceResult> {
  return prisma.$transaction(async (tx) => {
    // Find orphaned media items — variants is null, empty, or missing "original"
    const orphans = await tx.$queryRaw<
      Array<{ id: string; filename: string }>
    >`
      SELECT id, filename
      FROM "MediaItem"
      WHERE (
        variants IS NULL
        OR variants::text = '{}'
        OR variants::text = 'null'
        OR (NOT (variants ? 'original') AND NOT (variants ? 'master_4000'))
      )
    `;

    if (orphans.length === 0) {
      return { found: 0, fixed: 0, details: [] };
    }

    const ids = orphans.map((o) => o.id);

    // Cascade hard-delete: cleans up SetMediaItem, SkillEventMedia,
    // MediaCollectionItem, PersonMediaLink, and the MediaItems themselves
    await cascadeHardDeleteMediaItems(tx, ids);

    return {
      found: orphans.length,
      fixed: orphans.length,
      details: orphans.map((o) => o.filename),
    };
  });
}

/**
 * Find identical media files (same SHA-256 hash) uploaded multiple times to the
 * same session.  Keeps the oldest MediaItem per group and:
 *   - Reassigns PersonMediaLinks from dupe → original (deletes conflicts)
 *   - Deletes SetMediaItem rows pointing to dupe (skips if original already in set)
 *   - Deletes MediaCollectionItem rows pointing to dupe (skips if original already in collection)
 *   - Hard-deletes the duplicate MediaItem
 */
export async function findAndFixDuplicateMedia(): Promise<MaintenanceResult> {
  return prisma.$transaction(async (tx) => {
    // Groups of identical files in the same session
    const groups = await tx.$queryRaw<
      Array<{ sessionId: string; hash: string; cnt: bigint }>
    >`
      SELECT "sessionId", hash, COUNT(*) as cnt
      FROM "MediaItem"
      WHERE hash IS NOT NULL
        AND "sessionId" IS NOT NULL
      GROUP BY "sessionId", hash
      HAVING COUNT(*) > 1
    `;

    if (groups.length === 0) {
      return { found: 0, fixed: 0, details: [] };
    }

    let totalFixed = 0;
    const details: string[] = [];

    for (const group of groups) {
      // All items in this group, oldest first
      const items = await tx.$queryRaw<
        Array<{ id: string; filename: string; createdAt: Date }>
      >`
        SELECT id, filename, "createdAt"
        FROM "MediaItem"
        WHERE "sessionId" = ${group.sessionId}
          AND hash = ${group.hash}
        ORDER BY "createdAt" ASC
      `;

      const original = items[0];
      const dupes = items.slice(1);

      for (const dupe of dupes) {
        // --- PersonMediaLink: reassign dupe → original ---
        const dupeLinks = await tx.personMediaLink.findMany({
          where: { mediaItemId: dupe.id },
        });

        for (const link of dupeLinks) {
          // Check if original already has this (personId, usage) combo
          const conflict = await tx.personMediaLink.findFirst({
            where: {
              personId: link.personId,
              mediaItemId: original.id,
              usage: link.usage,
            },
          });

          if (conflict) {
            // Conflict — delete the dupe link
            await tx.personMediaLink.delete({
              where: { id: link.id },
            });
          } else {
            // Reassign to original
            await tx.personMediaLink.update({
              where: { id: link.id },
              data: { mediaItemId: original.id },
            });
          }
        }

        // --- SetMediaItem: delete dupe rows ---
        const dupeSetItems = await tx.$queryRaw<
          Array<{ setId: string }>
        >`
          SELECT "setId" FROM "SetMediaItem"
          WHERE "mediaItemId" = ${dupe.id}
        `;

        for (const si of dupeSetItems) {
          // Check if original already in this set
          const existing = await tx.$queryRaw<Array<{ setId: string }>>`
            SELECT "setId" FROM "SetMediaItem"
            WHERE "setId" = ${si.setId} AND "mediaItemId" = ${original.id}
          `;
          if (existing.length === 0) {
            // Move to original
            await tx.$executeRaw`
              UPDATE "SetMediaItem"
              SET "mediaItemId" = ${original.id}
              WHERE "setId" = ${si.setId} AND "mediaItemId" = ${dupe.id}
            `;
          } else {
            // Original already in set — just delete dupe row
            await tx.$executeRaw`
              DELETE FROM "SetMediaItem"
              WHERE "setId" = ${si.setId} AND "mediaItemId" = ${dupe.id}
            `;
          }
        }

        // --- MediaCollectionItem: delete dupe rows ---
        const dupeCollItems = await tx.$queryRaw<
          Array<{ collectionId: string }>
        >`
          SELECT "collectionId" FROM "MediaCollectionItem"
          WHERE "mediaItemId" = ${dupe.id}
        `;

        for (const ci of dupeCollItems) {
          const existing = await tx.$queryRaw<
            Array<{ collectionId: string }>
          >`
            SELECT "collectionId" FROM "MediaCollectionItem"
            WHERE "collectionId" = ${ci.collectionId} AND "mediaItemId" = ${original.id}
          `;
          if (existing.length === 0) {
            await tx.$executeRaw`
              UPDATE "MediaCollectionItem"
              SET "mediaItemId" = ${original.id}
              WHERE "collectionId" = ${ci.collectionId} AND "mediaItemId" = ${dupe.id}
            `;
          } else {
            await tx.$executeRaw`
              DELETE FROM "MediaCollectionItem"
              WHERE "collectionId" = ${ci.collectionId} AND "mediaItemId" = ${dupe.id}
            `;
          }
        }

        // --- Hard-delete the duplicate MediaItem ---
        await tx.mediaItem.delete({
          where: { id: dupe.id },
        });
      }

      totalFixed += dupes.length;
      details.push(
        `${original.filename}: removed ${dupes.length} duplicate(s)`,
      );
    }

    return {
      found: groups.length,
      fixed: totalFixed,
      details,
    };
  });
}

/**
 * Find duplicate PersonMediaLink rows (same personId + mediaItemId)
 * and delete all but the oldest per group.
 */
export async function findAndFixDuplicatePersonMediaLinks(): Promise<MaintenanceResult> {
  return prisma.$transaction(async (tx) => {
    // Find groups with duplicates
    const dupes = await tx.$queryRaw<
      Array<{ personId: string; mediaItemId: string; cnt: bigint }>
    >`
      SELECT "personId", "mediaItemId", COUNT(*) as cnt
      FROM "PersonMediaLink"
      GROUP BY "personId", "mediaItemId"
      HAVING COUNT(*) > 1
    `;

    if (dupes.length === 0) {
      return { found: 0, fixed: 0, details: [] };
    }

    let totalFixed = 0;
    const details: string[] = [];

    for (const dupe of dupes) {
      // Get all rows for this pair, oldest first
      const rows = await tx.personMediaLink.findMany({
        where: {
          personId: dupe.personId,
          mediaItemId: dupe.mediaItemId,
        },
        orderBy: { createdAt: "asc" },
      });

      // Keep the first (oldest), delete the rest
      const toDelete = rows.slice(1);
      await tx.personMediaLink.deleteMany({
        where: { id: { in: toDelete.map((r) => r.id) } },
      });

      totalFixed += toDelete.length;
      details.push(
        `person ${dupe.personId.slice(0, 8)}… / media ${dupe.mediaItemId.slice(0, 8)}…: removed ${toDelete.length} duplicate(s)`,
      );
    }

    return {
      found: dupes.length,
      fixed: totalFixed,
      details,
    };
  });
}

// Static asset prefixes to ignore when checking for orphans (not media uploads)
const STATIC_PREFIXES = ["staging/", "body/", "flags/"];

/**
 * Cross-check every MediaItem's variant keys against MinIO.
 * Finds DB rows whose files are entirely missing (victim of the shallow-copy bug
 * or any other storage loss) and hard-deletes them.
 * Orphan MinIO objects (no DB row) are reported but not deleted.
 */
export async function auditMinioConsistency(): Promise<MaintenanceResult> {
  const bucket = getMinioBucket();

  // List all MinIO objects — one pass, then do in-memory lookups
  const minioKeys = new Set<string>();
  let continuationToken: string | undefined;
  do {
    const res = await minioClient.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: continuationToken }),
    );
    for (const obj of res.Contents ?? []) {
      if (obj.Key) minioKeys.add(obj.Key);
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);

  // Fetch all MediaItems
  const rows = await prisma.$queryRaw<Array<{ id: string; filename: string; variants: Record<string, string | undefined | null> | null }>>`
    SELECT id, filename, variants FROM "MediaItem"
  `;

  // Find fully broken items (every variant key missing from MinIO)
  const brokenIds: string[] = [];
  const details: string[] = [];
  let orphanCount = 0;

  const refKeys = new Set<string>();
  for (const row of rows) {
    if (!row.variants) continue;
    for (const v of Object.values(row.variants)) {
      if (typeof v === "string" && v.length > 0) refKeys.add(v);
    }
  }

  for (const row of rows) {
    const variantKeys = row.variants
      ? Object.values(row.variants).filter((v): v is string => typeof v === "string" && v.length > 0)
      : [];

    if (variantKeys.length === 0) {
      brokenIds.push(row.id);
      details.push(`${row.filename} (no variants)`);
      continue;
    }

    const missing = variantKeys.filter((k) => !minioKeys.has(k));
    if (missing.length === variantKeys.length) {
      brokenIds.push(row.id);
      details.push(`${row.filename} (all ${variantKeys.length} variant files missing)`);
    }
  }

  // Count orphan MinIO objects (informational — not deleted)
  for (const key of minioKeys) {
    if (STATIC_PREFIXES.some((p) => key.startsWith(p))) continue;
    if (!refKeys.has(key)) orphanCount++;
  }

  if (orphanCount > 0) {
    details.push(`${orphanCount} orphaned MinIO object(s) found (use CLI script to clean)`);
  }

  if (brokenIds.length === 0) {
    return { found: 0, fixed: 0, details: orphanCount > 0 ? details : [] };
  }

  // Cascade-delete broken DB rows — no deleteMediaFiles() needed (files already gone)
  await prisma.$transaction(async (tx) => {
    await cascadeHardDeleteMediaItems(tx, brokenIds);
  });

  return { found: brokenIds.length, fixed: brokenIds.length, details };
}

/**
 * Retry deleting MinIO files that failed to clean up at delete-time.
 * Marks each key as resolved after a successful deletion attempt.
 */
export async function processOrphanedStorageKeys(): Promise<MaintenanceResult> {
  const orphanedKeys = await prisma.orphanedStorageKey.findMany({
    where: { resolvedAt: null },
  });

  if (orphanedKeys.length === 0) {
    return { found: 0, fixed: 0, details: [] };
  }

  const { deleteMediaFiles } = await import("@/lib/media-upload");
  // deleteMediaFiles expects PhotoVariants[]; wrap each key in a minimal variants object
  const variantsList: PhotoVariants[] = orphanedKeys.map(k => ({ original: k.key }));
  await deleteMediaFiles(variantsList);

  await prisma.orphanedStorageKey.updateMany({
    where: { id: { in: orphanedKeys.map(k => k.id) } },
    data: { resolvedAt: new Date() },
  });

  return {
    found: orphanedKeys.length,
    fixed: orphanedKeys.length,
    details: orphanedKeys.map(k => k.key),
  };
}

/**
 * Refresh all materialized views, reporting per-view success/failure.
 */
export async function refreshAllMaterializedViews(): Promise<MaintenanceResult> {
  const views = [
    { name: "mv_dashboard_stats", fn: refreshDashboardStats },
    { name: "mv_person_affiliations", fn: refreshPersonAffiliations },
  ];

  const details: string[] = [];
  let successCount = 0;

  for (const view of views) {
    try {
      await view.fn();
      successCount++;
      details.push(`${view.name}: refreshed`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      details.push(`${view.name}: FAILED — ${message}`);
    }
  }

  return {
    found: views.length,
    fixed: successCount,
    details,
  };
}

/**
 * Rebuild the entire PersonCurrentState cache from scratch (ADR-0003).
 * Use after bulk operations or a change to the fold logic.
 */
export async function rebuildCurrentStateCache(): Promise<MaintenanceResult> {
  const count = await rebuildAllCurrentState();
  return {
    found: count,
    fixed: count,
    details: [`Rebuilt PersonCurrentState for ${count} person(s).`],
  };
}

/**
 * Integrity check for the PersonCurrentState cache: recompute every row and
 * report which had drifted from their correct value. A drift means a write
 * path mutated a fold input without recomputing — a bug. Self-healing.
 */
export async function checkCurrentStateIntegrity(): Promise<MaintenanceResult> {
  const { checked, mismatches } = await verifyCurrentStateIntegrity();
  return {
    found: mismatches.length,
    fixed: mismatches.length,
    details:
      mismatches.length === 0
        ? [`Checked ${checked} person(s) — cache consistent, no drift.`]
        : [
            `Checked ${checked} person(s) — ${mismatches.length} had drifted and were corrected.`,
            "A drift means a write path skipped recomputePersonCurrentState — investigate.",
            ...mismatches.slice(0, 20).map((id) => `drifted: ${id}`),
          ],
  };
}

/**
 * ADR-0026 audit. Read-only — reports, never rewrites. Every finding needs a
 * human decision: whether an odd-shaped ID is a typo or a legacy value worth
 * keeping is not something a script can judge, and rewriting an ICG-ID has to
 * go through updatePersonIcgId so the ImportBatch/StagingSet cascades run.
 */
export async function auditIcgIdOrigins(): Promise<MaintenanceResult> {
  const [persons, contacts] = await Promise.all([
    prisma.person.findMany({
      select: { icgId: true, aliases: { where: { isCommon: true }, select: { name: true }, take: 1 } },
    }),
    prisma.contact.findMany({
      where: { icgId: { not: null } },
      select: { icgId: true, name: true },
    }),
  ]);

  const details: string[] = [];
  const selfAssigned = persons.filter((p) => isSelfAssignedIcgId(p.icgId));
  details.push(
    `${persons.length} person(s): ${persons.length - selfAssigned.length} external, ${selfAssigned.length} self-assigned.`,
  );

  const isWellFormed = (icgId: string) =>
    ICG_ID_EXTERNAL_RE.test(icgId) || ICG_ID_LOCAL_RE.test(icgId);

  // Malformed = matches neither namespace. Catches the marker at a wrong
  // offset, and the HTML-polluted values the import parser can let through
  // (it captures whatever sits in the filename parentheses, unvalidated).
  const malformedPersons = persons.filter((p) => !isWellFormed(p.icgId));
  const malformedContacts = contacts.filter((c) => c.icgId && !isWellFormed(c.icgId));

  // A contact is a person harvested from an external source, so one carrying
  // the reserved local marker means the convention has been violated upstream.
  const markedContacts = contacts.filter((c) => c.icgId && isSelfAssignedIcgId(c.icgId));

  for (const p of malformedPersons) {
    details.push(`malformed person ICG-ID: ${p.icgId} (${p.aliases[0]?.name ?? "no common alias"})`);
  }
  for (const c of markedContacts) {
    details.push(`contact carries the reserved '@' marker: ${c.icgId} (${c.name})`);
  }
  for (const c of malformedContacts) {
    if (markedContacts.includes(c)) continue; // already reported above
    details.push(`malformed contact ICG-ID: ${c.icgId} (${c.name})`);
  }

  const found = malformedPersons.length + malformedContacts.length + markedContacts.length;
  if (found === 0) details.push("All ICG-IDs match either the external or the self-assigned shape.");
  else details.push("Nothing was changed — correct a person's ICG-ID via the Change ICG-ID dialog.");

  return { found, fixed: 0, details };
}

/**
 * Archive cover coverage + the per-folder defect list. Read-only.
 *
 * The cover agent deliberately fails one folder at a time and records why, so a
 * single corrupt image can never derail a 34k-folder run. This is where those
 * failures become actionable: each line names the folder and the reason, so the
 * offending file can be cleaned or re-encoded and the agent re-run with
 * -RetryFailed. Nothing is fixed here — a damaged source needs a human.
 */
export async function auditArchiveCovers(): Promise<MaintenanceResult> {
  const [stats, failures] = await Promise.all([getCoverStats(), listCoverFailures()]);
  const details: string[] = [
    `${stats.total} folder(s) on disk: ${stats.withCover} with a cover, ${stats.pending} not yet attempted, ${stats.failed} failed.`,
  ];
  for (const f of failures) details.push(`${f.fullPath} — ${f.error}`);
  if (stats.failed > failures.length) {
    details.push(`(… ${stats.failed - failures.length} more not listed)`);
  }
  if (stats.failed === 0) {
    details.push(
      stats.pending > 0
        ? "No failures. Run scripts/archive-cover.ps1 to cover the remaining folders."
        : "Every folder on disk has a cover.",
    );
  } else {
    // Two distinct causes need two distinct remedies, and "re-encode" is useless
    // advice for a folder that simply has no image in it.
    details.push(
      'Folders reading "No image file found" hold no picture at all — typically a videoset ' +
        "whose frames were never extracted; extract one or drop a cover file in. Any other " +
        "reason is a damaged image: clean or re-encode it.",
    );
    details.push("Then re-run archive-cover.ps1 -RetryFailed, or delete the cover in the archive tree.");
  }
  return { found: stats.failed, fixed: 0, details };
}

/**
 * Archive short codes that are not defined as a Channel (read-only).
 *
 * Not a coverage problem — the catalogue join keys on date + title, so an
 * undefined channel still gets its suggestions. It is a **guard** problem: the
 * cross-label demotion in the join resolves the folder's short code to a Channel
 * to find its owning Label (ADR-0020), and an unresolvable code makes that check
 * fail open. A suggestion that was never compared against a label then looks
 * exactly like one that passed. `UNKNOWN_CHANNEL` marks those at the suggestion
 * level; this check is the other half — it names the codes so the gap can be
 * closed at the source instead of being carried on every suggestion.
 *
 * Channel-scoped aliases (ADR-0024) need a Channel row too, and confirmation
 * (slice 5) cannot promote a set on a channel that does not exist.
 */
export async function checkUndefinedArchiveChannels(): Promise<MaintenanceResult> {
  const [channels, folders] = await Promise.all([
    prisma.channel.findMany({ select: { name: true, shortName: true, labelId: true } }),
    prisma.archiveFolder.findMany({
      where: { missingOnDisk: false },
      select: { parsedShortName: true, archiveLink: { select: { setId: true } } },
    }),
  ]);

  // A short code is "known" under either its code or its full name — the archive
  // folder names use the code, but hand-made folders sometimes spell it out.
  const known = new Set<string>();
  for (const c of channels) {
    known.add(normalizeForSearch(c.name));
    if (c.shortName) known.add(normalizeForSearch(c.shortName));
  }

  const byCode = new Map<string, { total: number; orphan: number }>();
  let noCode = 0;
  for (const f of folders) {
    if (!f.parsedShortName) {
      noCode++;
      continue;
    }
    const code = f.parsedShortName.toUpperCase();
    const entry = byCode.get(code) ?? { total: 0, orphan: 0 };
    entry.total++;
    if (!f.archiveLink?.setId) entry.orphan++;
    byCode.set(code, entry);
  }

  const undefinedCodes = [...byCode.entries()]
    .filter(([code]) => !known.has(normalizeForSearch(code)))
    .sort((a, b) => b[1].total - a[1].total);
  const affected = undefinedCodes.reduce((sum, [, e]) => sum + e.total, 0);

  const details: string[] = [
    `${folders.length.toLocaleString()} archive folder(s) on disk across ${byCode.size} short code(s); ` +
      `${channels.length} channel(s) defined.`,
  ];
  for (const [code, e] of undefinedCodes.slice(0, 40)) {
    details.push(`${code} — ${e.total} folder(s), ${e.orphan} still unlinked`);
  }
  if (undefinedCodes.length > 40) {
    details.push(`(… ${undefinedCodes.length - 40} more codes not listed)`);
  }
  if (undefinedCodes.length === 0) {
    details.push("Every short code in the archive resolves to a defined Channel.");
  } else {
    details.push(
      `${affected.toLocaleString()} folder(s) sit behind an undefined channel. Their attribution ` +
        "suggestions carry UNKNOWN_CHANNEL because the cross-label check had nothing to compare " +
        "against — define the channel (with its short code and owning Label) and re-run " +
        "scripts/catalogue-join.ts --post to clear it.",
    );
  }
  if (noCode > 0) {
    details.push(`${noCode} folder(s) carry no short code at all — their names do not follow the canonical pattern.`);
  }

  // Two shapes that break the same guards even when the Channel exists.
  const missingShort = channels.filter((c) => !c.shortName);
  const missingLabel = channels.filter((c) => !c.labelId);
  if (missingShort.length > 0) {
    details.push(
      `${missingShort.length} channel(s) have no short code, so an archive folder can never resolve to them: ` +
        missingShort.slice(0, 15).map((c) => c.name).join(", "),
    );
  }
  if (missingLabel.length > 0) {
    details.push(
      `${missingLabel.length} channel(s) have no owning Label, so the cross-label check fails open for them too: ` +
        missingLabel.slice(0, 15).map((c) => c.shortName ?? c.name).join(", "),
    );
  }

  return {
    found: undefinedCodes.length + missingShort.length + missingLabel.length,
    fixed: 0,
    details,
  };
}

/**
 * Catalogue portrait coverage (read-only).
 *
 * The attribution workbench compares an archive cover against a person's face,
 * and it can only do that where a face exists. Before these portraits were
 * imported, 84% of suggested identities had none — they are the ones with no
 * Person and no Contact to hang an image off, which is exactly the population
 * the operator has nothing else to go on for.
 *
 * The agent fails one person at a time and records why, so a single corrupt file
 * never derails a 39,000-image run. This is where those failures become
 * actionable — the promise the agent's own closing message makes.
 */
export async function auditCatalogueAvatars(): Promise<MaintenanceResult> {
  const [stats, failures] = await Promise.all([
    getCatalogueAvatarStats(),
    listCatalogueAvatarFailures(),
  ]);

  const details: string[] = [
    `${stats.withImage.toLocaleString()} portrait(s) stored; ${stats.failed} could not be read.`,
  ];
  for (const f of failures) details.push(`${f.icgId} — ${f.error}`);
  if (stats.failed > failures.length) {
    details.push(`(… ${stats.failed - failures.length} more not listed)`);
  }

  if (stats.failed === 0) {
    details.push(
      stats.withImage === 0
        ? "No portraits yet. Run scripts/catalogue-avatar.ps1 on the catalogue host."
        : "Every portrait the agent attempted was readable.",
    );
  } else {
    // The established rule, and the reason it is not negotiable: a silently
    // mangled portrait becomes the face someone is compared against.
    details.push(
      "These are damaged images. Clean or re-encode the listed files at the source — " +
        "never loosen the decoder — then re-run catalogue-avatar.ps1 -RetryFailed.",
    );
  }

  return { found: stats.failed, fixed: 0, details };
}

type ParticipantEntry = { name: string; icgId: string; url?: string };
type ParticipantStatus = { name: string; icgId: string; status: string };

/**
 * Audit and repair StagingSet ICG-ID consistency across three passes:
 *
 * 1. subjectIcgId drift — where subjectPersonId is set but subjectIcgId
 *    no longer matches the linked person's current icgId.
 * 2. participantIcgIds/participants sync — ensures the query-index array
 *    matches the icgIds stored in the participants JSON.
 * 3. Name-based audit — 'new' participants whose stored icgId matches no
 *    person, but whose name exactly matches a single PersonAlias. Reports
 *    candidates only — never auto-applies. Name matches are inherently
 *    ambiguous (a unique match today may not be unique tomorrow). Correct
 *    these manually via the person edit sheet.
 *
 * Ends with a full participantStatuses refresh.
 */
export async function reconcileStagingSetParticipants(): Promise<MaintenanceResult> {
  const details: string[] = [];
  let found = 0;
  let fixed = 0;

  // ── Pass 1: subjectIcgId drift ──────────────────────────────────────────
  const linkedSets = await prisma.stagingSet.findMany({
    where: { subjectPersonId: { not: null }, status: { notIn: ["SKIPPED"] } },
    select: { id: true, subjectIcgId: true, subjectPersonId: true, subjectPerson: { select: { icgId: true } } },
  });

  for (const s of linkedSets) {
    const correctIcgId = s.subjectPerson?.icgId;
    if (correctIcgId && s.subjectIcgId !== correctIcgId) {
      found++;
      await prisma.stagingSet.update({
        where: { id: s.id },
        data: { subjectIcgId: correctIcgId },
      });
      details.push(`${s.id}: subjectIcgId corrected ${s.subjectIcgId} → ${correctIcgId}`);
      fixed++;
    }
  }

  // ── Pass 2: participantIcgIds / participants JSON sync ──────────────────
  const allSets = await prisma.stagingSet.findMany({
    where: { participants: { not: Prisma.JsonNullValueFilter.DbNull }, status: { notIn: ["SKIPPED"] } },
    select: { id: true, participants: true, participantIcgIds: true },
  });

  for (const s of allSets) {
    const entries = s.participants as ParticipantEntry[];
    if (!Array.isArray(entries)) continue;

    const idsFromJson = entries.map(p => p.icgId);
    const stored = [...s.participantIcgIds].sort();
    const expected = [...idsFromJson].sort();

    if (JSON.stringify(stored) !== JSON.stringify(expected)) {
      found++;
      await prisma.stagingSet.update({
        where: { id: s.id },
        data: { participantIcgIds: idsFromJson },
      });
      details.push(`${s.id}: participantIcgIds re-synced from participants JSON`);
      fixed++;
    }
  }

  // ── Pass 3: name-based resolution for 'new' participants ───────────────
  const setsWithNew = await prisma.stagingSet.findMany({
    where: { participantStatuses: { not: Prisma.JsonNullValueFilter.DbNull }, status: { notIn: ["SKIPPED"] } },
    select: { id: true, participants: true, participantIcgIds: true, participantStatuses: true },
  });

  // Collect all unique icgIds in 'new' status entries
  const unknownIcgIds = new Set<string>();
  for (const s of setsWithNew) {
    const statuses = s.participantStatuses as ParticipantStatus[];
    if (!Array.isArray(statuses)) continue;
    for (const st of statuses) {
      if (st.status === "new") unknownIcgIds.add(st.icgId);
    }
  }

  if (unknownIcgIds.size > 0) {
    // For each unknown icgId, find its name from any set's participants JSON
    const icgIdToName = new Map<string, string>();
    for (const s of setsWithNew) {
      const entries = s.participants as ParticipantEntry[];
      if (!Array.isArray(entries)) continue;
      for (const p of entries) {
        if (unknownIcgIds.has(p.icgId) && !icgIdToName.has(p.icgId)) {
          icgIdToName.set(p.icgId, p.name);
        }
      }
    }

    // Batch-lookup all candidate name norms
    const nameNorms = Array.from(icgIdToName.values()).map(n => normalizeForSearch(n));
    const aliases = await prisma.personAlias.findMany({
      where: { nameNorm: { in: nameNorms, not: null } },
      select: { nameNorm: true, person: { select: { icgId: true } } },
    });
    // Only work with rows that have both fields non-null
    const validAliases = aliases.filter(
      (a): a is { nameNorm: string; person: { icgId: string } } =>
        a.nameNorm !== null && a.person !== null,
    );

    // Build: nameNorm → icgId (only keep unambiguous single matches)
    const nameNormToCorrectIcgId = new Map<string, string>();
    const nameNormCount = new Map<string, number>();
    for (const a of validAliases) {
      nameNormCount.set(a.nameNorm, (nameNormCount.get(a.nameNorm) ?? 0) + 1);
    }
    for (const a of validAliases) {
      if (nameNormCount.get(a.nameNorm) === 1) {
        nameNormToCorrectIcgId.set(a.nameNorm, a.person.icgId);
      }
    }

    // Report candidates — do NOT auto-apply. Name matches are ambiguous:
    // a unique match today can become ambiguous tomorrow when a second person
    // with the same name is imported. Corrections must be made manually via
    // the person edit sheet (correct the wrong icgId) or the import flow.
    for (const [wrongIcgId, name] of icgIdToName) {
      const norm = normalizeForSearch(name);
      const correctIcgId = nameNormToCorrectIcgId.get(norm);
      if (correctIcgId && correctIcgId !== wrongIcgId) {
        found++;
        details.push(`CANDIDATE (not auto-fixed): participant "${name}" stored as ${wrongIcgId} — person found with icgId ${correctIcgId}. Correct via person edit sheet.`);
      }
    }
  }

  // ── Pass 4: full participant status refresh ─────────────────────────────
  const refreshed = await refreshAllParticipantStatuses();
  if (refreshed > 0) {
    details.push(`${refreshed} staging set(s) had participant statuses refreshed`);
  }

  return { found, fixed, details };
}

/**
 * Canonical nationality format is the 3-letter IOC code (e.g. "GER", "USA").
 * Find Person records still holding a 2-letter ISO alpha-2 (or any non-IOC)
 * value and convert them to IOC, so they match the edit form + import.
 */
export async function fixImportedNationalityCodes(): Promise<MaintenanceResult> {
  const persons = await prisma.person.findMany({
    where: {
      nationality: { not: null },
    },
    select: { id: true, nationality: true },
  });

  // Anything that isn't already a valid 3-letter IOC code needs converting.
  const toFix = persons.filter(
    (p) => p.nationality && resolveNationalityToIoc(p.nationality) !== p.nationality,
  );

  const details: string[] = [];
  let fixed = 0;

  for (const p of toFix) {
    const ioc = resolveNationalityToIoc(p.nationality!);
    if (ioc && ioc !== p.nationality) {
      await prisma.person.update({
        where: { id: p.id },
        data: { nationality: ioc },
      });
      details.push(`Person ${p.id}: nationality ${p.nationality} → ${ioc}`);
      fixed++;
    } else {
      details.push(`Person ${p.id}: nationality ${p.nationality} — no IOC mapping found, skipped`);
    }
  }

  return { found: toFix.length, fixed, details };
}
