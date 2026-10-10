import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  getAgentStatus,
  getDashboardActivity,
  getDashboardKpis,
  getNeedsYou,
  recordAgentRun,
} from "@/lib/services/dashboard-service";

// The dashboard (2026-10-11): activity is derived from the records, the queues are
// counted live, agent runs are reported. Fixtures: a promoted set filled by the
// upload agent, a set with a failed file, an agent run.

const RUN = `dsh${Date.now().toString(36)}`;
const ids: Record<string, string> = {};

beforeAll(async () => {
  const session = await prisma.session.create({ data: { name: `${RUN} session` } });
  const set = await prisma.set.create({
    data: { type: "photo", title: `${RUN} promoted`, archiveUploadStartedAt: new Date(Date.now() - 60_000), archiveUploadDoneAt: new Date() },
  });
  await prisma.setSession.create({ data: { setId: set.id, sessionId: session.id, isPrimary: true } });
  const staged = await prisma.stagingSet.create({
    data: { title: `${RUN} staged`, channelName: RUN, participantIcgIds: [], status: "PROMOTED", promotedSetId: set.id },
  });
  const mi = await prisma.mediaItem.create({
    data: { sessionId: session.id, mediaType: "PHOTO", filename: "a.jpg", mimeType: "image/jpeg", size: 1, originalWidth: 1, originalHeight: 1 },
  });
  await prisma.setMediaItem.create({ data: { setId: set.id, mediaItemId: mi.id } });
  const failed = await prisma.set.create({ data: { type: "photo", title: `${RUN} failed`, archiveUploadFailed: ["bad.jpg (Corrupt JPEG data)"] } });
  Object.assign(ids, { session: session.id, set: set.id, staged: staged.id, media: mi.id, failed: failed.id });
});

afterAll(async () => {
  await prisma.agentRun.deleteMany({ where: { summary: { startsWith: RUN } } });
  await prisma.setMediaItem.deleteMany({ where: { setId: ids.set } });
  await prisma.mediaItem.deleteMany({ where: { id: ids.media } });
  await prisma.stagingSet.deleteMany({ where: { id: ids.staged } });
  await prisma.setSession.deleteMany({ where: { setId: ids.set } });
  await prisma.set.deleteMany({ where: { id: { in: [ids.set, ids.failed] } } });
  await prisma.session.deleteMany({ where: { id: ids.session } });
});

const allEvents = async () => (await getDashboardActivity(2)).flatMap((d) => d.events);

describe("activity, derived from the data", () => {
  it("shows the promotion and the images the agent added", async () => {
    const events = await allEvents();
    expect(events).toContainEqual(expect.objectContaining({ kind: "promoted", title: `Promoted “${RUN} promoted”`, href: `/sets/${ids.set}` }));
    expect(events).toContainEqual(
      expect.objectContaining({ kind: "images", title: `${RUN} promoted · 1 image`, detail: "via the upload agent" }),
    );
  });

  it("shows a reported agent run, but not a dry run", async () => {
    await recordAgentRun({ agent: "archive-upload", startedAt: new Date(), ok: true, dryRun: false, summary: `${RUN} 1 set · 1 image` });
    await recordAgentRun({ agent: "archive-upload", startedAt: new Date(), ok: true, dryRun: true, summary: `${RUN} dry` });
    const titles = (await allEvents()).filter((e) => e.kind === "agent").map((e) => e.detail);
    expect(titles).toContain(`${RUN} 1 set · 1 image`);
    expect(titles).not.toContain(`${RUN} dry`);
    const upload = (await getAgentStatus()).find((a) => a.agent === "archive-upload");
    expect(upload?.last?.summary).toBe(`${RUN} 1 set · 1 image`);
  });

  it("groups by day, newest first", async () => {
    const days = await getDashboardActivity(14);
    expect(days.map((d) => d.day)).toEqual([...days.map((d) => d.day)].sort().reverse());
  });
});

describe("needs you + numbers", () => {
  it("lists a set whose files did not upload, with the file", async () => {
    const failed = (await getNeedsYou()).find((i) => i.key === "failed");
    expect(failed?.items).toContainEqual(expect.objectContaining({ label: `${RUN} failed`, href: `/sets/${ids.failed}` }));
  });

  it("counts live", async () => {
    const before = (await getDashboardKpis()).sets;
    const s = await prisma.set.create({ data: { type: "photo", title: `${RUN} count` } });
    expect((await getDashboardKpis()).sets).toBe(before + 1);
    await prisma.set.delete({ where: { id: s.id } });
  });
});
