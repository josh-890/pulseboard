import type { Project } from "@/lib/types";

export const projects: Project[] = [
  {
    id: "1",
    name: "Pulseboard",
    description:
      "Personal dashboard UI built with Next.js App Router and glassmorphism design system.",
    status: "active",
    updatedAt: "2 hours ago",
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
    status: "paused",
    updatedAt: "3 days ago",
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
    status: "done",
    updatedAt: "1 week ago",
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
    status: "active",
    updatedAt: "5 hours ago",
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
    status: "active",
    updatedAt: "1 day ago",
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
    status: "paused",
    updatedAt: "2 weeks ago",
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
    status: "done",
    updatedAt: "1 month ago",
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
    status: "done",
    updatedAt: "3 weeks ago",
    tags: ["Next.js", "Design", "TypeScript"],
    stakeholderId: "p9",
    leadId: "p3",
    memberIds: ["p5", "p10"],
  },
];
