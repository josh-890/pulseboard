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
      nationality: "US",
      ethnicity: "Caucasian",

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
      nationality: "US",
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
      nationality: "US",

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
      nationality: "US",
    },
  });

  // ─── Aliases ────────────────────────────────────────────────────────────────

  await prisma.personAlias.upsert({
    where: { id: "seed-alias-1" },
    update: { name: "Jane", isCommon: true, source: "MANUAL", nameNorm: "jane" },
    create: {
      id: "seed-alias-1",
      personId: person.id,
      name: "Jane",
      isCommon: true,
      source: "MANUAL",
      nameNorm: "jane",
    },
  });

  await prisma.personAlias.upsert({
    where: { id: "seed-alias-2" },
    update: { name: "Jane Doe", isBirth: true, source: "MANUAL", nameNorm: "jane doe" },
    create: {
      id: "seed-alias-2",
      personId: person.id,
      name: "Jane Doe",
      isBirth: true,
      source: "MANUAL",
      nameNorm: "jane doe",
    },
  });

  await prisma.personAlias.upsert({
    where: { id: "seed-alias-3" },
    update: { name: "JD Star", source: "MANUAL", nameNorm: "jd star" },
    create: {
      id: "seed-alias-3",
      personId: person.id,
      name: "JD Star",
      source: "MANUAL",
      nameNorm: "jd star",
    },
  });

  await prisma.personAlias.upsert({
    where: { id: "seed-alias-4" },
    update: { name: "Marcus Reed", isCommon: true, source: "MANUAL", nameNorm: "marcus reed" },
    create: {
      id: "seed-alias-4",
      personId: person2.id,
      name: "Marcus Reed",
      isCommon: true,
      source: "MANUAL",
      nameNorm: "marcus reed",
    },
  });

  // ─── Personas ───────────────────────────────────────────────────────────────

  const baselinePersona = await prisma.persona.upsert({
    where: { id: "seed-persona-1" },
    update: {},
    create: {
      id: "seed-persona-1",
      personId: person.id,
      label: "Jane at 23",
      isBaseline: true,
      date: new Date("2020-01-01"),
      notes: "Starting profile data",
    },
  });

  const eventPersona = await prisma.persona.upsert({
    where: { id: "seed-persona-2" },
    update: {},
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
    },
  });

  // ─── Body Mark ──────────────────────────────────────────────────────────────

  const bodyMark = await prisma.bodyMark.upsert({
    where: { id: "seed-bodymark-1" },
    update: {},
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
    update: {},
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
    update: {},
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
    update: {},
    create: {
      id: "seed-skill-1",
      personId: person.id,
      personaId: baselinePersona.id,
      name: "Photography",
      category: "creative",
      level: "PROFESSIONAL",
      evidence: "Portfolio published on official website",
    },
  });

  // ─── Networks + Labels (with evidence) ──────────────────────────────────────

  const network = await prisma.network.upsert({
    where: { id: "seed-network-1" },
    update: { nameNorm: "sample network" },
    create: {
      id: "seed-network-1",
      name: "Sample Network",
      nameNorm: "sample network",
      description: "A sample network for development",
    },
  });

  const label = await prisma.label.upsert({
    where: { id: "seed-label-1" },
    update: { nameNorm: "sample studio" },
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
    update: { nameNorm: "indie productions" },
    create: {
      id: "seed-label-2",
      name: "Indie Productions",
      nameNorm: "indie productions",
      description: "An independent production label",
    },
  });

  // Label→Network membership
  await prisma.labelNetworkLink.upsert({
    where: { labelId_networkId: { labelId: label.id, networkId: network.id } },
    update: {},
    create: { labelId: label.id, networkId: network.id },
  });

  await prisma.labelNetworkLink.upsert({
    where: { labelId_networkId: { labelId: label2.id, networkId: network.id } },
    update: {},
    create: { labelId: label2.id, networkId: network.id },
  });

  // ─── Channels (no hard labelId — evidence-based) ───────────────────────────

  const channel = await prisma.channel.upsert({
    where: { id: "seed-channel-1" },
    update: { nameNorm: "main site" },
    create: {
      id: "seed-channel-1",
      name: "Main Site",
      nameNorm: "main site",
      platform: "website",
    },
  });

  const channel2 = await prisma.channel.upsert({
    where: { id: "seed-channel-2" },
    update: { nameNorm: "premium channel" },
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
    update: { nameNorm: "sample project", labelId: label.id },
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
    update: { status: "CONFIRMED", labelId: label.id, nameNorm: "session 1" },
    create: {
      id: "seed-session-1",
      projectId: project.id,
      labelId: label.id,
      name: "Session 1",
      nameNorm: "session 1",
      status: "CONFIRMED",
      location: "Studio A, Los Angeles",
      date: new Date("2025-01-15"),
      datePrecision: "DAY",
    },
  });

  // Reference sessions (per-person)
  const refSession = await prisma.session.upsert({
    where: { id: "seed-session-ref" },
    update: { type: "REFERENCE", status: "CONFIRMED", nameNorm: "jane", name: "Jane", personId: person.id },
    create: {
      id: "seed-session-ref",
      name: "Jane",
      nameNorm: "jane",
      type: "REFERENCE",
      status: "CONFIRMED",
      personId: person.id,
    },
  });

  await prisma.session.upsert({
    where: { id: "seed-ref-session-2" },
    update: { type: "REFERENCE", status: "CONFIRMED", nameNorm: "marcus reed", name: "Marcus Reed", personId: person2.id },
    create: {
      id: "seed-ref-session-2",
      name: "Marcus Reed",
      nameNorm: "marcus reed",
      type: "REFERENCE",
      status: "CONFIRMED",
      personId: person2.id,
    },
  });

  // ─── SessionContributions ───────────────────────────────────────────────────

  await prisma.sessionContribution.upsert({
    where: {
      sessionId_personId_roleDefinitionId: {
        sessionId: session.id,
        personId: person.id,
        roleDefinitionId: "crd_model",
      },
    },
    update: {},
    create: {
      sessionId: session.id,
      personId: person.id,
      roleDefinitionId: "crd_model",
    },
  });

  await prisma.sessionContribution.upsert({
    where: {
      sessionId_personId_roleDefinitionId: {
        sessionId: session.id,
        personId: person2.id,
        roleDefinitionId: "crd_photographer",
      },
    },
    update: {},
    create: {
      sessionId: session.id,
      personId: person2.id,
      roleDefinitionId: "crd_photographer",
    },
  });

  // ─── MediaItems ─────────────────────────────────────────────────────────────

  const media1 = await prisma.mediaItem.upsert({
    where: { id: "seed-media-1" },
    update: {},
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
    update: {},
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
    update: {},
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

      titleNorm: "sample photoset",
      coverMediaItemId: media1.id,
    },
    create: {
      id: "seed-set-1",
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
    update: {},
    create: {
      id: "seed-credit-raw-1",
      setId: set.id,
      roleDefinitionId: "crd_model",
      rawName: "Jane",
      nameNorm: "jane",
      resolutionStatus: "RESOLVED",
      resolvedPersonId: person.id,
    },
  });

  await prisma.setCreditRaw.upsert({
    where: { id: "seed-credit-raw-2" },
    update: {},
    create: {
      id: "seed-credit-raw-2",
      setId: set.id,
      roleDefinitionId: "crd_photographer",
      rawName: "M. Reed",
      nameNorm: "m. reed",
      resolutionStatus: "RESOLVED",
      resolvedPersonId: person2.id,
    },
  });

  await prisma.setCreditRaw.upsert({
    where: { id: "seed-credit-raw-3" },
    update: {},
    create: {
      id: "seed-credit-raw-3",
      setId: set.id,
      roleDefinitionId: "crd_model",
      rawName: "Unknown Guest",
      nameNorm: "unknown guest",
      resolutionStatus: "UNRESOLVED",
    },
  });

  // ─── SetParticipants (resolved credits) ────────────────────────────────────

  await prisma.setParticipant.upsert({
    where: {
      setId_personId_roleDefinitionId: { setId: set.id, personId: person.id, roleDefinitionId: "crd_model" },
    },
    update: {},
    create: {
      setId: set.id,
      personId: person.id,
      roleDefinitionId: "crd_model",
    },
  });

  await prisma.setParticipant.upsert({
    where: {
      setId_personId_roleDefinitionId: { setId: set.id, personId: person2.id, roleDefinitionId: "crd_photographer" },
    },
    update: {},
    create: {
      setId: set.id,
      personId: person2.id,
      roleDefinitionId: "crd_photographer",
    },
  });

  // ─── SetSession (link sets to sessions) ────────────────────────────────────

  await prisma.setSession.upsert({
    where: { setId_sessionId: { setId: set.id, sessionId: session.id } },
    update: {},
    create: {
      setId: set.id,
      sessionId: session.id,
      isPrimary: true,
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
    update: {},
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
    update: {},
    create: {
      personId: person.id,
      mediaItemId: media1.id,
      usage: "PORTFOLIO",
      isFavorite: false,
      sortOrder: 0,
    },
  });

  // ─── Activity entries ──────────────────────────────────────────────────────

  const activities = [
    { id: "seed-activity-1", title: "Jane added to database", type: "person_added" as const, time: new Date() },
    { id: "seed-activity-2", title: "Sample Photoset published", type: "set_added" as const, time: new Date(Date.now() - 3600000) },
    { id: "seed-activity-3", title: "Sample Project created", type: "project_added" as const, time: new Date(Date.now() - 7200000) },
    { id: "seed-activity-4", title: "Sample Studio added", type: "label_added" as const, time: new Date(Date.now() - 86400000) },
    { id: "seed-activity-5", title: "Session 1 created", type: "session_added" as const, time: new Date(Date.now() - 1800000) },
  ];

  for (const a of activities) {
    await prisma.activity.upsert({
      where: { id: a.id },
      update: {},
      create: a,
    });
  }

  // ─── Skill Catalog ──────────────────────────────────────────────────────────

  const skillCatalog = [
    {
      id: "seed-sg-performance",
      name: "Performance",
      sortOrder: 1,
      definitions: [
        { id: "seed-sd-acting", name: "Acting", slug: "acting" },
        { id: "seed-sd-modeling", name: "Modeling", slug: "modeling" },
        { id: "seed-sd-dance", name: "Dance", slug: "dance" },
        { id: "seed-sd-singing", name: "Singing", slug: "singing" },
      ],
    },
    {
      id: "seed-sg-technical",
      name: "Technical",
      sortOrder: 2,
      definitions: [
        { id: "seed-sd-photography", name: "Photography", slug: "photography" },
        { id: "seed-sd-lighting", name: "Lighting", slug: "lighting" },
        { id: "seed-sd-editing", name: "Editing", slug: "editing" },
        { id: "seed-sd-directing", name: "Directing", slug: "directing" },
      ],
    },
    {
      id: "seed-sg-physical",
      name: "Physical",
      sortOrder: 3,
      definitions: [
        { id: "seed-sd-fitness", name: "Fitness", slug: "fitness" },
        { id: "seed-sd-flexibility", name: "Flexibility", slug: "flexibility" },
        { id: "seed-sd-stunts", name: "Stunts", slug: "stunts" },
        { id: "seed-sd-sports", name: "Sports", slug: "sports" },
      ],
    },
    {
      id: "seed-sg-creative",
      name: "Creative",
      sortOrder: 4,
      definitions: [
        { id: "seed-sd-styling", name: "Styling", slug: "styling" },
        { id: "seed-sd-makeup", name: "Makeup", slug: "makeup" },
        { id: "seed-sd-costume", name: "Costume", slug: "costume" },
        { id: "seed-sd-set-design", name: "Set Design", slug: "set-design" },
      ],
    },
  ];

  for (const group of skillCatalog) {
    await prisma.skillGroup.upsert({
      where: { id: group.id },
      update: { name: group.name, sortOrder: group.sortOrder },
      create: { id: group.id, name: group.name, sortOrder: group.sortOrder },
    });
    for (let i = 0; i < group.definitions.length; i++) {
      const def = group.definitions[i];
      await prisma.skillDefinition.upsert({
        where: { id: def.id },
        update: { name: def.name, slug: def.slug, sortOrder: i + 1 },
        create: {
          id: def.id,
          groupId: group.id,
          name: def.name,
          slug: def.slug,
          sortOrder: i + 1,
        },
      });
    }
  }

  // Link seed person skill to Photography definition
  await prisma.personSkill.update({
    where: { id: "seed-skill-1" },
    data: { skillDefinitionId: "seed-sd-photography" },
  });

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
