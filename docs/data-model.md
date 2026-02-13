# Pulseboard — Data Model

## Person

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Primary key (`p1`–`p10`) |
| `firstName` | `string` | First name |
| `lastName` | `string` | Last name |
| `email` | `string` | Email address |
| `avatarColor` | `string` | Hex color for initials avatar |

## Project (Extended)

New FK fields added to the existing `Project` type:

| Field | Type | Description |
|---|---|---|
| `stakeholderId` | `string` | FK → Person (1:1 per project) |
| `leadId` | `string` | FK → Person (1:1 per project) |
| `memberIds` | `string[]` | FK[] → Person (1:N per project) |

## ProjectRole (Derived)

```typescript
type ProjectRole = "stakeholder" | "lead" | "member";
```

Roles are **not stored on the Person** — they are computed from the Project's FK fields. A single person can have different roles across different projects.

### `PersonProjectAssignment` (Computed Type)

```typescript
type PersonProjectAssignment = {
  project: Project;
  role: ProjectRole;
};
```

This type is never persisted. It is returned by `getPersonRoles(personId)` which scans all projects and builds the list dynamically.

## DB Mapping

In a real database, the relationships would map as follows:

- `stakeholderId` → `projects.stakeholder_id` (FK to `persons.id`)
- `leadId` → `projects.lead_id` (FK to `persons.id`)
- `memberIds` → `project_members` join table

### Join Table: `project_members`

| Column | Type |
|---|---|
| `project_id` | FK → `projects.id` |
| `person_id` | FK → `persons.id` |

Composite primary key: `(project_id, person_id)`

## ER Diagram

```
Person (1) ──< stakeholder >── (N) Project
Person (1) ──< lead >────────── (N) Project
Person (N) ──< member >──────── (N) Project  [join table: project_members]
```

A person can be:
- Stakeholder of multiple projects
- Lead of multiple projects
- Member of multiple projects
- Any combination of roles across different projects
