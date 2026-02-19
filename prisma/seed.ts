import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding database...");

  // Seed a sample Network
  const network = await prisma.network.upsert({
    where: { id: "seed-network-1" },
    update: {},
    create: {
      id: "seed-network-1",
      name: "Sample Network",
      description: "A sample network for development",
    },
  });

  // Seed a sample Label
  const label = await prisma.label.upsert({
    where: { id: "seed-label-1" },
    update: {},
    create: {
      id: "seed-label-1",
      name: "Sample Studio",
      description: "A sample production studio",
      website: "https://example.com",
    },
  });

  // Link label to network
  await prisma.labelNetwork.upsert({
    where: { labelId_networkId: { labelId: label.id, networkId: network.id } },
    update: {},
    create: { labelId: label.id, networkId: network.id },
  });

  // Seed a Channel
  const channel = await prisma.channel.upsert({
    where: { id: "seed-channel-1" },
    update: {},
    create: {
      id: "seed-channel-1",
      labelId: label.id,
      name: "Main Site",
      platform: "website",
    },
  });

  // Seed a sample Person (with icgId)
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
      nationality: "USA",
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
      nationality: "USA",
      ethnicity: "Caucasian",
    },
  });

  // Aliases: common (display name), birth, and a stage alias
  await prisma.personAlias.upsert({
    where: { id: "seed-alias-1" },
    update: { name: "Jane", type: "common" },
    create: {
      id: "seed-alias-1",
      personId: person.id,
      name: "Jane",
      type: "common",
    },
  });

  await prisma.personAlias.upsert({
    where: { id: "seed-alias-2" },
    update: { name: "Jane Doe", type: "birth" },
    create: {
      id: "seed-alias-2",
      personId: person.id,
      name: "Jane Doe",
      type: "birth",
    },
  });

  await prisma.personAlias.upsert({
    where: { id: "seed-alias-3" },
    update: { name: "JD Star", type: "alias" },
    create: {
      id: "seed-alias-3",
      personId: person.id,
      name: "JD Star",
      type: "alias",
    },
  });

  // Baseline persona
  const baselinePersona = await prisma.persona.upsert({
    where: { id: "seed-persona-1" },
    update: {},
    create: {
      id: "seed-persona-1",
      personId: person.id,
      label: "Baseline",
      isBaseline: true,
      date: new Date("2020-01-01"),
      notes: "Starting profile data",
    },
  });

  // Event persona (physical change)
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

  // Physical change for the event persona
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

  // Body mark (tattoo, added at baseline)
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

  // Body mark event: tattoo was added at baseline
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

  // Digital identity
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

  // Skill
  await prisma.personSkill.upsert({
    where: { id: "seed-skill-1" },
    update: {},
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

  // Seed a Project
  const project = await prisma.project.upsert({
    where: { id: "seed-project-1" },
    update: {},
    create: {
      id: "seed-project-1",
      name: "Sample Project",
      description: "A sample production project",
      status: "active",
      tags: ["sample"],
    },
  });

  await prisma.projectLabel.upsert({
    where: { projectId_labelId: { projectId: project.id, labelId: label.id } },
    update: {},
    create: { projectId: project.id, labelId: label.id },
  });

  // Seed a Session
  const session = await prisma.session.upsert({
    where: { id: "seed-session-1" },
    update: {},
    create: {
      id: "seed-session-1",
      projectId: project.id,
      name: "Session 1",
      date: new Date("2025-01-15"),
    },
  });

  // Seed a Set
  const set = await prisma.set.upsert({
    where: { id: "seed-set-1" },
    update: {},
    create: {
      id: "seed-set-1",
      sessionId: session.id,
      channelId: channel.id,
      type: "photo",
      title: "Sample Photoset",
      releaseDate: new Date("2025-02-01"),
      tags: ["sample"],
    },
  });

  // Seed a SetContribution
  await prisma.setContribution.upsert({
    where: { setId_personId: { setId: set.id, personId: person.id } },
    update: {},
    create: {
      setId: set.id,
      personId: person.id,
      role: "main",
    },
  });

  // Seed Activity entries
  const activities = [
    { id: "seed-activity-1", title: "Jane added to database", type: "person_added" as const, time: new Date() },
    { id: "seed-activity-2", title: "Sample Photoset published", type: "set_added" as const, time: new Date(Date.now() - 3600000) },
    { id: "seed-activity-3", title: "Sample Project created", type: "project_added" as const, time: new Date(Date.now() - 7200000) },
    { id: "seed-activity-4", title: "Sample Studio added", type: "label_added" as const, time: new Date(Date.now() - 86400000) },
  ];

  for (const a of activities) {
    await prisma.activity.upsert({
      where: { id: a.id },
      update: {},
      create: a,
    });
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
