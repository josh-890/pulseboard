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

## Soft Delete

All models include a `deletedAt DateTime?` field. The Prisma client extension in `lib/prisma-extensions.ts` auto-filters `deletedAt: null` on all read queries (`findMany`, `findFirst`, `findUnique`, `count`). Write operations (create, update, delete) are **not** affected by the extension.

**Soft delete pattern:** Instead of `prisma.model.delete()`, use `prisma.model.update({ data: { deletedAt: new Date() } })`.

When deleting a **Project**: soft-delete the project and all associated `ProjectMember` records.

When deleting a **Person**: guard against deletion if person is a stakeholder or lead on any project. If safe, soft-delete the person and their `ProjectMember` records.

## Mutations (Server Actions)

All mutations are in `lib/actions/` and follow this pattern:
1. Validate input with Zod schema
2. Perform database mutation via Prisma
3. Log an `Activity` record (type: `task` for creates, `note` for updates/deletes)
4. Call `revalidatePath()` to refresh affected routes

### Member Sync on Project Update

When updating project members, use `prisma.projectMember.upsert()` with the unique `[projectId, personId]` constraint to handle re-adding previously soft-deleted members (sets `deletedAt: null`). Members no longer in the list are soft-deleted.

## ER Diagram

A person can be:
- Stakeholder of multiple projects
- Lead of multiple projects
- Member of multiple projects
- Any combination of roles across different projects
