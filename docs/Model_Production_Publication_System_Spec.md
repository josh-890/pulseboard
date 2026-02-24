# 📸 Model Production & Publication Management System

## Complete Technical Specification (Single-File Version)

Version: 1.0\
Generated: 2026-02-24 10:12:19\
Target Stack: Next.js (App Router) + TypeScript + PostgreSQL + Prisma +
MinIO\
Deployment: Local Desktop (Home Network)

------------------------------------------------------------------------

# 1. System Purpose

This application is a **desktop-first, local production intelligence
system** for managing:

-   Models (identity-centric)
-   Sessions (production truth)
-   Labels & Networks (organizational structure)
-   Sets (published releases / distribution artifacts)
-   Channels (distribution platforms)
-   Media (photo & video assets)
-   Alias resolution & identity disambiguation

The system is:

-   Photo-driven
-   Production-centric (Sessions & Labels are truth)
-   Optimized for fast ingestion from known Set metadata
-   Designed for long-term structural consistency
-   Fully local (no external dependencies required)

------------------------------------------------------------------------

# 2.1 Architectural Overview

## Stack

-   Frontend + Backend: Next.js (App Router)
-   Language: TypeScript
-   Database: PostgreSQL (local)
-   ORM: Prisma
-   Object Storage: MinIO (S3-compatible, local)
-   Background Jobs: Node.js Worker process
-   Deployment: Docker Compose (recommended)

## Core Architectural Principles

1.  Production Layer is Truth.
2.  Distribution Layer is Observation.
3.  Uncertainty is modeled explicitly as Evidence.
4.  Media belongs to Sessions.
5.  Sets curate media but do not own production truth.
6.  Sessions are never auto-created.
7.  Raw import data is never discarded.

------------------------------------------------------------------------

# 2.2 Domain Model Philosophy

## Layer Separation

### Production Layer (Source of Truth)

-   Network
-   Label
-   Project
-   Session
-   SessionParticipant
-   MediaItem

### Distribution Layer (Observed Publications)

-   Channel
-   Set (Publication)
-   SetMediaItem

### Identity & Resolution Layer

-   Person
-   PersonAlias
-   SetCreditRaw
-   SetParticipant

### Evidence Layer

-   ChannelLabelMap
-   SetLabelEvidence


------------------------------------------------------------------------

# 3. Foundational Design Principles & Thought Process

This section explains the architectural reasoning behind the structure
of the system.\
It is critical for long-term maintainability and correct evolution.

------------------------------------------------------------------------

## 3.1 Production vs Distribution Separation

The most important architectural decision is the strict separation
between:

**Production Reality (Truth)**\
and\
**Distribution Observation (Evidence)**

Production entities: - Network - Label - Project - Session - MediaItem

Distribution entities: - Channel - Set

### Why this separation exists

Sets are *what you see publicly*.\
Sessions are *what actually happened in reality*.

Public releases are often incomplete, reorganized, re-cut, republished,
or compiled.\
Production truth must remain independent of publication artifacts.

If Sets owned media or production metadata: - Compilation sets would
corrupt historical truth - Re-releases would duplicate production - Data
inconsistencies would accumulate

Therefore:

**Media belongs to Session. Always.** Sets only curate.

------------------------------------------------------------------------

## 3.2 Modeling Uncertainty Explicitly

During import, you do NOT know: - Which Session produced a Set - Whether
a Set is a Compilation - Whether aliases are accurate - Whether Channel
→ Label mapping is correct

Instead of guessing, the system:

-   Stores raw input
-   Models inference as Evidence
-   Avoids auto-creation of production entities

This avoids long-term data corruption.

Principle:

> Never convert uncertainty into assumed truth.

------------------------------------------------------------------------

## 3.3 Why Sessions Are Never Auto-Created

Automatically generating Sessions during import would:

-   Implicitly assert production reality
-   Create artificial duplication
-   Hide uncertainty
-   Make correction difficult

Instead:

-   Sets are created
-   Credits are staged (SetCreditRaw)
-   Sessions are created manually and deliberately

Production truth must be intentional.

------------------------------------------------------------------------

## 3.4 Why Raw Credits Are Preserved

Alias resolution is lossy if raw data is overwritten.

Therefore:

-   Raw credit text is stored permanently
-   Resolution status is tracked
-   Person entities are linked separately

This ensures:

-   Auditability
-   Re-resolution if mistakes occur
-   Future alias expansion

------------------------------------------------------------------------

## 3.5 Compilation as Emergent Property

A Set is marked `isCompilation = true` only if:

Distinct Sessions across linked MediaItems \> 1

This avoids manual classification errors.

Compilation is not declared. It is detected.

------------------------------------------------------------------------

## 3.6 Why Media Belongs to Session

Sessions represent real-world production events.

MediaItems: - Were captured during Sessions - Share participants - Share
production context

If Media belonged to Set:

-   Compilation would break normalization
-   Same photo in two Sets would duplicate data
-   Production timeline would fragment

Therefore:

MediaItem.sessionId is NOT NULL.

------------------------------------------------------------------------

## 3.7 Identity Model Philosophy

People are modeled generically (Person) rather than separated rigidly.

Reasoning:

-   A Model may become Photographer
-   A Photographer may appear as Model
-   Roles change across Sessions

Flexibility \> premature rigid typing.

Aliases are separated because:

-   Multiple aliases per person are common
-   Platform-specific naming exists
-   Raw import data must not override canonical identity

------------------------------------------------------------------------

## 3.8 Why PostgreSQL Is Sufficient

Because this is local:

-   Data volume is moderate
-   Query latency must be sub-50ms
-   Full distributed search engines are unnecessary

Using: - pg_trgm - GIN indexes - Proper normalization

Provides sufficient performance without additional infrastructure.

------------------------------------------------------------------------

## 3.9 Worker Architecture Rationale

Media processing is heavy:

-   EXIF extraction
-   Hashing
-   Thumbnail generation
-   Video duration parsing

Blocking web requests would: - Reduce responsiveness - Increase failure
coupling

Therefore:

-   Upload is decoupled
-   MediaItem record created
-   Worker processes asynchronously

------------------------------------------------------------------------

## 3.10 Long-Term Stability Principles

This system is designed to:

-   Prevent silent corruption
-   Support historical reconstruction
-   Allow structural evolution
-   Maintain auditability
-   Scale in data complexity (not necessarily user count)

Key invariants:

1.  Media belongs to exactly one Session.
2.  Sessions represent production truth.
3.  Sets represent publication observation.
4.  Raw data is never discarded.
5.  No implicit production creation.
6.  Evidence is modeled separately from fact.







------------------------------------------------------------------------

# 4. Database Schema (Prisma Models)

All \*\_norm fields must be stored: - lowercase - diacritics removed -
trimmed

Required PostgreSQL extensions:

``` sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
```

------------------------------------------------------------------------

## Identity Layer

``` prisma
model Person {
  id               String   @id @default(uuid())
  displayName      String
  displayNameNorm  String   @db.VarChar(255)
  type             PersonType?
  notes            String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  aliases          PersonAlias[]
  sessionLinks     SessionParticipant[]
  setLinks         SetParticipant[]
}

model PersonAlias {
  id          String   @id @default(uuid())
  personId    String
  alias       String
  aliasNorm   String
  source      AliasSource
  createdAt   DateTime @default(now())

  person      Person   @relation(fields: [personId], references: [id])

  @@index([aliasNorm])
  @@unique([personId, aliasNorm])
}

enum PersonType {
  MODEL
  PHOTOGRAPHER
  BOTH
}

enum AliasSource {
  MANUAL
  IMPORT
}
```

------------------------------------------------------------------------

## Production Layer

``` prisma
model Network {
  id      String @id @default(uuid())
  name    String
  notes   String?

  labels  LabelNetworkLink[]
}

model Label {
  id      String @id @default(uuid())
  name    String
  notes   String?

  networks  LabelNetworkLink[]
  projects  Project[]
  sessions  Session[]
}

model LabelNetworkLink {
  labelId   String
  networkId String

  label     Label   @relation(fields: [labelId], references: [id])
  network   Network @relation(fields: [networkId], references: [id])

  @@id([labelId, networkId])
}

model Project {
  id        String   @id @default(uuid())
  labelId   String
  name      String
  startAt   DateTime?
  endAt     DateTime?
  notes     String?

  label     Label    @relation(fields: [labelId], references: [id])
  sessions  Session[]
}

model Session {
  id               String   @id @default(uuid())
  labelId          String?
  projectId        String?
  producedStartAt  DateTime?
  producedEndAt    DateTime?
  location         String?
  status           SessionStatus @default(DRAFT)
  notes            String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  label            Label?   @relation(fields: [labelId], references: [id])
  project          Project? @relation(fields: [projectId], references: [id])

  participants     SessionParticipant[]
  mediaItems       MediaItem[]
}

enum SessionStatus {
  DRAFT
  CONFIRMED
}

model SessionParticipant {
  sessionId String
  personId  String
  role      ParticipantRole
  creditNameOverride String?

  session   Session @relation(fields: [sessionId], references: [id])
  person    Person  @relation(fields: [personId], references: [id])

  @@id([sessionId, personId, role])
}
```

------------------------------------------------------------------------

## Media Layer

``` prisma
model MediaItem {
  id           String   @id @default(uuid())
  sessionId    String
  capturedAt   DateTime?
  mediaType    MediaType
  fileRef      String
  hash         String?
  width        Int?
  height       Int?
  durationMs   Int?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  session      Session  @relation(fields: [sessionId], references: [id])
  sets         SetMediaItem[]

  @@index([sessionId])
  @@index([hash])
}

enum MediaType {
  PHOTO
  VIDEO
}
```

------------------------------------------------------------------------

## Distribution Layer

``` prisma
model Channel {
  id      String @id @default(uuid())
  name    String
  notes   String?

  sets    Set[]
}

model Set {
  id                 String   @id @default(uuid())
  title              String
  channelId          String
  publishedAt        DateTime
  notes              String?
  coverMediaItemId   String?
  isCompilation      Boolean  @default(false)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  channel            Channel  @relation(fields: [channelId], references: [id])
  media              SetMediaItem[]
  creditsRaw         SetCreditRaw[]
  participants       SetParticipant[]

  @@index([channelId, publishedAt])
}

model SetMediaItem {
  setId        String
  mediaItemId  String
  sortOrder    Int
  isCover      Boolean?
  caption      String?
  notes        String?

  set          Set       @relation(fields: [setId], references: [id])
  mediaItem    MediaItem @relation(fields: [mediaItemId], references: [id])

  @@id([setId, mediaItemId])
}
```

------------------------------------------------------------------------

## Resolution & Evidence

``` prisma
model SetCreditRaw {
  id                String   @id @default(uuid())
  setId             String
  role              ParticipantRole
  rawName           String
  nameNorm          String
  resolutionStatus  ResolutionStatus @default(UNRESOLVED)
  resolvedPersonId  String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  set               Set      @relation(fields: [setId], references: [id])
  resolvedPerson    Person?  @relation(fields: [resolvedPersonId], references: [id])

  @@index([resolutionStatus])
  @@index([nameNorm])
}

model SetParticipant {
  setId    String
  personId String
  role     ParticipantRole

  set      Set    @relation(fields: [setId], references: [id])
  person   Person @relation(fields: [personId], references: [id])

  @@id([setId, personId, role])
}

model ChannelLabelMap {
  channelId String
  labelId   String
  confidence Float
  notes      String?

  @@id([channelId, labelId])
}

model SetLabelEvidence {
  setId        String
  labelId      String
  evidenceType EvidenceType
  confidence   Float

  @@id([setId, labelId, evidenceType])
}

enum ParticipantRole {
  MODEL
  PHOTOGRAPHER
}

enum ResolutionStatus {
  UNRESOLVED
  RESOLVED
  IGNORED
}

enum EvidenceType {
  CHANNEL_MAP
  MANUAL
}
```

------------------------------------------------------------------------

# 5. Search Strategy

## Person Search Ranking

1.  Exact alias match
2.  Exact display name match
3.  Prefix match
4.  Trigram similarity
5.  Recency boost

Recommended Indexes:

``` sql
CREATE INDEX person_display_trgm 
ON "Person" USING gin (displayNameNorm gin_trgm_ops);

CREATE INDEX alias_trgm 
ON "PersonAlias" USING gin (aliasNorm gin_trgm_ops);
```

Target latency: \<50ms (local environment)

------------------------------------------------------------------------

# 6. Import Workflow

## Step A --- Quick Set Import

Input: - Title - Channel - PublishedAt - Model Names - Photographer
(optional)

System actions: - Create Set - Create SetCreditRaw (UNRESOLVED) - Create
SetLabelEvidence if mapping exists

No Sessions are auto-created.

------------------------------------------------------------------------

## Step B --- Resolve Credits

For each unresolved credit: - Suggest candidates - On selection: - Mark
RESOLVED - Create SetParticipant - Optionally create new Person

------------------------------------------------------------------------

## Step C --- Session Creation (Manual)

User may: - Create new Session - Assign existing Session - Leave
unassigned

------------------------------------------------------------------------

# 7. Media Upload Architecture

Flow: 1. Client requests upload init 2. Server generates MinIO presigned
PUT URL 3. Client uploads directly 4. Server creates MediaItem 5. Worker
processes metadata

------------------------------------------------------------------------

# 8. Worker Responsibilities

Job Types: - MEDIA_PROCESS - VIDEO_PROCESS - SET_COMPILATION_RECALC -
SEARCH_REINDEX

Worker runs as separate Node process.

------------------------------------------------------------------------

# 9. Non-Functional Requirements

-   Fully local operation
-   Referential integrity enforced
-   Media hash deduplication recommended
-   Nightly Postgres backup
-   MinIO versioning enabled
-   Worker failure logging visible in UI

------------------------------------------------------------------------

# 10. Design Rules

-   Sessions & Labels are production truth
-   Sets are observed publications
-   Media always belongs to Session
-   Compilation emerges from media linkage
-   Never auto-create Sessions
-   Never discard raw credit data
-   Model uncertainty explicitly

------------------------------------------------------------------------

# END OF SPECIFICATION
