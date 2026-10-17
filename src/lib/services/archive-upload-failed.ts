import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

// The files the archive upload agent could not upload (Set.archiveUploadFailed,
// 2026-10-10), shown on the dashboard until they are dealt with (2026-10-17):
// a file of that name arriving in the set — by hand or by the agent — takes its
// entry off, and Dismiss clears the rest. Entries read "<file name> (<reason>)".

type Db = Prisma.TransactionClient | typeof prisma;

/** Whether an entry is about this file name */
export function failedEntryIs(entry: string, filename: string): boolean {
  return entry === filename || entry.startsWith(`${filename} (`);
}

/** The entries left once these file names are in the set */
export function withoutArrived(entries: string[], filenames: Iterable<string>): string[] {
  const names = [...filenames];
  return entries.filter((e) => !names.some((n) => failedEntryIs(e, n)));
}

/** Files of these names arrived in the set: take their entries off its list */
export async function pruneArchiveUploadFailed(db: Db, setId: string, filenames: string[]): Promise<void> {
  if (filenames.length === 0) return;
  const set = await db.set.findUnique({ where: { id: setId }, select: { archiveUploadFailed: true } });
  if (!set || set.archiveUploadFailed.length === 0) return;
  const left = withoutArrived(set.archiveUploadFailed, filenames);
  if (left.length !== set.archiveUploadFailed.length) {
    await db.set.update({ where: { id: setId }, data: { archiveUploadFailed: left } });
  }
}

/** You have seen the list and decided: it leaves the dashboard */
export async function dismissArchiveUploadFailed(setId: string): Promise<void> {
  await prisma.set.update({ where: { id: setId }, data: { archiveUploadFailed: [] } });
}
