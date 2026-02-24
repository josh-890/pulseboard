# Architecture Doctrine — Model Production & Publication Management System
Version: 1.0  
Generated: 2026-02-24 10:20:24

---

## 0. Intent

This doctrine documents the *architecture philosophy* and the *non-negotiable rules* that govern design decisions in the system.

It exists to:
- Keep the system consistent over time
- Prevent silent data corruption
- Enable future feature expansion without rewrites
- Align UI, data model, and workflows to the real-world domain

This doctrine is written to be used alongside the Technical Specification.

---

## 1. The Central Model: Reality vs Observation

### 1.1 Definitions

**Production Reality (Truth):**
What happened in the real world during content creation.

**Distribution Observation (Evidence):**
What is published and marketed publicly.

The system enforces this split because public artifacts are not a faithful representation of production reality.
They can be:
- Re-cut
- Curated
- Re-released
- Re-labeled
- Compiled from multiple sources
- Missing credits or containing ambiguous aliases

### 1.2 Consequence

- A **Session** is the canonical record of collaboration and capture.
- A **MediaItem** is a captured artifact produced during exactly one Session.
- A **Set** is a publication artifact that *references* media but cannot redefine how that media was produced.

### 1.3 Non-negotiable invariant

> **MediaItem belongs to exactly one Session. Always.**  
> This is the anchor that keeps the production timeline coherent.

---

## 2. Uncertainty is a First-Class Citizen

### 2.1 What is uncertain at import time

When ingesting a Set, the system typically only knows:
- Title
- Channel
- PublishedAt
- Raw names/aliases of models (often ambiguous)
- Photographer name (rare)

Uncertain:
- Which Session produced it
- Whether it is a compilation
- Correct identity mapping of names to Persons
- Whether Channel implies Label reliably

### 2.2 Principle

> **Never convert uncertainty into assumed truth.**

The system stores raw input as *staged data* and tracks its resolution process explicitly.

### 2.3 Implementation pattern

- Store raw credits (SetCreditRaw) exactly as observed.
- Link to canonical identities only when resolved.
- Store mappings as evidence (SetLabelEvidence), not facts.

---

## 3. Why Sessions are Not Auto-Created

### 3.1 The risk of auto-creation

Auto-creating Sessions during import would:
- Create misleading “truth” records
- Implicitly assert production context that may be wrong
- Create duplicates when the same production appears in multiple publications
- Make correction expensive (you have to merge/delete “truth”)

### 3.2 Principle

> **Production truth must be deliberate.**

### 3.3 UI implication

The UI is designed to keep the workflow fast without inventing truth:
- Import Set quickly
- Resolve identities quickly
- Allow manual Session creation/assignment when confidence is high

---

## 4. “Compilation” is Emergent, Not Declared

### 4.1 Why manual classification fails

Humans misclassify, forget, or lack information.

### 4.2 Principle

> **Classification should be derived from structural facts whenever possible.**

### 4.3 Derivation rule

A Set is a compilation **iff** it references media from more than one Session:
- `count(distinct MediaItem.sessionId) > 1`

---

## 5. Canonical Identity vs. Credit Text

### 5.1 Two different data types

- **Canonical identity:** the stable internal representation (Person)
- **Credit text:** the externally observed label (rawName)

### 5.2 Principle

> **Canonical identity is stable; credit text is noisy.**

### 5.3 Implication

- Never overwrite rawName with resolved identity.
- Never depend on rawName for joins.
- Always use Person/PersonAlias for identity resolution.

---

## 6. Flexible Roles Through Generic Person

### 6.1 Rationale

Real-world roles can change:
- Model may become photographer
- Photographer may appear as model
- People may have multiple roles across time

### 6.2 Principle

> **Model people, not job titles. Roles are relationships.**

Implementation:
- Person is generic
- Participation is captured via role on SessionParticipant / SetParticipant

---

## 7. Storage Doctrine: Database vs Object Store

### 7.1 Separation

- PostgreSQL stores: metadata, relationships, search indexes, workflow status
- MinIO stores: binary media + derived thumbnails/previews

### 7.2 Principle

> **Database stores meaning; object store stores bytes.**

### 7.3 File references

`MediaItem.fileRef` (or richer fields) must be treated as:
- immutable pointer to bytes
- not a substitute for metadata
- always validated by worker processing

---

## 8. Performance Doctrine (Local-first)

### 8.1 Targets

- Person search: <50ms
- Resolve queue interactions: “type-to-result” feels instantaneous
- Media grid: smooth browsing (thumbnails)

### 8.2 Principle

> **Optimize the 2-second loop.**  
> The system’s success depends on rapid repeated actions: import → resolve → curate.

### 8.3 Techniques

- Trigram indexes on normalized name columns
- Precomputed thumbnails
- Background jobs for heavy processing
- Minimal joins on hot paths; denormalize only with clear ownership

---

## 9. Denormalization Policy

### 9.1 Allowed

Denormalize only when:
- It materially improves a hot path
- It has clear ownership and recalculation rules
- It does not replace the canonical record

Examples:
- `Set.isCompilation` derived flag
- Optional `SetSessionIndex` derived mapping table

### 9.2 Forbidden

- Duplicating production truth inside Set
- Duplicating media ownership across Sets
- Copying raw credits into canonical identity fields

---

## 10. Migration & Evolution Doctrine

### 10.1 Principle

> **Evolve by adding, not rewriting.**

- Prefer additive schema changes
- Keep backward-compatible interpretations where possible
- Version workflows, not the entire system

### 10.2 Guardrails

- Keep invariants intact (Media → Session)
- Keep staged/raw data preserved
- Keep evidence separate from fact

---

## 11. Operational Doctrine (Local, but still professional)

- Use Docker Compose for predictable local deployment
- Implement backups from day 1:
  - Postgres dump/snapshot
  - MinIO bucket backup/versioning
- Add a minimal Job Admin UI:
  - failed jobs
  - retry
  - last error

---

## 12. Checklist of Non-Negotiables

1. `MediaItem.sessionId` is required and never changes without an explicit “move” operation.
2. Sets never own production truth (participants/time/location).
3. Sessions are never created automatically from import.
4. Raw credits are always stored; resolution is additive.
5. Compilation status is derived from linked media.
6. All identity search uses normalized fields and indexed lookup.
7. Heavy processing runs in a worker, not in request handlers.

---

## 13. Practical Decision Framework (When unsure)

When faced with a design decision, ask:

1. Does this store **truth** or **observation**?
2. Is this **certain** or **uncertain**?
3. Can it be **derived** from other facts?
4. Would a wrong value cause **silent corruption**?
5. Is it a **hot path** that needs performance optimization?
6. Can we implement it **additively**?

If it is uncertain or derivable → model it as evidence/derived.  
If it is truth → put it in Production entities.  
If it improves a hot path → allow derived denormalization with clear recalculation.

---
