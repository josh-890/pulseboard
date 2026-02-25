import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding database...");

  // ─── Person (preserved — not cleared) ───────────────────────────────────────

  const person = await prisma.person.upsert({
    where: { id: "seed-person-1" },
    update: {
      icgId: "JD-96ABF",
      status: "active",
      specialization: "Photographer",
      location: "Los Angeles, CA",
      sexAtBirth: "female",
      birthPlace: "Chicago, IL",
      naturalHairColor: "brunette",
      eyeColor: "brown",
      height: 168,
      birthdate: new Date("1996-03-14"),
      birthdatePrecision: "DAY",
      nationality: "USA",
      ethnicity: "Caucasian",
      deletedAt: null,
    },
    create: {
      id: "seed-person-1",
      icgId: "JD-96ABF",
      status: "active",
      specialization: "Photographer",
      location: "Los Angeles, CA",
      sexAtBirth: "female",
      birthPlace: "Chicago, IL",
      naturalHairColor: "brunette",
      eyeColor: "brown",
      height: 168,
      birthdate: new Date("1996-03-14"),
      birthdatePrecision: "DAY",
      nationality: "USA",
      ethnicity: "Caucasian",
    },
  });

  // Second person for multi-participant demos
  const person2 = await prisma.person.upsert({
    where: { id: "seed-person-2" },
    update: {
      icgId: "MR-88CDE",
      status: "active",
      specialization: "Model",
      location: "New York, NY",
      sexAtBirth: "male",
      naturalHairColor: "black",
      eyeColor: "green",
      height: 183,
      birthdate: new Date("1988-07-22"),
      birthdatePrecision: "DAY",
      nationality: "USA",
      deletedAt: null,
    },
    create: {
      id: "seed-person-2",
      icgId: "MR-88CDE",
      status: "active",
      specialization: "Model",
      location: "New York, NY",
      sexAtBirth: "male",
      naturalHairColor: "black",
      eyeColor: "green",
      height: 183,
      birthdate: new Date("1988-07-22"),
      birthdatePrecision: "DAY",
      nationality: "USA",
    },
  });

  // ─── Aliases ────────────────────────────────────────────────────────────────

  await prisma.personAlias.upsert({
    where: { id: "seed-alias-1" },
    update: { name: "Jane", type: "common", source: "MANUAL", nameNorm: "jane", deletedAt: null },
    create: {
      id: "seed-alias-1",
      personId: person.id,
      name: "Jane",
      type: "common",
      source: "MANUAL",
      nameNorm: "jane",
    },
  });

  await prisma.personAlias.upsert({
    where: { id: "seed-alias-2" },
    update: { name: "Jane Doe", type: "birth", source: "MANUAL", nameNorm: "jane doe", deletedAt: null },
    create: {
      id: "seed-alias-2",
      personId: person.id,
      name: "Jane Doe",
      type: "birth",
      source: "MANUAL",
      nameNorm: "jane doe",
    },
  });

  await prisma.personAlias.upsert({
    where: { id: "seed-alias-3" },
    update: { name: "JD Star", type: "alias", source: "MANUAL", nameNorm: "jd star", deletedAt: null },
    create: {
      id: "seed-alias-3",
      personId: person.id,
      name: "JD Star",
      type: "alias",
      source: "MANUAL",
      nameNorm: "jd star",
    },
  });

  await prisma.personAlias.upsert({
    where: { id: "seed-alias-4" },
    update: { name: "Marcus Reed", type: "common", source: "MANUAL", nameNorm: "marcus reed", deletedAt: null },
    create: {
      id: "seed-alias-4",
      personId: person2.id,
      name: "Marcus Reed",
      type: "common",
      source: "MANUAL",
      nameNorm: "marcus reed",
    },
  });

  // ─── Personas ───────────────────────────────────────────────────────────────

  const baselinePersona = await prisma.persona.upsert({
    where: { id: "seed-persona-1" },
    update: { deletedAt: null },
    create: {
      id: "seed-persona-1",
      personId: person.id,
      label: "Baseline",
      isBaseline: true,
      date: new Date("2020-01-01"),
      notes: "Starting profile data",
    },
  });

  const eventPersona = await prisma.persona.upsert({
    where: { id: "seed-persona-2" },
    update: { deletedAt: null },
    create: {
      id: "seed-persona-2",
      personId: person.id,
      label: "2024 Update",
      isBaseline: false,
      date: new Date("2024-06-01"),
      notes: "Updated hair and fitness level",
    },
  });

  await prisma.personaPhysical.upsert({
    where: { id: "seed-persona-physical-1" },
    update: {},
    create: {
      id: "seed-persona-physical-1",
      personaId: eventPersona.id,
      currentHairColor: "blonde",
      weight: 57.0,
      build: "athletic",
      fitnessLevel: "high",
    },
  });

  // ─── Body Mark ──────────────────────────────────────────────────────────────

  const bodyMark = await prisma.bodyMark.upsert({
    where: { id: "seed-bodymark-1" },
    update: { deletedAt: null },
    create: {
      id: "seed-bodymark-1",
      personId: person.id,
      type: "tattoo",
      bodyRegion: "arm",
      side: "left",
      position: "upper",
      motif: "dragon",
      description: "Small dragon tattoo on upper left arm",
      colors: ["black", "grey"],
      size: "small",
      status: "present",
    },
  });

  await prisma.bodyMarkEvent.upsert({
    where: { id: "seed-bodymark-event-1" },
    update: { deletedAt: null },
    create: {
      id: "seed-bodymark-event-1",
      bodyMarkId: bodyMark.id,
      personaId: baselinePersona.id,
      eventType: "added",
      notes: "Present at initial record",
    },
  });

  // ─── Digital Identity & Skills ──────────────────────────────────────────────

  await prisma.personDigitalIdentity.upsert({
    where: { id: "seed-digital-id-1" },
    update: { deletedAt: null },
    create: {
      id: "seed-digital-id-1",
      personId: person.id,
      personaId: baselinePersona.id,
      platform: "Instagram",
      handle: "@janestar",
      url: "https://instagram.com/janestar",
      status: "active",
    },
  });

  await prisma.personSkill.upsert({
    where: { id: "seed-skill-1" },
    update: { deletedAt: null },
    create: {
      id: "seed-skill-1",
      personId: person.id,
      personaId: baselinePersona.id,
      name: "Photography",
      category: "creative",
      level: "professional",
      evidence: "Portfolio published on official website",
    },
  });

  // ─── Networks + Labels (with evidence) ──────────────────────────────────────

  const network = await prisma.network.upsert({
    where: { id: "seed-network-1" },
    update: { deletedAt: null, nameNorm: "sample network" },
    create: {
      id: "seed-network-1",
      name: "Sample Network",
      nameNorm: "sample network",
      description: "A sample network for development",
    },
  });

  const label = await prisma.label.upsert({
    where: { id: "seed-label-1" },
    update: { deletedAt: null, nameNorm: "sample studio" },
    create: {
      id: "seed-label-1",
      name: "Sample Studio",
      nameNorm: "sample studio",
      description: "A sample production studio",
      website: "https://example.com",
    },
  });

  const label2 = await prisma.label.upsert({
    where: { id: "seed-label-2" },
    update: { deletedAt: null, nameNorm: "indie productions" },
    create: {
      id: "seed-label-2",
      name: "Indie Productions",
      nameNorm: "indie productions",
      description: "An independent production label",
    },
  });

  // Label→Network membership
  await prisma.labelNetwork.upsert({
    where: { labelId_networkId: { labelId: label.id, networkId: network.id } },
    update: {},
    create: { labelId: label.id, networkId: network.id },
  });

  await prisma.labelNetwork.upsert({
    where: { labelId_networkId: { labelId: label2.id, networkId: network.id } },
    update: {},
    create: { labelId: label2.id, networkId: network.id },
  });

  // ─── Channels (no hard labelId — evidence-based) ───────────────────────────

  const channel = await prisma.channel.upsert({
    where: { id: "seed-channel-1" },
    update: { deletedAt: null, nameNorm: "main site", labelId: null },
    create: {
      id: "seed-channel-1",
      name: "Main Site",
      nameNorm: "main site",
      platform: "website",
    },
  });

  const channel2 = await prisma.channel.upsert({
    where: { id: "seed-channel-2" },
    update: { deletedAt: null, nameNorm: "premium channel" },
    create: {
      id: "seed-channel-2",
      name: "Premium Channel",
      nameNorm: "premium channel",
      platform: "streaming",
    },
  });

  // ChannelLabelMap evidence
  await prisma.channelLabelMap.upsert({
    where: { channelId_labelId: { channelId: channel.id, labelId: label.id } },
    update: {},
    create: {
      channelId: channel.id,
      labelId: label.id,
      confidence: 1.0,
      notes: "Primary channel for Sample Studio",
    },
  });

  await prisma.channelLabelMap.upsert({
    where: { channelId_labelId: { channelId: channel2.id, labelId: label.id } },
    update: {},
    create: {
      channelId: channel2.id,
      labelId: label.id,
      confidence: 0.9,
      notes: "Premium content channel",
    },
  });

  await prisma.channelLabelMap.upsert({
    where: { channelId_labelId: { channelId: channel2.id, labelId: label2.id } },
    update: {},
    create: {
      channelId: channel2.id,
      labelId: label2.id,
      confidence: 0.5,
      notes: "Shared channel — lower confidence",
    },
  });

  // ─── Projects (with primary label + secondary) ─────────────────────────────

  const project = await prisma.project.upsert({
    where: { id: "seed-project-1" },
    update: { deletedAt: null, nameNorm: "sample project", labelId: label.id },
    create: {
      id: "seed-project-1",
      name: "Sample Project",
      nameNorm: "sample project",
      description: "A sample production project",
      status: "active",
      tags: ["sample"],
      labelId: label.id,
    },
  });

  // Secondary label association
  await prisma.projectLabel.upsert({
    where: { projectId_labelId: { projectId: project.id, labelId: label.id } },
    update: {},
    create: { projectId: project.id, labelId: label.id },
  });

  await prisma.projectLabel.upsert({
    where: { projectId_labelId: { projectId: project.id, labelId: label2.id } },
    update: {},
    create: { projectId: project.id, labelId: label2.id },
  });

  // ─── Sessions (CONFIRMED + REFERENCE) ──────────────────────────────────────

  const session = await prisma.session.upsert({
    where: { id: "seed-session-1" },
    update: { deletedAt: null, status: "CONFIRMED", labelId: label.id },
    create: {
      id: "seed-session-1",
      projectId: project.id,
      labelId: label.id,
      name: "Session 1",
      status: "CONFIRMED",
      location: "Studio A, Los Angeles",
      date: new Date("2025-01-15"),
      datePrecision: "DAY",
    },
  });

  // Reference session (for headshots / body mark documentation)
  const refSession = await prisma.session.upsert({
    where: { id: "seed-session-ref" },
    update: { deletedAt: null, status: "REFERENCE" },
    create: {
      id: "seed-session-ref",
      name: "Reference Media",
      status: "REFERENCE",
      notes: "Non-production media: headshots, body mark documentation",
    },
  });

  // ─── SessionParticipants ────────────────────────────────────────────────────

  await prisma.sessionParticipant.upsert({
    where: {
      sessionId_personId_role: {
        sessionId: session.id,
        personId: person.id,
        role: "MODEL",
      },
    },
    update: {},
    create: {
      sessionId: session.id,
      personId: person.id,
      role: "MODEL",
    },
  });

  await prisma.sessionParticipant.upsert({
    where: {
      sessionId_personId_role: {
        sessionId: session.id,
        personId: person2.id,
        role: "PHOTOGRAPHER",
      },
    },
    update: {},
    create: {
      sessionId: session.id,
      personId: person2.id,
      role: "PHOTOGRAPHER",
    },
  });

  // ─── MediaItems ─────────────────────────────────────────────────────────────

  const media1 = await prisma.mediaItem.upsert({
    where: { id: "seed-media-1" },
    update: { deletedAt: null },
    create: {
      id: "seed-media-1",
      sessionId: session.id,
      mediaType: "PHOTO",
      filename: "session1_001.jpg",
      mimeType: "image/jpeg",
      size: 2048000,
      originalWidth: 4000,
      originalHeight: 6000,
      hash: "abc123def456",
      capturedAt: new Date("2025-01-15T10:30:00Z"),
      capturedAtPrecision: "DAY",
      tags: ["portrait", "studio"],
      caption: "Studio portrait",
    },
  });

  const media2 = await prisma.mediaItem.upsert({
    where: { id: "seed-media-2" },
    update: { deletedAt: null },
    create: {
      id: "seed-media-2",
      sessionId: session.id,
      mediaType: "PHOTO",
      filename: "session1_002.jpg",
      mimeType: "image/jpeg",
      size: 1856000,
      originalWidth: 4000,
      originalHeight: 6000,
      hash: "def789ghi012",
      capturedAt: new Date("2025-01-15T11:00:00Z"),
      capturedAtPrecision: "DAY",
      tags: ["portrait", "outdoor"],
      caption: "Outdoor portrait",
    },
  });

  // Reference session media (headshot)
  const mediaRef = await prisma.mediaItem.upsert({
    where: { id: "seed-media-ref-1" },
    update: { deletedAt: null },
    create: {
      id: "seed-media-ref-1",
      sessionId: refSession.id,
      mediaType: "PHOTO",
      filename: "headshot_jane_2025.jpg",
      mimeType: "image/jpeg",
      size: 512000,
      originalWidth: 1024,
      originalHeight: 1024,
      hash: "headshot123",
      tags: ["headshot"],
      caption: "Jane — 2025 headshot",
    },
  });

  // ─── Sets (distribution layer — curating media) ─────────────────────────────

  const set = await prisma.set.upsert({
    where: { id: "seed-set-1" },
    update: {
      deletedAt: null,
      titleNorm: "sample photoset",
      coverMediaItemId: media1.id,
    },
    create: {
      id: "seed-set-1",
      sessionId: session.id,
      channelId: channel.id,
      type: "photo",
      title: "Sample Photoset",
      titleNorm: "sample photoset",
      releaseDate: new Date("2025-02-01"),
      releaseDatePrecision: "DAY",
      coverMediaItemId: media1.id,
      tags: ["sample"],
    },
  });

  // ─── SetMediaItems (join: set ↔ media) ─────────────────────────────────────

  await prisma.setMediaItem.upsert({
    where: {
      setId_mediaItemId: { setId: set.id, mediaItemId: media1.id },
    },
    update: {},
    create: {
      setId: set.id,
      mediaItemId: media1.id,
      sortOrder: 0,
      isCover: true,
      caption: "Cover image",
    },
  });

  await prisma.setMediaItem.upsert({
    where: {
      setId_mediaItemId: { setId: set.id, mediaItemId: media2.id },
    },
    update: {},
    create: {
      setId: set.id,
      mediaItemId: media2.id,
      sortOrder: 1,
      isCover: false,
    },
  });

  // ─── SetCreditRaw (resolution layer) ───────────────────────────────────────

  await prisma.setCreditRaw.upsert({
    where: { id: "seed-credit-raw-1" },
    update: { deletedAt: null },
    create: {
      id: "seed-credit-raw-1",
      setId: set.id,
      role: "MODEL",
      rawName: "Jane",
      rawNameNorm: "jane",
      resolutionStatus: "RESOLVED",
      resolvedPersonId: person.id,
    },
  });

  await prisma.setCreditRaw.upsert({
    where: { id: "seed-credit-raw-2" },
    update: { deletedAt: null },
    create: {
      id: "seed-credit-raw-2",
      setId: set.id,
      role: "PHOTOGRAPHER",
      rawName: "M. Reed",
      rawNameNorm: "m. reed",
      resolutionStatus: "RESOLVED",
      resolvedPersonId: person2.id,
    },
  });

  await prisma.setCreditRaw.upsert({
    where: { id: "seed-credit-raw-3" },
    update: { deletedAt: null },
    create: {
      id: "seed-credit-raw-3",
      setId: set.id,
      role: "MODEL",
      rawName: "Unknown Guest",
      rawNameNorm: "unknown guest",
      resolutionStatus: "UNRESOLVED",
    },
  });

  // ─── SetParticipants (resolved credits) ────────────────────────────────────

  await prisma.setParticipant.upsert({
    where: {
      setId_personId_role: { setId: set.id, personId: person.id, role: "MODEL" },
    },
    update: {},
    create: {
      setId: set.id,
      personId: person.id,
      role: "MODEL",
    },
  });

  await prisma.setParticipant.upsert({
    where: {
      setId_personId_role: { setId: set.id, personId: person2.id, role: "PHOTOGRAPHER" },
    },
    update: {},
    create: {
      setId: set.id,
      personId: person2.id,
      role: "PHOTOGRAPHER",
    },
  });

  // ─── SetLabelEvidence ──────────────────────────────────────────────────────

  await prisma.setLabelEvidence.upsert({
    where: {
      setId_labelId_evidenceType: {
        setId: set.id,
        labelId: label.id,
        evidenceType: "CHANNEL_MAP",
      },
    },
    update: {},
    create: {
      setId: set.id,
      labelId: label.id,
      evidenceType: "CHANNEL_MAP",
      confidence: 1.0,
      notes: "Derived from channel→label mapping",
    },
  });

  // ─── PersonMediaLinks (cross-cutting) ──────────────────────────────────────

  await prisma.personMediaLink.upsert({
    where: {
      personId_mediaItemId_usage: {
        personId: person.id,
        mediaItemId: mediaRef.id,
        usage: "HEADSHOT",
      },
    },
    update: { deletedAt: null },
    create: {
      personId: person.id,
      mediaItemId: mediaRef.id,
      usage: "HEADSHOT",
      isFavorite: true,
      sortOrder: 0,
      notes: "Primary headshot for Jane",
    },
  });

  await prisma.personMediaLink.upsert({
    where: {
      personId_mediaItemId_usage: {
        personId: person.id,
        mediaItemId: media1.id,
        usage: "PORTFOLIO",
      },
    },
    update: { deletedAt: null },
    create: {
      personId: person.id,
      mediaItemId: media1.id,
      usage: "PORTFOLIO",
      isFavorite: false,
      sortOrder: 0,
    },
  });

  // ─── Legacy SetContribution (kept for backward compat) ─────────────────────

  await prisma.setContribution.upsert({
    where: { setId_personId: { setId: set.id, personId: person.id } },
    update: { deletedAt: null },
    create: {
      setId: set.id,
      personId: person.id,
      role: "main",
    },
  });

  // ─── Activity entries ──────────────────────────────────────────────────────

  const activities = [
    { id: "seed-activity-1", title: "Jane added to database", type: "person_added" as const, time: new Date() },
    { id: "seed-activity-2", title: "Sample Photoset published", type: "set_added" as const, time: new Date(Date.now() - 3600000) },
    { id: "seed-activity-3", title: "Sample Project created", type: "project_added" as const, time: new Date(Date.now() - 7200000) },
    { id: "seed-activity-4", title: "Sample Studio added", type: "label_added" as const, time: new Date(Date.now() - 86400000) },
  ];

  for (const a of activities) {
    await prisma.activity.upsert({
      where: { id: a.id },
      update: { deletedAt: null },
      create: a,
    });
  }

  // ─── Refresh materialized views ────────────────────────────────────────────

  await prisma.$queryRawUnsafe("REFRESH MATERIALIZED VIEW mv_dashboard_stats");

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
