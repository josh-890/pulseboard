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
  },
  {
    id: "2",
    name: "Blog Engine",
    description:
      "Markdown-based blogging platform with MDX support, RSS feeds, and syntax highlighting.",
    status: "paused",
    updatedAt: "3 days ago",
    tags: ["React", "MDX", "Node.js"],
  },
  {
    id: "3",
    name: "Weather CLI",
    description:
      "Command-line weather tool that fetches forecasts from OpenWeather API with colorful output.",
    status: "done",
    updatedAt: "1 week ago",
    tags: ["TypeScript", "CLI", "API"],
  },
  {
    id: "4",
    name: "Task Tracker API",
    description:
      "RESTful API for managing tasks and projects with authentication and role-based access.",
    status: "active",
    updatedAt: "5 hours ago",
    tags: ["Node.js", "Express", "API"],
  },
  {
    id: "5",
    name: "Design System",
    description:
      "Reusable component library with Storybook documentation and accessibility-first approach.",
    status: "active",
    updatedAt: "1 day ago",
    tags: ["React", "Design", "Storybook"],
  },
  {
    id: "6",
    name: "E-commerce Prototype",
    description:
      "Shopping cart prototype with product catalog, filtering, and mock checkout flow.",
    status: "paused",
    updatedAt: "2 weeks ago",
    tags: ["React", "TypeScript", "Design"],
  },
  {
    id: "7",
    name: "Chat App",
    description:
      "Real-time messaging application with WebSocket connections and message persistence.",
    status: "done",
    updatedAt: "1 month ago",
    tags: ["React", "WebSocket", "Node.js"],
  },
  {
    id: "8",
    name: "Portfolio Site",
    description:
      "Personal portfolio website with project showcases, blog integration, and contact form.",
    status: "done",
    updatedAt: "3 weeks ago",
    tags: ["Next.js", "Design", "TypeScript"],
  },
];
