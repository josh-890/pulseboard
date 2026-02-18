# Pulseboard — Data Model Reference

## Overview

Pulseboard tracks people in art production — their profiles, work history, inter-personal connections, and the organizations/sets they're associated with.

```
Network ──< LabelNetwork >── Label ──< Channel
                              |
                         ProjectLabel
                              |
                           Project
                              |
                           Session
                              |
                            Set ──< SetContribution >── Person
                                                             |
                                                          Alias
                                                         Persona
                                                    PersonRelationship
```

---

## Enums

| Enum | Values |
|---|---|
| `PersonStatus` | `active`, `inactive`, `wishlist`, `archived` |
| `ContributionRole` | `main`, `supporting`, `background` |
| `SetType` | `photo`, `video` |
| `RelationshipSource` | `derived`, `manual` |
| `ProjectStatus` | `active`, `paused`, `completed` |
| `ActivityType` | `person_added`, `set_added`, `project_added`, `label_added`, `note` |
| `EntityType` | `person`, `set` |

---

## Models

### `Person`
The central entity. Rich profile combining personal, physical, demographic, career, and assessment data.

| Field | Type | Notes |
|---|---|---|
| `id` | `String` | cuid |
| `firstName` | `String` | |
| `lastName` | `String` | |
| `birthdate` | `DateTime?` | |
| `nationality` | `String?` | |
| `ethnicity` | `String?` | |
| `location` | `String?` | City / country |
| `height` | `Int?` | cm |
| `hairColor` | `String?` | |
| `eyeColor` | `String?` | |
| `bodyType` | `String?` | Free-form tag |
| `measurements` | `String?` | |
| `activeSince` | `Int?` | Year |
| `specialization` | `String?` | |
| `status` | `PersonStatus` | default: `active` |
| `rating` | `Int?` | 1–5 |
| `notes` | `String?` | Personal assessment notes |
| `tags` | `String[]` | User-defined labels |
| `createdAt` | `DateTime` | |
| `deletedAt` | `DateTime?` | Soft delete |

Relations: `aliases[]`, `personas[]`, `contributions[]`, `relationships[]`, `relatedTo[]`

---

### `PersonAlias`
Flat list of known names for a person — used for text search.

| Field | Type | Notes |
|---|---|---|
| `id` | `String` | cuid |
| `personId` | `String` | FK → Person |
| `name` | `String` | The alias/stage name |
| `isPrimary` | `Boolean` | One alias is the display name |
| `deletedAt` | `DateTime?` | |

Indexes: `(personId)`, `(name)`

---

### `Persona`
An independent working identity with description. Not bound to a label.

| Field | Type | Notes |
|---|---|---|
| `id` | `String` | cuid |
| `personId` | `String` | FK → Person |
| `name` | `String` | Persona/stage name |
| `description` | `String?` | |
| `notes` | `String?` | |
| `isBaseline` | `Boolean` | "Real" identity |
| `createdAt` | `DateTime` | |
| `deletedAt` | `DateTime?` | |

---

### `PersonRelationship`
Tracks connections between persons — derived from shared sets or manually labelled.

| Field | Type | Notes |
|---|---|---|
| `id` | `String` | cuid |
| `personAId` | `String` | FK → Person |
| `personBId` | `String` | FK → Person |
| `source` | `RelationshipSource` | `derived` or `manual` |
| `label` | `String?` | e.g. "frequent collaborators" |
| `sharedSetCount` | `Int` | Auto-calculated |
| `deletedAt` | `DateTime?` | |

Unique constraint: `(personAId, personBId)`

---

### `Network`
Groups of linked Labels.

| Field | Type | Notes |
|---|---|---|
| `id` | `String` | cuid |
| `name` | `String` | |
| `description` | `String?` | |
| `website` | `String?` | |
| `deletedAt` | `DateTime?` | |

Relations: `labelMemberships[]` (via `LabelNetwork`)

---

### `Label`
A producing organization. Can own channels and co-own projects.

| Field | Type | Notes |
|---|---|---|
| `id` | `String` | cuid |
| `name` | `String` | |
| `description` | `String?` | |
| `website` | `String?` | |
| `deletedAt` | `DateTime?` | |

Relations: `networks[]` (via `LabelNetwork`), `channels[]`, `projects[]` (via `ProjectLabel`)

---

### `LabelNetwork` (join)
| Field | Type |
|---|---|
| `labelId` | FK → Label |
| `networkId` | FK → Network |

Composite PK: `(labelId, networkId)`

---

### `Channel`
A subscription/content platform belonging to a Label.

| Field | Type | Notes |
|---|---|---|
| `id` | `String` | cuid |
| `labelId` | `String` | FK → Label |
| `name` | `String` | |
| `url` | `String?` | |
| `platform` | `String?` | e.g. "OnlyFans", "website" |
| `deletedAt` | `DateTime?` | |

Relations: `sets[]`

---

### `Project`
An art production project. Can be co-owned by multiple Labels.

| Field | Type | Notes |
|---|---|---|
| `id` | `String` | cuid |
| `name` | `String` | |
| `description` | `String?` | |
| `status` | `ProjectStatus` | default: `active` |
| `tags` | `String[]` | |
| `createdAt` | `DateTime` | |
| `updatedAt` | `DateTime` | auto |
| `deletedAt` | `DateTime?` | |

Relations: `labels[]` (via `ProjectLabel`), `sessions[]`

---

### `ProjectLabel` (join)
| Field | Type |
|---|---|
| `projectId` | FK → Project |
| `labelId` | FK → Label |

Composite PK: `(projectId, labelId)`

---

### `Session`
A single shoot/recording session within a project.

| Field | Type | Notes |
|---|---|---|
| `id` | `String` | cuid |
| `projectId` | `String` | FK → Project |
| `name` | `String` | |
| `description` | `String?` | |
| `date` | `DateTime?` | When the session took place |
| `createdAt` | `DateTime` | |
| `deletedAt` | `DateTime?` | |

Relations: `sets[]`

---

### `Set`
The publishable output of a session (photoset or videoset).

| Field | Type | Notes |
|---|---|---|
| `id` | `String` | cuid |
| `sessionId` | `String` | FK → Session |
| `channelId` | `String?` | FK → Channel (where published) |
| `type` | `SetType` | `photo` or `video` |
| `title` | `String` | |
| `description` | `String?` | |
| `notes` | `String?` | Trivia, behind-the-scenes |
| `releaseDate` | `DateTime?` | |
| `category` | `String?` | |
| `genre` | `String?` | |
| `tags` | `String[]` | |
| `createdAt` | `DateTime` | |
| `deletedAt` | `DateTime?` | |

Relations: `contributions[]` (via `SetContribution`), photos via `Photo(entityType=set, entityId=set.id)`

---

### `SetContribution`
Person's involvement in a Set with their role.

| Field | Type | Notes |
|---|---|---|
| `id` | `String` | cuid |
| `setId` | `String` | FK → Set |
| `personId` | `String` | FK → Person |
| `role` | `ContributionRole` | `main`, `supporting`, `background` |
| `deletedAt` | `DateTime?` | |

Unique: `(setId, personId)`

---

### `Photo`
Polymorphic photo model. `entityType` + `entityId` together identify the owning entity.

| Field | Type | Notes |
|---|---|---|
| `id` | `String` | cuid |
| `entityType` | `EntityType` | `person` or `set` |
| `entityId` | `String` | ID of the owning entity |
| `filename` | `String` | |
| `mimeType` | `String` | |
| `size` | `Int` | bytes |
| `originalWidth` | `Int` | |
| `originalHeight` | `Int` | |
| `variants` | `Json` | Resized versions (thumb, medium, large) |
| `tags` | `String[]` | Person-tagging, GIN indexed |
| `linkedEntityType` | `String?` | Optional secondary link |
| `linkedEntityId` | `String?` | Optional secondary link |
| `caption` | `String?` | |
| `isFavorite` | `Boolean` | Profile image selection |
| `sortOrder` | `Int` | Display order |
| `createdAt` | `DateTime` | |
| `deletedAt` | `DateTime?` | |

---

### `Setting`
Key/value store for app configuration.

| Field | Type |
|---|---|
| `key` | `String` (PK) |
| `value` | `String` |
| `updatedAt` | `DateTime` |

---

### `Activity`
Dashboard feed entries.

| Field | Type | Notes |
|---|---|---|
| `id` | `String` | cuid |
| `title` | `String` | Human-readable description |
| `time` | `DateTime` | When the event occurred |
| `type` | `ActivityType` | |
| `createdAt` | `DateTime` | |
| `deletedAt` | `DateTime?` | |

---

## Soft Delete

All models except `Setting` and join tables (`LabelNetwork`, `ProjectLabel`) have a `deletedAt` field. The Prisma soft-delete extension automatically filters `deletedAt: null` on all read operations.
