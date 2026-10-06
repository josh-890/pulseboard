import { reconcileStub } from "@/lib/archive-stub";
import type { CatalogTag } from "@/lib/tag-query";
import { toTagName } from "@/lib/tag-names";

// Archive folder tags on disk (ADR-0034). A tag is an empty file in the folder's
// `.pulseboard\` named `#name` — or `#group=name` when two groups share the name
// (`:` is not allowed in Windows file names). Pure, so the rules are pinned by
// tests and shared by the scan ingest and the write phase.

export type ParsedTagMarker = { raw: string; group: string | null; name: string };

/** Explorer's "New → Text Document" appends an extension; tolerate any short one */
const EXTENSION = /\.[a-z0-9]{1,4}$/i;

/** `#outdoor.txt` → { group: null, name: "outdoor" }; null when not a tag marker */
export function parseTagMarker(fileName: string): ParsedTagMarker | null {
  const trimmed = fileName.trim();
  if (!trimmed.startsWith("#")) return null;
  const raw = trimmed.replace(EXTENSION, "");
  const body = raw.slice(1).replace(/_/g, " ").trim();
  if (!body) return null;
  const eq = body.indexOf("=");
  if (eq >= 0) {
    const group = body.slice(0, eq).trim().toLowerCase();
    const name = body.slice(eq + 1).trim().toLowerCase();
    if (!group || !name) return null;
    return { raw, group, name };
  }
  return { raw, group: null, name: body.toLowerCase() };
}

/** `slugify` of the catalogue — the tag-name rule */
const slug = toTagName;

function matches(t: CatalogTag, m: ParsedTagMarker): boolean {
  if (m.group !== null) {
    const g = m.group;
    if (t.groupSlug !== g && t.groupSlug !== slug(g) && (t.groupName ?? "").toLowerCase() !== g) return false;
  }
  const n = m.name;
  return (
    t.name.toLowerCase() === n ||
    t.slug === n ||
    t.slug === slug(n) ||
    t.aliases.some((a) => a.toLowerCase() === n)
  );
}

export type MarkerResolution = {
  /** Tag ids the disk asserts (conflicting exclusive groups left out) */
  ids: string[];
  /** Markers no tag answers to — or several do, or a tag of the wrong domain */
  unknown: string[];
  /** Markers of an exclusive group that holds more than one marker */
  conflicts: string[];
  /** Groups in conflict — left out of the reconciliation for this run */
  conflictGroupIds: string[];
};

const FOLDER_DOMAINS = new Set(["CONTENT", "ANY"]);

const inFolderDomain = (t: CatalogTag) => !t.domain || FOLDER_DOMAINS.has(t.domain);

/**
 * The tags a marker may mean. The group part only tells shared names apart: when
 * it names no group any more (the group was renamed) but the name alone is
 * unambiguous, the name decides — a group rename must not orphan its markers.
 */
function candidates(m: ParsedTagMarker, catalog: CatalogTag[]): CatalogTag[] {
  const qualified = catalog.filter((t) => matches(t, m)).filter(inFolderDomain);
  if (qualified.length > 0 || m.group === null) return qualified;
  const byName = catalog.filter((t) => matches(t, { ...m, group: null })).filter(inFolderDomain);
  return byName.length === 1 ? byName : [];
}

/** Map a folder's marker file names onto tag ids */
export function resolveTagMarkers(fileNames: string[], catalog: CatalogTag[]): MarkerResolution {
  const unknown: string[] = [];
  const found: { tag: CatalogTag; raw: string }[] = [];
  for (const f of fileNames) {
    const m = parseTagMarker(f);
    if (!m) continue;
    const allowed = candidates(m, catalog);
    if (allowed.length !== 1) unknown.push(m.raw);
    else if (!found.some((x) => x.tag.id === allowed[0].id)) found.push({ tag: allowed[0], raw: m.raw });
  }

  const perExclusiveGroup = new Map<string, { tag: CatalogTag; raw: string }[]>();
  for (const f of found) {
    if (!f.tag.isExclusive) continue;
    perExclusiveGroup.set(f.tag.groupId, [...(perExclusiveGroup.get(f.tag.groupId) ?? []), f]);
  }
  const conflictGroupIds = [...perExclusiveGroup.entries()].filter(([, v]) => v.length > 1).map(([g]) => g);
  const inConflict = (f: { tag: CatalogTag }) => conflictGroupIds.includes(f.tag.groupId);

  return {
    ids: found.filter((f) => !inConflict(f)).map((f) => f.tag.id),
    unknown,
    conflicts: found.filter(inConflict).map((f) => f.raw),
    conflictGroupIds,
  };
}

/** Characters Windows does not allow in a file name */
const ILLEGAL = /[\\/:*?"<>|]/;

/**
 * The marker file name the agent writes for a tag: `#Name` when the name is
 * unique in the catalogue, `#group=Name` when another group has it too. A name
 * Windows cannot store falls back to the tag's slug.
 */
export function canonicalTagMarker(tag: CatalogTag, catalog: CatalogTag[]): string {
  const name = ILLEGAL.test(tag.name) ? tag.slug : tag.name;
  const shared = catalog.some((t) => t.id !== tag.id && t.name.toLowerCase() === tag.name.toLowerCase());
  return shared ? `#${tag.groupSlug}=${name}` : `#${name}`;
}

export type TagReconcileInput = {
  diskNow: string[];
  /** null = the disk was never reported for this folder */
  lastSeen: string[] | null;
  appNow: string[];
  /**
   * The folder holds markers the app cannot place. One of them may be a tag whose
   * name or group was renamed, so a tag missing from the disk is not taken as
   * deleted until they are resolved — a missing tag is held, never dropped.
   */
  holdDiskRemovals?: boolean;
};

export type TagReconcileResult = {
  /** Tags the app adopts from the disk */
  appAdd: string[];
  /** Tags the app drops because the disk dropped them */
  appRemove: string[];
  /** What the disk should hold after this run */
  diskWanted: string[];
  /** Store as the new remembered disk state */
  lastSeenNext: string[];
};

/**
 * Per-tag three-way reconciliation — the ADR-0032 STUB rule applied to each tag's
 * presence. Disk changed, app did not → the app follows; app changed, disk did
 * not → the disk follows; both changed from the same value → they agree. Never
 * reported (lastSeen null) → both sides are united, nothing is removed. With
 * `holdDiskRemovals` a tag the disk last carried counts as still there.
 */
export function reconcileTagSet({ diskNow, lastSeen, appNow, holdDiskRemovals }: TagReconcileInput): TagReconcileResult {
  const disk = new Set(holdDiskRemovals && lastSeen ? [...diskNow, ...lastSeen] : diskNow);
  const app = new Set(appNow);
  const seen = lastSeen === null ? null : new Set(lastSeen);
  const all = new Set([...disk, ...app, ...(seen ?? [])]);
  const appAdd: string[] = [];
  const appRemove: string[] = [];
  const diskWanted: string[] = [];
  for (const id of all) {
    const r = reconcileStub({ diskNow: disk.has(id), lastSeen: seen === null ? null : seen.has(id), appNow: app.has(id) });
    if (r.appNext && !app.has(id)) appAdd.push(id);
    if (!r.appNext && app.has(id)) appRemove.push(id);
    if (r.diskWanted) diskWanted.push(id);
  }
  return { appAdd, appRemove, diskWanted, lastSeenNext: [...disk] };
}
