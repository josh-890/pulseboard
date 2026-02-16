import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

function parseRelativeTime(relative: string): Date {
  const now = new Date();
  const num = parseInt(relative) || 1;
  if (relative.includes("hour"))
    return new Date(now.getTime() - num * 3600000);
  if (relative.includes("day")) return new Date(now.getTime() - num * 86400000);
  if (relative.includes("week"))
    return new Date(now.getTime() - num * 604800000);
  if (relative.includes("month"))
    return new Date(now.getTime() - num * 2592000000);
  return now;
}

const persons = [
  {
    id: "p1",
    firstName: "Sarah",
    lastName: "Chen",
    email: "sarah.chen@example.com",
    avatarColor: "#6366f1",
  },
  {
    id: "p2",
    firstName: "Marcus",
    lastName: "Johnson",
    email: "marcus.j@example.com",
    avatarColor: "#8b5cf6",
  },
  {
    id: "p3",
    firstName: "Aisha",
    lastName: "Patel",
    email: "aisha.patel@example.com",
    avatarColor: "#ec4899",
  },
  {
    id: "p4",
    firstName: "Liam",
    lastName: "O'Brien",
    email: "liam.obrien@example.com",
    avatarColor: "#14b8a6",
  },
  {
    id: "p5",
    firstName: "Yuki",
    lastName: "Tanaka",
    email: "yuki.tanaka@example.com",
    avatarColor: "#f97316",
  },
  {
    id: "p6",
    firstName: "Elena",
    lastName: "Rossi",
    email: "elena.rossi@example.com",
    avatarColor: "#06b6d4",
  },
  {
    id: "p7",
    firstName: "David",
    lastName: "Kim",
    email: "david.kim@example.com",
    avatarColor: "#84cc16",
  },
  {
    id: "p8",
    firstName: "Fatima",
    lastName: "Al-Hassan",
    email: "fatima.ah@example.com",
    avatarColor: "#e11d48",
  },
  {
    id: "p9",
    firstName: "Jonas",
    lastName: "Weber",
    email: "jonas.weber@example.com",
    avatarColor: "#7c3aed",
  },
  {
    id: "p10",
    firstName: "Priya",
    lastName: "Sharma",
    email: "priya.sharma@example.com",
    avatarColor: "#0ea5e9",
  },
];

const projects = [
  {
    id: "1",
    name: "Pulseboard",
    description:
      "Personal dashboard UI built with Next.js App Router and glassmorphism design system.",
    status: "active" as const,
    updatedAt: parseRelativeTime("2 hours ago"),
    tags: ["React", "TypeScript", "Next.js"],
    stakeholderId: "p1",
    leadId: "p2",
    memberIds: ["p3", "p5", "p7"],
  },
  {
    id: "2",
    name: "Blog Engine",
    description:
      "Markdown-based blogging platform with MDX support, RSS feeds, and syntax highlighting.",
    status: "paused" as const,
    updatedAt: parseRelativeTime("3 days ago"),
    tags: ["React", "MDX", "Node.js"],
    stakeholderId: "p1",
    leadId: "p4",
    memberIds: ["p6", "p8"],
  },
  {
    id: "3",
    name: "Weather CLI",
    description:
      "Command-line weather tool that fetches forecasts from OpenWeather API with colorful output.",
    status: "done" as const,
    updatedAt: parseRelativeTime("1 week ago"),
    tags: ["TypeScript", "CLI", "API"],
    stakeholderId: "p3",
    leadId: "p5",
    memberIds: ["p9"],
  },
  {
    id: "4",
    name: "Task Tracker API",
    description:
      "RESTful API for managing tasks and projects with authentication and role-based access.",
    status: "active" as const,
    updatedAt: parseRelativeTime("5 hours ago"),
    tags: ["Node.js", "Express", "API"],
    stakeholderId: "p2",
    leadId: "p6",
    memberIds: ["p1", "p4", "p10"],
  },
  {
    id: "5",
    name: "Design System",
    description:
      "Reusable component library with Storybook documentation and accessibility-first approach.",
    status: "active" as const,
    updatedAt: parseRelativeTime("1 day ago"),
    tags: ["React", "Design", "Storybook"],
    stakeholderId: "p3",
    leadId: "p7",
    memberIds: ["p2", "p8", "p9"],
  },
  {
    id: "6",
    name: "E-commerce Prototype",
    description:
      "Shopping cart prototype with product catalog, filtering, and mock checkout flow.",
    status: "paused" as const,
    updatedAt: parseRelativeTime("2 weeks ago"),
    tags: ["React", "TypeScript", "Design"],
    stakeholderId: "p5",
    leadId: "p10",
    memberIds: ["p3", "p6"],
  },
  {
    id: "7",
    name: "Chat App",
    description:
      "Real-time messaging application with WebSocket connections and message persistence.",
    status: "done" as const,
    updatedAt: parseRelativeTime("1 month ago"),
    tags: ["React", "WebSocket", "Node.js"],
    stakeholderId: "p4",
    leadId: "p8",
    memberIds: ["p1", "p7"],
  },
  {
    id: "8",
    name: "Portfolio Site",
    description:
      "Personal portfolio website with project showcases, blog integration, and contact form.",
    status: "done" as const,
    updatedAt: parseRelativeTime("3 weeks ago"),
    tags: ["Next.js", "Design", "TypeScript"],
    stakeholderId: "p9",
    leadId: "p3",
    memberIds: ["p5", "p10"],
  },
];

const activities = [
  {
    id: "1",
    title: "Deployed Pulseboard v0.1 to preview",
    time: parseRelativeTime("2 hours ago"),
    type: "deploy" as const,
  },
  {
    id: "2",
    title: "Added KPI card component specs",
    time: parseRelativeTime("4 hours ago"),
    type: "note" as const,
  },
  {
    id: "3",
    title: "Completed sidebar navigation layout",
    time: parseRelativeTime("6 hours ago"),
    type: "task" as const,
  },
  {
    id: "4",
    title: "Deployed Task Tracker API v2.3",
    time: parseRelativeTime("1 day ago"),
    type: "deploy" as const,
  },
  {
    id: "5",
    title: "Wrote architecture docs for Design System",
    time: parseRelativeTime("1 day ago"),
    type: "note" as const,
  },
  {
    id: "6",
    title: "Fixed responsive grid on project list",
    time: parseRelativeTime("2 days ago"),
    type: "task" as const,
  },
  {
    id: "7",
    title: "Deployed Blog Engine draft to staging",
    time: parseRelativeTime("3 days ago"),
    type: "deploy" as const,
  },
  {
    id: "8",
    title: "Reviewed pull request for auth module",
    time: parseRelativeTime("3 days ago"),
    type: "task" as const,
  },
  {
    id: "9",
    title: "Sketched wireframes for e-commerce flow",
    time: parseRelativeTime("5 days ago"),
    type: "note" as const,
  },
  {
    id: "10",
    title: "Completed WebSocket integration for Chat App",
    time: parseRelativeTime("1 week ago"),
    type: "task" as const,
  },
];

async function main() {
  console.log("Seeding database...");

  // 1. Upsert persons
  for (const person of persons) {
    await prisma.person.upsert({
      where: { id: person.id },
      update: person,
      create: person,
    });
  }
  console.log(`Seeded ${persons.length} persons`);

  // 2. Upsert projects
  for (const p of projects) {
    const { memberIds: _memberIds, ...project } = p;
    void _memberIds;
    await prisma.project.upsert({
      where: { id: project.id },
      update: project,
      create: project,
    });
  }
  console.log(`Seeded ${projects.length} projects`);

  // 3. Create project members (clear first to avoid duplicates on re-seed)
  await prisma.projectMember.deleteMany();
  for (const project of projects) {
    for (const personId of project.memberIds) {
      await prisma.projectMember.create({
        data: {
          projectId: project.id,
          personId,
        },
      });
    }
  }
  const memberCount = await prisma.projectMember.count();
  console.log(`Seeded ${memberCount} project members`);

  // 4. Upsert activities
  for (const activity of activities) {
    await prisma.activity.upsert({
      where: { id: activity.id },
      update: activity,
      create: activity,
    });
  }
  console.log(`Seeded ${activities.length} activities`);

  // 5. Seed trait categories
  const traitCategories = [
    {
      id: "tc-skill",
      name: "Skill",
      description: "Technical or professional skills",
      icon: "zap",
    },
    {
      id: "tc-cert",
      name: "Certificate",
      description: "Professional certifications and credentials",
      icon: "award",
    },
    {
      id: "tc-bodymod",
      name: "Body Modification",
      description: "Tattoos, piercings, and other body modifications",
      icon: "palette",
    },
    {
      id: "tc-physical",
      name: "Physical Characteristic",
      description: "Notable physical traits and appearance",
      icon: "eye",
    },
    {
      id: "tc-lang",
      name: "Language",
      description: "Spoken and written languages",
      icon: "globe",
    },
    {
      id: "tc-interest",
      name: "Interest",
      description: "Hobbies, interests, and passions",
      icon: "heart",
    },
  ];

  for (const tc of traitCategories) {
    await prisma.traitCategory.upsert({
      where: { id: tc.id },
      update: tc,
      create: tc,
    });
  }
  console.log(`Seeded ${traitCategories.length} trait categories`);

  // 6. Seed persona chains (clear first to avoid duplicates on re-seed)
  await prisma.personaTrait.deleteMany();
  await prisma.persona.deleteMany();

  // Sarah Chen (p1): 3 personas — baseline → promotion + cert → transfer + language + tattoo
  await prisma.persona.create({
    data: {
      personId: "p1",
      sequenceNum: 0,
      effectiveDate: parseRelativeTime("6 months ago"),
      note: "Initial profile",
      jobTitle: "Frontend Developer",
      department: "Engineering",
      phone: "+1-555-0101",
      traits: {
        create: [
          {
            traitCategoryId: "tc-skill",
            name: "React",
            action: "add",
            metadata: { proficiency: "advanced" },
          },
          {
            traitCategoryId: "tc-skill",
            name: "TypeScript",
            action: "add",
            metadata: { proficiency: "intermediate" },
          },
          {
            traitCategoryId: "tc-lang",
            name: "English",
            action: "add",
            metadata: { level: "native" },
          },
          {
            traitCategoryId: "tc-lang",
            name: "Mandarin",
            action: "add",
            metadata: { level: "native" },
          },
          {
            traitCategoryId: "tc-interest",
            name: "Rock Climbing",
            action: "add",
          },
        ],
      },
    },
  });

  await prisma.persona.create({
    data: {
      personId: "p1",
      sequenceNum: 1,
      effectiveDate: parseRelativeTime("3 months ago"),
      note: "Promoted to Senior, earned AWS cert",
      jobTitle: "Senior Frontend Developer",
      traits: {
        create: [
          {
            traitCategoryId: "tc-skill",
            name: "TypeScript",
            action: "add",
            metadata: { proficiency: "expert" },
          },
          {
            traitCategoryId: "tc-cert",
            name: "AWS Solutions Architect",
            action: "add",
            metadata: {
              issuingBody: "Amazon Web Services",
              expiryDate: "2027-03-15",
            },
          },
          {
            traitCategoryId: "tc-skill",
            name: "Next.js",
            action: "add",
            metadata: { proficiency: "advanced" },
          },
        ],
      },
    },
  });

  await prisma.persona.create({
    data: {
      personId: "p1",
      sequenceNum: 2,
      effectiveDate: parseRelativeTime("2 weeks ago"),
      note: "Transferred to Berlin office, started German, got tattoo",
      department: "Engineering (Berlin)",
      address: "Friedrichstraße 42, 10117 Berlin",
      phone: "+49-30-555-0101",
      traits: {
        create: [
          {
            traitCategoryId: "tc-lang",
            name: "German",
            action: "add",
            metadata: { level: "A2" },
          },
          {
            traitCategoryId: "tc-bodymod",
            name: "Dragon tattoo",
            action: "add",
            metadata: { location: "left forearm", description: "Japanese-style dragon" },
          },
        ],
      },
    },
  });

  // Marcus Johnson (p2): 2 personas — baseline → new skill + role change
  await prisma.persona.create({
    data: {
      personId: "p2",
      sequenceNum: 0,
      effectiveDate: parseRelativeTime("4 months ago"),
      note: "Initial profile",
      jobTitle: "Backend Developer",
      department: "Engineering",
      phone: "+1-555-0202",
      traits: {
        create: [
          {
            traitCategoryId: "tc-skill",
            name: "Node.js",
            action: "add",
            metadata: { proficiency: "expert" },
          },
          {
            traitCategoryId: "tc-skill",
            name: "PostgreSQL",
            action: "add",
            metadata: { proficiency: "advanced" },
          },
          {
            traitCategoryId: "tc-lang",
            name: "English",
            action: "add",
            metadata: { level: "native" },
          },
          {
            traitCategoryId: "tc-interest",
            name: "Chess",
            action: "add",
          },
        ],
      },
    },
  });

  await prisma.persona.create({
    data: {
      personId: "p2",
      sequenceNum: 1,
      effectiveDate: parseRelativeTime("1 month ago"),
      note: "Moved to tech lead role, picked up Rust",
      jobTitle: "Tech Lead",
      department: "Platform Engineering",
      traits: {
        create: [
          {
            traitCategoryId: "tc-skill",
            name: "Rust",
            action: "add",
            metadata: { proficiency: "beginner" },
          },
          {
            traitCategoryId: "tc-cert",
            name: "Kubernetes Administrator (CKA)",
            action: "add",
            metadata: {
              issuingBody: "CNCF",
              expiryDate: "2028-01-20",
            },
          },
        ],
      },
    },
  });

  // Aisha Patel (p3): 1 persona — baseline only (minimal case)
  await prisma.persona.create({
    data: {
      personId: "p3",
      sequenceNum: 0,
      effectiveDate: parseRelativeTime("5 months ago"),
      note: "Initial profile",
      jobTitle: "UX Designer",
      department: "Design",
      phone: "+1-555-0303",
      traits: {
        create: [
          {
            traitCategoryId: "tc-skill",
            name: "Figma",
            action: "add",
            metadata: { proficiency: "expert" },
          },
          {
            traitCategoryId: "tc-skill",
            name: "User Research",
            action: "add",
            metadata: { proficiency: "advanced" },
          },
          {
            traitCategoryId: "tc-lang",
            name: "English",
            action: "add",
            metadata: { level: "native" },
          },
          {
            traitCategoryId: "tc-lang",
            name: "Hindi",
            action: "add",
            metadata: { level: "native" },
          },
        ],
      },
    },
  });

  // Auto-generated baseline personas for remaining 7 people
  const baselinePersonas = [
    { personId: "p4", jobTitle: "Full-Stack Developer", department: "Engineering" },
    { personId: "p5", jobTitle: "DevOps Engineer", department: "Infrastructure" },
    { personId: "p6", jobTitle: "Product Manager", department: "Product" },
    { personId: "p7", jobTitle: "QA Engineer", department: "Engineering" },
    { personId: "p8", jobTitle: "Data Analyst", department: "Analytics" },
    { personId: "p9", jobTitle: "Mobile Developer", department: "Engineering" },
    { personId: "p10", jobTitle: "Security Engineer", department: "Infrastructure" },
  ];

  for (const bp of baselinePersonas) {
    await prisma.persona.create({
      data: {
        personId: bp.personId,
        sequenceNum: 0,
        effectiveDate: parseRelativeTime("3 months ago"),
        note: "Initial profile",
        jobTitle: bp.jobTitle,
        department: bp.department,
      },
    });
  }

  const personaCount = await prisma.persona.count();
  const traitCount = await prisma.personaTrait.count();
  console.log(`Seeded ${personaCount} personas with ${traitCount} traits`);

  console.log("Seeding complete!");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
