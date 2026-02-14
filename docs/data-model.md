# Pulseboard — Data Model

The source of truth for the database schema is `prisma/schema.prisma`.

## Person

| Field | Type | Description |
|---|---|---|
| `id` | `String` | Primary key (cuid) |
| `firstName` | `String` | First name |
| `lastName` | `String` | Last name |
| `email` | `String` | Email address (unique) |
| `avatarColor` | `String` | Hex color for initials avatar |
| `createdAt` | `DateTime` | Auto-set on creation |

## Project

| Field | Type | Description |
|---|---|---|
| `id` | `String` | Primary key (cuid) |
| `name` | `String` | Project name |
| `description` | `String` | Project description |
| `status` | `ProjectStatus` | Enum: `active`, `paused`, `done` |
| `tags` | `String[]` | PostgreSQL native array |
| `stakeholderId` | `String` | FK → Person |
| `leadId` | `String` | FK → Person |
| `createdAt` | `DateTime` | Auto-set on creation |
| `updatedAt` | `DateTime` | Auto-updated by Prisma |

## ProjectMember (Join Table)

| Field | Type | Description |
|---|---|---|
| `id` | `String` | Primary key (cuid) |
| `projectId` | `String` | FK → Project |
| `personId` | `String` | FK → Person |

Unique constraint: `(projectId, personId)`

## Activity

| Field | Type | Description |
|---|---|---|
| `id` | `String` | Primary key (cuid) |
| `title` | `String` | Activity description |
| `time` | `DateTime` | When the activity occurred |
| `type` | `ActivityType` | Enum: `deploy`, `note`, `task` |
| `createdAt` | `DateTime` | Auto-set on creation |

## Enums

```prisma
enum ProjectStatus {
  active
  paused
  done
}

enum ActivityType {
  deploy
  note
  task
}
```

## ProjectRole (Computed Type)

```typescript
type ProjectRole = "stakeholder" | "lead" | "member";
```

Roles are **not stored on the Person** — they are computed from the Project's FK fields and the `ProjectMember` join table. A single person can have different roles across different projects.

### `PersonProjectAssignment` (Computed Type)

```typescript
type PersonProjectAssignment = {
  project: Project;
  role: ProjectRole;
};
```

This type is never persisted. It is returned by `getPersonRoles(personId)` which queries stakeholder/lead relations and the join table.

## ER Diagram

```
Person (1) ──< stakeholder >── (N) Project
Person (1) ──< lead >────────── (N) Project
Person (N) ──< member >──────── (N) Project  [join table: ProjectMember]
```

A person can be:
- Stakeholder of multiple projects
- Lead of multiple projects
- Member of multiple projects
- Any combination of roles across different projects
