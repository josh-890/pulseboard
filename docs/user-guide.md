# Pulseboard User Guide

Pulseboard is a personal information management tool for tracking people in art/creative production — their profiles, work history, connections, and the organizations they're associated with.

---

## Table of Contents

1. [Dashboard](#1-dashboard)
2. [People](#2-people)
3. [Sessions](#3-sessions)
4. [Sets](#4-sets)
5. [Collections](#5-collections)
6. [Projects](#6-projects)
7. [Labels](#7-labels)
8. [Channels](#8-channels)
9. [Networks](#9-networks)
10. [Media Management](#10-media-management)
11. [Settings](#11-settings)
12. [Workflows](#12-workflows)
13. [Date Modifiers & Data Quality](#date-modifiers--data-quality)

---

## 1. Dashboard

**Route:** `/`

The dashboard provides a high-level overview of the entire database.

### KPI Cards

A grid of clickable metric cards shows counts for core entities:

| Card | Description |
|------|-------------|
| Sessions | Total sessions (reference + production) |
| Sets | Total sets (photo + video) |
| People | Total persons in the database |
| Labels | Total labels (organizations) |
| Channels | Total channels (distribution outlets) |
| Projects | Total projects |
| Unresolved Credits | Appears only when credits await resolution |

Each card links to its respective list page.

### Activity Feed

The 6 most recent activities appear with timestamps. Activities are logged automatically when entities are created, updated, or deleted. Click any activity to navigate to the related entity.

### Quick Actions

A panel of shortcut buttons for fast navigation to Sessions, Sets, People, Labels, and Projects.

---

## 2. People

**Routes:** `/people`, `/people/[id]`

### People List

The list page shows all persons as cards with headshot thumbnails, names, ICG-IDs, and status badges.

**Search:** Type in the search box to filter by name or ICG-ID. Results update after a 300ms debounce.

**Filters:**
- **Status** — Active, Inactive, Wishlist, Archived
- **Headshot Slot** — Select which profile image slot (1–5) to display on cards

**Pagination:** 50 persons per page. Click "Load more" to fetch additional results (up to 500).

### Create Person

Click **"Add Person"** to open the creation form:

| Field | Required | Notes |
|-------|----------|-------|
| ICG-ID | Yes | Unique identifier (e.g. `AB-12CDE`) |
| Display Name | Yes | Common alias used throughout the app |
| Status | Yes | Active, Inactive, Wishlist, or Archived |
| Sex at Birth | No | |
| Birthdate | No | With precision (Unknown/Year/Month/Day), modifier, and source |
| Birth Place | No | |
| Natural Hair Color | No | |

### Person Detail

The detail page has two main sections: a **Reference Media Card** at the top and a **tabbed interface** below.

#### Reference Media Card

Shows a link to the person's reference session (auto-created, one per person). Displays up to 5 headshot slot thumbnails with customizable slot labels. Click to navigate to the reference session for media management.

#### Tabs

**Overview**
- **About [Name]** — editable bio section with Markdown support (see [Bio & Markdown](#bio--markdown) below)
- Recent Photos — horizontal scroll of latest reference photos with lightbox
- History — collapsible persona timeline
- Digital Identities, Notes & Tags

#### Bio & Markdown

The About card on the Overview tab supports **Markdown formatting** and **embedded photos**.

**Editing:** Click anywhere on the bio text to enter edit mode, or use the Edit button. The textarea auto-sizes based on content length (6–20 rows).

**Supported Markdown:**

| Syntax | Result |
|--------|--------|
| `**bold**` | **bold** |
| `*italic*` | *italic* |
| `# Heading` | Heading (levels 1–6) |
| `- item` | Bulleted list |
| `1. item` | Numbered list |

**Embedding Photos:**

You can embed photos from the person's reference session directly into the bio.

1. In edit mode, click the **camera icon** button to open the photo picker
2. Click a thumbnail to insert it at the cursor position
3. The inserted tag looks like: `![w150 left](media:ID)`

**Image sizing** — control width by changing the number after `w`:

| Tag | Width |
|-----|-------|
| `![w80 left](media:ID)` | 80px |
| `![w150 left](media:ID)` | 150px (default) |
| `![w300 left](media:ID)` | 300px |
| `![w600 left](media:ID)` | 600px |

You can also use named sizes: `small` (200px), `large` (600px).

**Image positioning** — control how text wraps around the image:

| Keyword | Behavior |
|---------|----------|
| `left` | Image floats left, text wraps on the right **(default)** |
| `right` | Image floats right, text wraps on the left |
| `inline` | Image sits inline with text, no wrapping |

**Examples:**

```
![w150 left](media:abc123)    → 150px wide, text wraps right
![w300 right](media:abc123)   → 300px wide, text wraps left
![w80 inline](media:abc123)   → 80px wide, inline with text
![small left](media:abc123)   → 200px wide, text wraps right
```

Only photos from the person's reference session can be embedded — external URLs are not supported.

**Appearance**
- Current physical state (height, weight, body type, ethnicity, hair color)
- Extensible physical attributes with Natural/Enhanced/Restored status badges
- Active body marks, body modifications, cosmetic procedures with event timelines
- Cosmetic procedure events support before/after values (e.g. "A → D cup size")
- Folded chronologically from persona history

**Details**
- Only visible when media categories exist
- Expandable groups of media categories (Physical Features, Body Marks, Body Modifications, Cosmetic Procedures)
- Each category shows a photo count badge
- Click to expand and view a gallery for that category

**Career**
- Work history table: Title, Channel, Label, Release Date, Age at Release, Role
- Populated from SetParticipant records
- Click set titles to navigate to set detail

**Network**
- Relationships with other people
- Types: professional, personal, familial, other
- Events timeline (started, married, separated, etc.)

**Photos**
- Justified grid gallery of all reference media
- Click any thumbnail to open the lightbox

#### Edit & Delete

- **Edit** — Opens a sheet to modify person fields
- **Delete** — Permanently deletes the person and all associated data (cascading)

---

## 3. Sessions

**Routes:** `/sessions`, `/sessions/[id]`

### Session Types

| Type | Created | Editable | Mergeable | Deletable |
|------|---------|----------|-----------|-----------|
| **Reference** | Auto (one per person) | No | No | No (only by deleting person) |
| **Production** | Manually by user | Yes | Yes | Yes |

**Reference sessions** store a person's documentation media (headshots, detail shots). They always have status CONFIRMED and cannot be modified directly.

**Production sessions** represent actual shoots or production events. They can be linked to projects and labels, have participants, and be merged with other production sessions.

### Sessions List

**Search:** Filter by session name.

**Filters:**
- **Type** — Reference, Production, or All
- **Status** — Draft, Confirmed, or All

Session cards show: name, type badge (User icon for Reference, Clapperboard for Production), status badge, date, and counts for participants/media/linked sets.

### Create Session

Click **"Add Session"** to create a production session:

| Field | Required | Notes |
|-------|----------|-------|
| Name | Yes | |
| Status | Yes | Draft or Confirmed |
| Project | No | Link to existing project |
| Label | No | Link to existing label |
| Date | No | With precision selector |
| Description | No | |
| Location | No | |
| Notes | No | |

### Session Detail

#### Reference Session Detail

- Header shows person link and type badge
- **Media Manager** — full-featured media management component with:
  - Grid of all reference media
  - Batch upload zone with duplicate detection
  - Headshot slot assignment
  - Lightbox with reference context (usage toggles, entity linking, collections, categories)
- No edit/merge/delete buttons (reference sessions are immutable)

#### Production Session Detail

- Header with status badge, project/label links, participant/set counts
- **Inline editable** fields: name, description, location, notes
- **Gallery** — media grid with batch upload zone and lightbox
- **Participants** — list of persons with role badges (Model, Photographer). Click to navigate to person detail.
- **Linked Sets** — sets connected via SetSession. Shows primary badge and release date. Click to navigate to set detail.
- **Actions:**
  - **Edit** — modify session fields
  - **Merge** — absorb another session into this one (consolidates participants, media, and set links; the absorbed session is permanently deleted)
  - **Delete** — permanently delete the session and cascade

---

## 4. Sets

**Routes:** `/sets`, `/sets/[id]`

### Sets List

Cards display: cover photo thumbnail, title, type badge (Photo/Video), channel name, primary label, release date, and participant names.

**Search:** Filter by set title.

**Filters:**
- **Type** — Photo, Video, or All

**Pagination:** 50 sets per page with "Load more."

### Create Set

Click **"Add Set"** to open the creation sheet:

| Field | Required | Notes |
|-------|----------|-------|
| Title | Yes | |
| Type | Yes | Photo or Video |
| Channel | No | Recent channels appear at the top of the dropdown |
| Release Date | No | With precision selector |
| Description | No | |
| Category | No | |
| Genre | No | |
| Tags | No | Comma-separated |

Creating a set automatically creates a linked Draft session (the "primary session") and a SetSession link.

### Set Detail

#### Header Card

- **Type badge** — Photo (sky) or Video (violet)
- **Release date** (if set)
- **Title** — inline editable (click to edit)
- **Channel & primary label** — with link to label detail
- **Label evidence** — manageable list of label associations with evidence types (Channel Map or Manual). Add/remove labels via the inline controls.

#### Sessions Section

Shows all sessions linked to this set.

- **Primary session** — marked with "Primary" badge, always present
- **Source sessions** — additional sessions linked when media from other sessions is added
- **Compilation indicator** — a violet "Compilation" badge appears automatically when a set has more than one linked session
- **Add Source Session** — search and link an additional session
- **Reassign** — merge the auto-created primary session into an existing session (useful when you realize the media came from a different session)

#### Completeness Checklist

Visual indicators for: Title, Channel, Credits (with unresolved count), Photos, and Label evidence.

#### Description & Notes

Inline editable text fields. Click to edit, changes auto-save.

#### Photo Gallery

- **Justified grid** of all set media items
- **Cover selection** — hover over a thumbnail to see the cover icon; click to set as the set's cover image
- **Upload zone** — drag-and-drop or click to upload new media (anchored to the primary session)
- **Browse & Add** — opens a sheet to search and add existing media from other sessions. Selected media creates SetMediaItem links without changing media ownership. Source sessions auto-link via SetSession.
- **Lightbox** — click any thumbnail to open the full-screen viewer with cover selection and Find Similar

#### Credits Section

Tracks who participated in the set (models, photographers).

- **Add Credit** — inline form with role selector and person search
- **Bulk add** — type comma-separated names
- **Smart suggestions** — system suggests matches from previous credits in the same channel and channel participants
- **Resolution states:**
  - **Unresolved** (amber) — raw name, no person linked yet
  - **Resolved** (green) — linked to a specific person
  - **Ignored** (muted) — deliberately skipped
- **Actions per credit:** Resolve (search & select person), Ignore, Unresolve

#### Tags

Read-only display of the set's tags.

#### Edit & Delete

- **Edit** — modify all set fields in a sheet
- **Delete** — permanently delete the set and all associated data

---

## 5. Collections

**Routes:** `/collections`, `/collections/[id]`

Collections are user-curated albums of media items. They can be **global** (cross-person) or **per-person** (scoped to a single person's media).

### Collections List

A card grid showing all collections with:
- Thumbnail (first media item or placeholder)
- Type badge: **Global** (emerald) or **Person** (sky) with person name
- Item count

### Create Collection

Click **"New Collection"** to open the creation dialog:

| Field | Required | Notes |
|-------|----------|-------|
| Name | Yes | e.g. "Portfolio Candidates" |
| Description | No | |

Collections created from this page are global (no person scope). Person-scoped collections are created from the lightbox info panel on a person's reference session.

### Collection Detail

- Header with name, description, type badge, and item count
- **Gallery** — justified grid of all collection items with lightbox
- **Edit** — modify name and description
- **Delete** — permanently delete the collection (media items are not affected)

### Adding Media to Collections

From any lightbox with the reference context (person reference sessions):
1. Open the info panel
2. Scroll to the Collections section
3. Click a collection name to add or remove the current media item

---

## 6. Projects

**Routes:** `/projects`, `/projects/[id]`

### Projects List

**Search:** Filter by project name.

**Filters:**
- **Status** — Active, Paused, Completed

Project cards show: name, status badge, and description snippet.

### Create Project

Click **"Add Project"** to open the creation form:

| Field | Required | Notes |
|-------|----------|-------|
| Name | Yes | |
| Status | Yes | Active, Paused, or Completed |
| Description | No | |
| Labels | No | Multiple label selection |
| Tags | No | |

### Project Detail

- Header with icon, name, status badge, description
- **Stats:** Session count, total participant count across sessions
- **Labels** — linked labels with navigation
- **Tags** — display pills
- **Sessions list** — each session shows name (linked), date, participant count, and participants with role badges. Click participant names to navigate to person detail.
- **Edit & Delete** buttons

---

## 7. Labels

**Routes:** `/labels`, `/labels/[id]`

Labels represent organizations or production companies.

### Labels List

**Search:** Filter by label name.

Label cards show: name, icon, and description snippet.

### Create Label

Click **"Add Label"** to open the creation form:

| Field | Required | Notes |
|-------|----------|-------|
| Name | Yes | |
| Description | No | |
| Website | No | |

### Label Detail

- Header with name, description, website link
- **Networks** — labels can belong to networks (many-to-many)
- **Channels** — grid of channels under this label, each showing name, set count. Add Channel button available.
- **Projects** — projects with this label as primary
- **Edit & Delete** buttons

---

## 8. Channels

**Routes:** `/channels`, `/channels/[id]`

Channels are distribution outlets belonging to labels (e.g. a label's website, social media, etc.).

### Channels List

**Search:** Filter by channel name.

**Filters:**
- **Label** — filter channels by parent label

Channel cards show: name, parent label, and set count.

### Create Channel

| Field | Required | Notes |
|-------|----------|-------|
| Name | Yes | |
| Label | Yes | Parent label |
| Notes | No | |

### Channel Detail

- Header with name, linked label
- **Stats:** Set count
- **Sets** — all sets published through this channel. Click to navigate to set detail.
- **Edit & Delete** buttons

---

## 9. Networks

**Routes:** `/networks`, `/networks/[id]`

Networks are groups of labels (e.g. a parent company with multiple studios).

### Networks List

Network cards show: name, description, member label count.

### Create Network

| Field | Required | Notes |
|-------|----------|-------|
| Name | Yes | |
| Description | No | |
| Website | No | |

### Network Detail

- Header with name, description, website
- **Stats bar:** Total labels, channels, sets across all member labels
- **Member Labels** — grid of labels in this network, each showing channel count and set count. Click to navigate to label detail.
- **Edit & Delete** buttons

---

## 10. Media Management

### Upload

Media upload is available in three contexts:

| Context | Location | Media Ownership |
|---------|----------|-----------------|
| Reference session | Session detail page | MediaItem.sessionId = reference session |
| Production session | Session detail page | MediaItem.sessionId = production session |
| Set gallery | Set detail page | MediaItem.sessionId = set's primary session |

**Supported formats:** JPEG, PNG, WebP, GIF (max 25MB per file, up to 4 concurrent uploads)

**Upload flow:**
1. Drag files onto the upload zone or click to browse
2. Files are validated (type and size)
3. Duplicate detection runs (SHA-256 exact match + dHash perceptual match)
4. If duplicate found, a dialog offers: Accept (upload anyway), Replace (swap file on existing item), or Cancel
5. Image variants are generated automatically (thumbnails at 128/256/512/768px, gallery at 512/1024/1600px)
6. Upload progress shown per file

### Browse & Add (Sets Only)

On set detail pages, the **"Browse & Add"** button opens a sheet to search existing media across all sessions:

1. Click "Browse & Add" next to the upload zone
2. Search by filename, filter by person or session
3. Items already in the set are excluded
4. Multi-select thumbnails (click to toggle)
5. Click "Add to Set" — creates SetMediaItem links without changing the media's session ownership
6. Source sessions are auto-linked via SetSession

### Lightbox

The lightbox opens when clicking any media thumbnail in a gallery. It provides full-screen viewing with navigation and editing.

**Navigation:**
- Left/right arrow buttons or keyboard arrows
- Filmstrip toggle (thumbnail strip at bottom)
- Escape to close

**Standard features (all contexts):**
- Focal point editor — crosshair overlay for marking smart-crop center point. Click anywhere on the image to set.
- Cover selection (sets only) — custom "C" icon to designate the set's primary display image
- Find Similar — opens `/media/similar` in a new tab to search for perceptually similar images
- Info panel toggle

**Info panel — standard sections:**
- **Tags** — content tags: Portrait, Diploma, Tattoo, Document, General, Outtake
- **Caption & notes** — click to edit

**Info panel — reference context (person reference sessions only):**

These additional sections appear when viewing media in a reference session:

- **Usage toggles** — HEADSHOT, PROFILE, PORTFOLIO, DETAIL
  - HEADSHOT: assigned to a slot (1–5)
  - PROFILE: person's display picture
  - PORTFOLIO: general portfolio image
  - DETAIL: linked to a specific body feature via category
- **Headshot slot assignment** — dropdown to assign/remove from profile slot (1–5) with custom labels from Settings
- **Entity linking** (when usage is DETAIL) — link to a specific Body Mark, Body Modification, or Cosmetic Procedure
- **Collections** — add/remove the image from any collection
- **Category assignment** — assign to a media category (used in person Detail tab)

Active elements in the info panel use **amber-500** color accents.

### Find Similar Images

**Route:** `/media/similar?id=[mediaItemId]`

1. Open any lightbox and click **"Find Similar"**
2. The page shows the source image and a grid of perceptually similar matches
3. Adjust the **threshold slider** to control sensitivity (default: 10, lower = stricter)
4. Results sorted by similarity score
5. Click any match to view it in its original context

---

## 11. Settings

**Route:** `/settings`

### Appearance

- **Theme** — toggle between dark and light mode
- **Color Palette** — choose from predefined color schemes
- **Preview palettes** — link to a side-by-side comparison page

### Display Density

Dropdown to adjust UI spacing across the app: Compact, Normal, or Comfortable.

### Person Detail Layout

Controls information density for the person detail hero card: Minimal, Normal, or Detailed.

### Profile Image Slots

Customize the display labels for each of the 5 profile image slots. Default labels are "Slot 1" through "Slot 5". Custom labels (e.g. "Headshot", "Profile", "Portfolio") appear in:
- People list headshot slot selector
- Person detail reference media card
- Lightbox headshot slot assignment dropdown

### Media Categories

Organize photo documentation by category. An accordion interface allows managing category groups and individual categories.

**Built-in groups:**
- Physical Features
- Body Marks
- Body Modifications
- Cosmetic Procedures

**Per category:**
- Name and slug
- Sort order (drag to reorder)
- Entity model link (optional): BodyMark, BodyModification, or CosmeticProcedure

Categories with an entity model automatically enable entity linking in the lightbox when a photo is assigned to that category.

**Operations:** Add group, add category to group, edit category, delete category, reorder.

### Physical Attribute Catalog

Define custom physical attributes for tracking measurements over time. An accordion interface (like Media Categories and Skills) allows managing attribute groups and definitions.

**Default groups:**
- Body Measurements (Waist, Hips, Bust/Chest, Inseam, Shoe Size)
- Facial Features (Nose Shape, Lip Fullness, Jaw Shape)
- General (Skin Tone, Tan Level)

**Per definition:**
- Name and slug
- Unit (optional, e.g. "cm", "cup size")
- Sort order (drag to reorder)

These definitions are used in two places:
1. **Recording physical changes** — extensible attribute inputs appear in the Record/Edit Physical Change sheets below the 5 fixed fields
2. **Cosmetic procedure linking** — an "Affects Attribute" dropdown on add/edit procedure sheets links a procedure to an attribute, enabling automatic **Natural/Enhanced/Restored** status tracking

**Attribute status** (derived automatically, shown as badges in Appearance tab):
- **Natural** — no cosmetic procedure targets this attribute
- **Enhanced** (purple badge) — a cosmetic procedure was performed targeting this attribute
- **Restored** (green badge) — the cosmetic procedure was reversed

**Operations:** Add group, add definition to group, edit definition, delete definition (blocked if in use), reorder.

---

## 12. Workflows

### Documenting a New Person

1. Go to `/people` and click **"Add Person"**
2. Fill in ICG-ID, display name, and status
3. After creation, click the **"Reference Media"** card on the person detail page
4. Upload reference photos via the batch upload zone
5. Open the lightbox to assign headshot slots (1–5)
6. Set focal points for smart cropping
7. Assign usage types (Headshot, Profile, Portfolio, Detail)
8. For detail shots, assign a media category and link to body features
9. Add photos to collections for organization

### Creating a Standard Set

1. Go to `/sets` and click **"Add Set"**
2. Fill in title, type, channel, and release date
3. Upload media in the gallery section
4. Click **"Add Credit"** to add participants
5. Search for existing persons or type new names
6. Resolve credits by linking to persons (or ignore unresolvable ones)
7. Add label evidence if needed
8. Set a cover image by hovering over a thumbnail in the gallery

### Creating a Compilation Set

A compilation set pulls media from multiple production sessions without moving it.

1. Create a set normally (this auto-creates a host session)
2. Upload any compilation-specific media (cover art, promo images) — these anchor to the host session
3. Click **"Browse & Add"** to open the media picker
4. Search and select existing media from other sessions
5. Click **"Add to Set"** — SetMediaItem links are created, and source sessions auto-link via SetSession
6. The "Compilation" badge appears automatically when multiple sessions are linked
7. Optionally use **"Add Source Session"** to manually link additional sessions

### Reassigning a Set's Session

If you created a set and realize the media actually came from an existing session:

1. Open the set detail page
2. In the Sessions section, click **"Reassign"**
3. Search for the correct session
4. Review the merge preview (shows how many media items will be reassigned)
5. Click **"Confirm Reassign"** — the auto-created session is merged into the target, and all media is reassigned

### Merging Production Sessions

1. Open the session you want to keep (the "surviving" session)
2. Click **"Merge"**
3. Search for the session to absorb
4. Confirm — participants, media, and set links all consolidate into the surviving session. The absorbed session is permanently deleted.

### Resolving Set Credits

1. Open a set with unresolved credits
2. In the Credits section, unresolved credits show an amber badge
3. Click a credit to see suggestions from:
   - Previous credits with the same name in other sets
   - Frequent participants in the same channel
4. Select the correct person or search for a different one
5. To skip a credit, click **"Ignore"**
6. To undo, click **"Unresolve"** on a resolved credit

### Organizing Media with Collections

**Create a global collection:**
1. Go to `/collections` and click **"New Collection"**
2. Name it (e.g. "Portfolio Candidates" or "Beach Shoots")

**Add media from any lightbox:**
1. Open a lightbox on a person's reference session
2. Open the info panel
3. In the Collections section, click a collection name to toggle membership

**Browse collections:**
- `/collections` shows all collections with thumbnail, type badge, and item count
- Click a collection to see its gallery with lightbox

### Finding Duplicate or Similar Media

1. Open any media item in the lightbox
2. Click **"Find Similar"** (opens in a new tab)
3. The source image is shown alongside a grid of perceptually similar matches
4. Use the threshold slider to adjust sensitivity
5. Useful for finding duplicates, re-edits, or alternate crops of the same shot

---

## Keyboard Shortcuts

| Key | Action | Context |
|-----|--------|---------|
| `←` / `→` | Navigate between images | Lightbox |
| `Escape` | Close lightbox / Close dialog | Lightbox, Dialogs |
| `i` | Toggle info panel | Lightbox |

---

## Data Model Concepts

### Entity Hierarchy

```
Network
  └── Label (organization)
        └── Channel (distribution outlet)
              └── Set (photo/video collection)
                    ├── SetMediaItem → MediaItem
                    ├── SetCreditRaw → Person (via resolution)
                    └── SetSession → Session

Session (production event)
  ├── MediaItem (photos/videos)
  ├── SessionParticipant → Person
  └── SetSession → Set

Person
  ├── Reference Session (auto, 1:1)
  ├── PersonMediaLink → MediaItem
  ├── Persona (appearance snapshots over time)
  ├── PersonAlias (names)
  ├── PersonRelationship → Person
  └── SetParticipant → Set

Project
  ├── Session (linked production sessions)
  └── Label (primary + secondary)

MediaCollection (global or per-person album)
  └── MediaCollectionItem → MediaItem
```

### Key Principles

- **MediaItem.sessionId** = creation provenance (which session produced the media). Immutable.
- **SetMediaItem** = curation/placement (which sets include the media). Many-to-many.
- **Compilation** = a set with SetMediaItems pointing to MediaItems from multiple sessions. Derived from `sessionLinks.length > 1`.
- **Hard deletes** — all destructive operations permanently remove data. Use `scripts/db-backup.sh` for disaster recovery.
- **Partial dates** — dates can have precision: Unknown (null), Year (YYYY-01-01), Month (YYYY-MM-01), or Day (exact).
- **Date modifiers** — dates can carry a confidence modifier (see below).

---

## Date Modifiers & Data Quality

### Date Modifiers

When entering or editing dates (birthdate, career dates, persona dates, session dates, set release dates), you can set a **modifier** indicating how confident you are in the value:

| Modifier | Display | When to use |
|----------|---------|-------------|
| **Exact** | *(no prefix)* | You know the precise date |
| **Approximate** | `~` | Close to the real date but unconfirmed (e.g. `~1995`) |
| **Estimated** | `est.` | Derived from indirect evidence (e.g. `est. March 2020`) |
| **Before** | `before` | The actual date is on or before this value |
| **After** | `after` | The actual date is on or after this value |

The modifier selector appears next to every date input that supports precision (birthdate, career dates in Edit Person, persona dates, session dates, set release dates).

### Source Field

Each date also has an optional **Source** text field where you can record where the date information came from (e.g. "interview 2024", "social media post", "estimated from set release dates"). This helps track provenance and aids future verification.

### Career Dates

Career dates (Active From, Retired At) now support **full date precision** — not just a year. You can enter a specific day, month, or year, with a modifier and source, just like birthdates. For example: `~March 2019` or `after 2020`.

### Data Quality Warnings

Pulseboard automatically checks date plausibility and flags potential issues:

- **Hero badge** — an amber warning badge appears on the person's hero card when plausibility issues are detected. Hover or click to see the count.
- **Data Quality card** — on the person's Overview tab, a "Data Quality" card lists all detected issues with descriptions (e.g. "Birthdate is in the future", "Career start before age 14").
- **People list indicator** — an amber dot appears on person cards in the `/people` list when that person has plausibility warnings, making it easy to spot records that need attention.

These warnings are informational — they do not block saves or edits. They help identify data entry errors or records that need verification.

---

## Navigation Reference

| Route | Page |
|-------|------|
| `/` | Dashboard |
| `/sessions` | Sessions list |
| `/sessions/[id]` | Session detail |
| `/sets` | Sets list |
| `/sets/[id]` | Set detail |
| `/collections` | Collections list |
| `/collections/[id]` | Collection detail |
| `/people` | People list |
| `/people/[id]` | Person detail |
| `/projects` | Projects list |
| `/projects/[id]` | Project detail |
| `/labels` | Labels list |
| `/labels/[id]` | Label detail |
| `/channels` | Channels list |
| `/channels/[id]` | Channel detail |
| `/networks` | Networks list |
| `/networks/[id]` | Network detail |
| `/settings` | Settings |
| `/media/similar` | Find similar images |
