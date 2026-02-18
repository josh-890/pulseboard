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

  // Seed a sample Person
  const person = await prisma.person.upsert({
    where: { id: "seed-person-1" },
    update: {},
    create: {
      id: "seed-person-1",
      firstName: "Jane",
      lastName: "Doe",
      status: "active",
      specialization: "Photographer",
      location: "Los Angeles, CA",
    },
  });

  await prisma.personAlias.upsert({
    where: { id: "seed-alias-1" },
    update: {},
    create: {
      id: "seed-alias-1",
      personId: person.id,
      name: "Jane Doe",
      isPrimary: true,
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
    { id: "seed-activity-1", title: "Jane Doe added to database", type: "person_added" as const, time: new Date() },
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
