/**
 * Test scenario: Channel re-link and Set re-channel cascade correctness.
 *
 * Verifies that Session.labelId is kept in sync when:
 *   A) A channel is re-linked to a different label
 *   B) A set is moved to a different channel
 *
 * After running all assertions the script deletes every record it created,
 * leaving the database in exactly the same state as before.
 *
 * Usage:
 *   npx tsx scripts/test-channel-relabel.ts
 */

import "dotenv/config";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { updateChannelRecord } from "@/lib/services/channel-service";
import { updateSetRecord } from "@/lib/services/set-service";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ── helpers ──────────────────────────────────────────────────────────────────

let pass = 0;
let fail = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    pass++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    fail++;
  }
}

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ── setup ─────────────────────────────────────────────────────────────────────

async function setup() {
  console.log("\n── Setup ────────────────────────────────────────────────────");

  // Two labels
  const labelAlpha = await prisma.label.create({
    data: { name: "TCR Label Alpha", nameNorm: norm("TCR Label Alpha") },
  });
  const labelBeta = await prisma.label.create({
    data: { name: "TCR Label Beta", nameNorm: norm("TCR Label Beta") },
  });
  console.log(`  Labels created: ${labelAlpha.id} (Alpha), ${labelBeta.id} (Beta)`);

  // Two channels, both initially linked to Alpha
  const channelA = await prisma.channel.create({
    data: { name: "TCR Channel A", nameNorm: norm("TCR Channel A"), tier: "NORMAL" },
  });
  const channelB = await prisma.channel.create({
    data: { name: "TCR Channel B", nameNorm: norm("TCR Channel B"), tier: "NORMAL" },
  });
  await prisma.channelLabelMap.create({ data: { channelId: channelA.id, labelId: labelAlpha.id, confidence: 1.0 } });
  await prisma.channelLabelMap.create({ data: { channelId: channelB.id, labelId: labelAlpha.id, confidence: 1.0 } });
  console.log(`  Channels created: ${channelA.id} (A→Alpha), ${channelB.id} (B→Alpha)`);

  // Set 1 in Channel A — single-channel session (should be updated on re-link)
  const set1 = await prisma.set.create({
    data: { title: "TCR Set 1", titleNorm: norm("TCR Set 1"), type: "photo", channelId: channelA.id },
  });
  const session1 = await prisma.session.create({
    data: {
      name: "TCR Session 1",
      nameNorm: norm("TCR Session 1"),
      status: "DRAFT",
      type: "PRODUCTION",
      labelId: labelAlpha.id,
    },
  });
  await prisma.setSession.create({ data: { setId: set1.id, sessionId: session1.id, isPrimary: true } });

  // Set 2 in Channel A — single-channel session (should also be updated)
  const set2 = await prisma.set.create({
    data: { title: "TCR Set 2", titleNorm: norm("TCR Set 2"), type: "photo", channelId: channelA.id },
  });
  const session2 = await prisma.session.create({
    data: {
      name: "TCR Session 2",
      nameNorm: norm("TCR Session 2"),
      status: "DRAFT",
      type: "PRODUCTION",
      labelId: labelAlpha.id,
    },
  });
  await prisma.setSession.create({ data: { setId: set2.id, sessionId: session2.id, isPrimary: true } });

  // Set 3 in Channel A + Set 4 in Channel B — shared session (must NOT change)
  const set3 = await prisma.set.create({
    data: { title: "TCR Set 3", titleNorm: norm("TCR Set 3"), type: "photo", channelId: channelA.id },
  });
  const set4 = await prisma.set.create({
    data: { title: "TCR Set 4", titleNorm: norm("TCR Set 4"), type: "photo", channelId: channelB.id },
  });
  const sessionShared = await prisma.session.create({
    data: {
      name: "TCR Session Shared",
      nameNorm: norm("TCR Session Shared"),
      status: "DRAFT",
      type: "PRODUCTION",
      labelId: labelAlpha.id,
    },
  });
  await prisma.setSession.create({ data: { setId: set3.id, sessionId: sessionShared.id, isPrimary: true } });
  await prisma.setSession.create({ data: { setId: set4.id, sessionId: sessionShared.id, isPrimary: false } });

  // Set 5 in Channel B — single-set session (for Scenario B re-channel test)
  const set5 = await prisma.set.create({
    data: { title: "TCR Set 5", titleNorm: norm("TCR Set 5"), type: "photo", channelId: channelB.id },
  });
  const session5 = await prisma.session.create({
    data: {
      name: "TCR Session 5",
      nameNorm: norm("TCR Session 5"),
      status: "DRAFT",
      type: "PRODUCTION",
      labelId: labelAlpha.id,
    },
  });
  await prisma.setSession.create({ data: { setId: set5.id, sessionId: session5.id, isPrimary: true } });

  console.log("  Sets + sessions created\n");

  return { labelAlpha, labelBeta, channelA, channelB, set1, set2, set3, set4, set5, session1, session2, sessionShared, session5 };
}

// ── Scenario A ────────────────────────────────────────────────────────────────

async function scenarioA(ids: Awaited<ReturnType<typeof setup>>) {
  console.log("── Scenario A: Re-link Channel A from Alpha → Beta ─────────");

  const { labelAlpha, labelBeta, channelA, session1, session2, sessionShared } = ids;

  // Assert initial state
  const s1before = await prisma.session.findUniqueOrThrow({ where: { id: session1.id } });
  const s2before = await prisma.session.findUniqueOrThrow({ where: { id: session2.id } });
  const sSharedbefore = await prisma.session.findUniqueOrThrow({ where: { id: sessionShared.id } });
  assert(s1before.labelId === labelAlpha.id, "Session1 initially linked to Alpha");
  assert(s2before.labelId === labelAlpha.id, "Session2 initially linked to Alpha");
  assert(sSharedbefore.labelId === labelAlpha.id, "SessionShared initially linked to Alpha");

  // Execute the service call
  await updateChannelRecord(channelA.id, { labelId: labelBeta.id });

  // Verify ChannelLabelMap updated
  const map = await prisma.channelLabelMap.findFirst({ where: { channelId: channelA.id } });
  assert(map?.labelId === labelBeta.id, "ChannelLabelMap updated to Beta");

  // Single-channel sessions should be updated
  const s1after = await prisma.session.findUniqueOrThrow({ where: { id: session1.id } });
  const s2after = await prisma.session.findUniqueOrThrow({ where: { id: session2.id } });
  assert(s1after.labelId === labelBeta.id, "Session1 labelId cascaded to Beta");
  assert(s2after.labelId === labelBeta.id, "Session2 labelId cascaded to Beta");

  // Shared session (spans channels A + B) must NOT change
  const sSharedafter = await prisma.session.findUniqueOrThrow({ where: { id: sessionShared.id } });
  assert(sSharedafter.labelId === labelAlpha.id, "SessionShared labelId NOT changed (cross-channel guard)");

  console.log();
}

// ── Scenario B ────────────────────────────────────────────────────────────────

async function scenarioB(ids: Awaited<ReturnType<typeof setup>>) {
  console.log("── Scenario B: Move Set5 from Channel B → Channel A ────────");

  const { labelAlpha, labelBeta, channelA, set5, session5, sessionShared, set3, set4 } = ids;

  // Channel A is now linked to Beta (after Scenario A)
  const mapA = await prisma.channelLabelMap.findFirst({ where: { channelId: channelA.id } });
  assert(mapA?.labelId === labelBeta.id, "Pre-condition: Channel A → Beta");

  const s5before = await prisma.session.findUniqueOrThrow({ where: { id: session5.id } });
  assert(s5before.labelId === labelAlpha.id, "Session5 initially linked to Alpha");

  // Move Set5 to Channel A (which is now Beta)
  await updateSetRecord(set5.id, { channelId: channelA.id });

  const s5after = await prisma.session.findUniqueOrThrow({ where: { id: session5.id } });
  assert(s5after.labelId === labelBeta.id, "Session5 labelId cascaded to Beta (single-set session)");

  // Shared session (2 sets) must NOT be updated even though Set3 is in channel A
  const sSharedafter = await prisma.session.findUniqueOrThrow({ where: { id: sessionShared.id } });
  assert(sSharedafter.labelId === labelAlpha.id, "SessionShared labelId unchanged (multi-set guard)");

  console.log();
}

// ── teardown ──────────────────────────────────────────────────────────────────

async function teardown(ids: Awaited<ReturnType<typeof setup>>) {
  console.log("── Teardown ─────────────────────────────────────────────────");

  const { labelAlpha, labelBeta, channelA, channelB, set1, set2, set3, set4, set5, session1, session2, sessionShared, session5 } = ids;

  // SetSession links first
  await prisma.setSession.deleteMany({
    where: { setId: { in: [set1.id, set2.id, set3.id, set4.id, set5.id] } },
  });

  // Sessions
  await prisma.session.deleteMany({
    where: { id: { in: [session1.id, session2.id, sessionShared.id, session5.id] } },
  });

  // Sets
  await prisma.set.deleteMany({
    where: { id: { in: [set1.id, set2.id, set3.id, set4.id, set5.id] } },
  });

  // StagingSet records that may reference test channels (fire-and-forget side effect)
  await prisma.stagingSet.deleteMany({
    where: { channelId: { in: [channelA.id, channelB.id] } },
  });

  // ChannelLabelMaps
  await prisma.channelLabelMap.deleteMany({
    where: { channelId: { in: [channelA.id, channelB.id] } },
  });

  // Channels
  await prisma.channel.deleteMany({
    where: { id: { in: [channelA.id, channelB.id] } },
  });

  // Labels
  await prisma.label.deleteMany({
    where: { id: { in: [labelAlpha.id, labelBeta.id] } },
  });

  // Verify nothing is left
  const leftoverSets = await prisma.set.count({ where: { title: { startsWith: "TCR " } } });
  const leftoverSessions = await prisma.session.count({ where: { name: { startsWith: "TCR " } } });
  const leftoverChannels = await prisma.channel.count({ where: { name: { startsWith: "TCR " } } });
  const leftoverLabels = await prisma.label.count({ where: { name: { startsWith: "TCR " } } });

  assert(leftoverSets === 0, "No TCR sets remain");
  assert(leftoverSessions === 0, "No TCR sessions remain");
  assert(leftoverChannels === 0, "No TCR channels remain");
  assert(leftoverLabels === 0, "No TCR labels remain");

  console.log();
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Channel Re-label Cascade Test ===");

  let ids: Awaited<ReturnType<typeof setup>> | null = null;
  try {
    ids = await setup();
    await scenarioA(ids);
    await scenarioB(ids);
  } finally {
    if (ids) {
      await teardown(ids);
    }
    await prisma.$disconnect();
  }

  console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
