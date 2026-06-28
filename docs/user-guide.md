# Pulseboard User Guide

Pulseboard is a personal information management tool for tracking people in art/creative production — their profiles, work history, connections, and the organizations they're associated with.

---

## Navigating the app

The app uses a fixed layout so navigation is always within reach, no matter how far you scroll:

- **Sidebar** (left) — always visible; lists every section. Collapse it to icons with the chevron tab on its edge. If the list is taller than the window, it scrolls on its own.
- **Top bar** — always visible; shows the name of the section you're in (e.g. "People", "Sets"). On phones/tablets it also holds the **menu (☰)** button that opens the navigation drawer.
- **Filter toolbar** — on list pages (People, Sets, Sessions, …) the search/filter/sort bar **sticks to the top** as you scroll, so you can refine the list at any time. Section headers (when grouping is on) stick just beneath it.
- **Back to top** — a round ↑ button appears at the bottom-right once you've scrolled down; click it to jump back to the top.
- Returning from a detail page (browser Back) restores both your filters **and your scroll position** in the list.

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
11. [Data Import](#11-data-import)
12. [Staging Sets](#12-staging-sets)
13. [Archive](#13-archive)
14. [Settings](#14-settings)
15. [Workflows](#15-workflows)
16. [Date Modifiers & Data Quality](#date-modifiers--data-quality)

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
- **Watching** — a toggle (independent of status) to show only people on your watchlist
- **Profile completeness** — Incomplete / Partial / Complete
- **Hair Color, Ethnicity, Body Region** — attribute filters
- **Birthdate / Added** — date range filters
- **Card photo framing** — pick which **Profile framing** (Headshot, Photo 2, …) representative the person cards show; Headshot is the default. Number keys **1..N** are hotkeys for the chips.

**Sorting:** Name A→Z, Name Z→A, Newest/Oldest, Age, Rating, Profile completeness, Recently updated.

**Grouping:** Click the **"Group by"** button to organize people into sections:
| Option | Description |
|--------|-------------|
| No grouping | Default flat list with infinite scroll |
| Nationality | Grouped by ISO country code |
| Career decade | Grouped by the decade their career began (2010s, 2020s, …) |
| Name A–Z | Alphabetical sections (A, B, … Z, #) |
| Current age | Age brackets: Under 25 / 25–30 / 30–35 / 35–40 / 40+ |
| Age at career start | Age when career started: Under 18 / 18–20 / 20–25 / 25–30 / 30+ |

When grouping is active, up to 500 persons are loaded at once. Each section header shows the count and can be collapsed/expanded. Use **"Collapse all / Expand all"** to toggle all sections. Collapse state is preserved across page refreshes (sessionStorage).

**Pagination:** 50 persons per page in ungrouped mode. Click "Load more" to fetch additional results (up to 500).

### References (people not yet added)

Import files list co-models (people the subject has worked with) and staged sets list their
participants — often people who **aren't in your database yet**. Rather than forcing you to
create a full profile for each, Pulseboard records them as lightweight **References** (the
"ghost" register), keyed by ICG-ID.

- **Where:** the **References** link (with a count) on the `/people` header → `/people/references`.
- **Each row** shows the name, ICG-ID, how many times the person is referenced, and who
  references them (e.g. "with Cara Mell").
- **Resolve a reference:**
  - **Add as Person** — creates a real Person from the reference (prefilled by ICG-ID); the
    reference is then absorbed automatically and any recorded links repoint to the new person.
    (Only available when the reference has an ICG-ID.)
  - **Link…** — attach the reference to an **existing** person (for a name-only contact, or
    when the reference is really someone you already have).
  - **Ignore** — hide a reference you don't intend to add (reversible via **Show ignored** → Restore).
- **Automatic absorption:** whenever you add or import a person whose ICG-ID matches a
  reference, that reference is retired and its links move onto the real person — no manual step.

### Watchlist

Mark people you need to **actively monitor for new sets to import**. This is independent of
status — a watched person is usually still Active.

- **Add/remove:** the compact **eye toggle** next to the person's name on their detail page
  (also editable in the Edit sheet, which adds **priority** High/Normal/Low, a **source URL**,
  and a **note**).
- **Markers:** watched people show an eye marker on their card and surface under the
  **Watching** filter on `/people`.
- **The Watchlist page** (sidebar → **Watchlist**) lists everyone you watch, sorted with
  **needs-rescan** first, then by how overdue their pages are, then priority, then oldest
  scan. Each row shows:
  - **Missing** = Claimed − Recorded (from the Career-tab catalogue gap) — e.g. "missing 12p · 3v" — so you see who actually has new sets to chase. "complete" / "no claim" when there's nothing outstanding or no claimed figure.
  - **Due / Overdue badge** — the worst freshness across the person's scannable pages, against their priority cadence (set in **Settings → Scanning**).
  - **Rescan flag** — an archive-born set (one you created manually from the Archive) is newer than the person's last source scan, i.e. there are releases the scrapers haven't caught.
  - **Mark checked** and an **Import** jump. (To open a person's profile pages, use the **Digital Identities** on their detail page, or expand the row to reach their scannable pages.)

#### Building a scan round

The active loop for pulling new releases:

1. On `/watchlist`, tick the people you want to scan (this selects all their scannable
   identity pages); expand a row to fine-tune which pages. **Due** and **overdue** pages
   are pre-checked.
2. The sticky bar shows *N people · M pages · K platforms*. Hit **Generate scan files** to
   download a `.zip` with **one `.txt` per platform** (e.g. `thenude.txt`, `indexxx.txt`).
   THENUDE files are bare URLs; other platforms are `ICG-ID⇥URL` per line so their scrapes
   stay attributable.
3. Feed each file into that platform's external scraper script; it produces import `.txt`
   files.
4. **Import** the results (sidebar → Import). Importing a file advances that page's
   *scanned-through* date to the scrape date — so the person's scannable pages go fresh and
   drop out of "due".

Because a scrape pulls everything up to its run date, no imported staged set is ever newer
than the scan. A newer set only appears via the **Archive** workflow (a manually created
staged set) — which is exactly what raises the **rescan** flag.

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

Shows a link to the person's reference session (auto-created, one per person), plus a preview of the person's **Profile framings**. Click to navigate to the reference session for media management.

#### Profile framings (Profile Manager)

The person's profile photos are organised as a **Profile** group of **framing categories** — **Headshot** plus your other framings (Photo 2, Photo 3, …). They're managed in **one place** — the **Profile Manager** on the person's **reference session** (open it from the Reference Media Card). It shows one card per framing:

- A framing can hold **many** aligned images; the one currently shown is the **representative**.
- When a framing has more than one image, a **★ picker** lets you choose which image is the representative.
- The **Headshot** framing is special: its representative **is the person's avatar** (the ID-card photo shown across the app). Headshot can't be deleted.

Per framing you can:
- **Standardize** → pick a source photo → the **aligner** opens; click the template's keypoints on the source (headshot: **left eye, right eye, mouth**) → it computes the exact rotate/scale/translate to the template targets, shows a live preview (warns if the source is too small) → **Save** bakes a consistently-framed image into that framing.
- **Link** → add an existing photo directly (raw, no alignment).
- **★** → choose which image is the framing's representative (the displayed one; for Headshot, the avatar). With a single image it's the representative by default; otherwise the most recent wins until you pick.

Uploading photos **doesn't auto-fill framings** — framing images are always set explicitly here. Templates (output aspect/size + draggable target keypoints) are defined under **Settings → Catalogs → Motif Templates**; add half/full-body motifs there — no code needed. When editing a template you can drop a **reference photo** behind the keypoint canvas as a visual guide (drag to move, scroll to zoom, rotate + opacity sliders) and place the dots over real anatomy — it's a guide only and never changes the saved geometry. **Pin** it to keep that reference (and its position) for next time.

#### Aligned detail photos & the Atlas

The same template alignment that standardizes Profile framings also works for **detail loci** (eyes, a specific pose, …) so they're **comparable across people**. A framing and a locus are both just **categories** with a bound template. In **Settings → Catalogs → Motif Templates**, bind a template to a **locus category** (e.g. *Eyes*).

Once a category has a template, an **Align** button (frame icon) appears next to that category on a person's **Details** tab. Click it → pick a source photo → the same keypoint aligner opens → **Save to category** bakes an **Aligned image** that lands in that category (marked with an *aligned* badge). Aligned images are derived copies kept in the reference session; they're hidden from the raw photo gallery and source pickers so they don't clutter your originals. You can align as many photos per locus as you like.

The **Atlas** (sidebar) is the pay-off: pick a locus and see **every person's aligned image side by side** — automatically comparable because they share the template's framing. Filter the grid by person; click a tile to jump to that person. (This is the *automatic* counterpart to **Collections**, which are hand-curated.)

#### Sharper aligned images from the originals (HD re-bake)

To save space, Pulseboard stores a downscaled (≤4000px) version of each photo, not the original. That's fine normally — but when a template **zooms into a small locus** (eyes especially), the aligned image can look a touch soft, because it was cropped from the downscaled copy.

If the photo came from your archive, you can refine that aligned image from the **full-resolution original** — same framing, sharper pixels — without re-doing any clicking:

1. On the **machine that holds the archive** (where you run the scan), run the re-bake agent — the same way you run `archive-scan.ps1`:
   `.\archive-rebake.ps1 -BaseUrl <app> -ApiKey <key> -Tenant <tenant>`
   (add `-DryRun` to preview, `-PersonId`/`-SessionId` to scope, `-Force` to redo). It's pure PowerShell — no Node needed.
2. Or **chain it onto a scan** so the archive paths are freshly verified first: `archive-scan.ps1 … -Rebake` (add `-RebakeForce` to redo). A normal scan also prints how many images are eligible.
3. The agent finds every aligned image whose original is reachable, reads the original off disk, replays the exact alignment at full resolution, and replaces the image in place. The multi-GB originals never leave your machine — only the small refined result is uploaded.

(A cross-platform Node equivalent, `scripts/archive-rebake.ts`, is also available if you prefer it.)

Refined images carry an **HD** badge (Profile Manager, Details tab). **Maintenance** shows an *"HD re-bake eligible"* count — how many aligned images could still be sharpened — and a normal scan run prints the same nudge when there's anything to do. Photos you uploaded directly (no archive original) simply aren't eligible — their stored copy is already the best that exists.

#### Choosing an image (big-preview picker)

Whenever you pick a photo for a task — a source to standardize a slot, a photo for a tattoo/piercing, or media to add to a set/collection/skill-event — the picker opens as a **full-screen split view**: the thumbnail grid on the left, a **large live preview (loupe)** on the right.

- **Click** a thumbnail to preview it big; **←/→** to step through; **double-click the preview** (or pinch) to **zoom and pan** for fine detail (sharpness, a small tattoo).
- **Choose deliberately:** *Select this* for single-pick tasks; a **checkbox** on each tile (and *Select* in the loupe) for multi-pick tasks, then the **Add/Save** button.
- **Compare two:** press **Space** or *Compare* to add the current photo to the compare tray; with two marked, **Compare side-by-side** shows them next to each other (each zoomable) so you can **pick the winner**.
- On phones the split view collapses to a **Quick-Look**: the grid fills the screen, tap a tile for the big preview, back to return.

(The collection picker also keeps its **desktop drag-to-add panel** beside the gallery for quick bulk adds.)

#### Tabs

**Overview**
- **About [Name]** — editable bio section with Markdown support (see [Bio & Markdown](#bio--markdown) below)
- Recent Photos — horizontal scroll of latest reference photos with lightbox
- History — collapsible era timeline (one card per phase, baseline first; auto-created "draft" eras are flagged with an amber pill until you curate them)
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
- Extensible physical attributes with Natural/Enhanced/Reduced/Restored status badges
- **Body Features** (Phase G Slice 11) — one unified card replaces the separate Body Marks + Body Modifications cards. Subsections (● Body Marks / ● Body Modifications) only render when there's at least one entry of that type — empty categories disappear. The footer `+ Add body feature` opens a type-picker popover (Tattoo / Scar / Mark / Burn / Deformity / Other for marks; Piercing / Stretching / Branding / Scarification / Implant / Teeth / Jewelry / Other for modifications); clicking a type opens the matching add sheet pre-selected.
- **Expanded row view** (Phase G Slice 12) — clicking a body feature row expands it into a 4-section panel: an action toolbar (pin / photos / edit / delete) plus a prominent **Status pill** (● Present / ▲ Modified / ○ Removed / ◐ Overgrown) at the top-right; then labelled **PROPERTIES** (folded current values from the event log — motif / colors / size / description for marks; material / gauge / description for modifications), **PHOTOS** (thumbnail strip — the **first photo is the cover** shown on the body-map hover; hover any other thumbnail and click its ★ to **Set as cover**, also available in the photo lightbox), and **LIFECYCLE** (dot-line event timeline plus a textual `+ Record event` button). Sections with no content are hidden entirely.
- **Body map Level-2 interactivity** (Phase G Slice 13) — the right-column body map is now linked to the Body Features list. **Click a region** to filter the list to features in that region (a `Region: <name> ×` chip appears at the top of the Body Features card; click the × to clear). **Hover a region** to glow the matching list rows; **hover a list row** to highlight its region on the map. The map's region tooltip distinguishes removed features (outlined dot, strikethrough label) from present ones (filled dot).
- **Region hover tooltip with image** (Phase G Slice 14) — hover a body region for ~300ms and a bounded tooltip appears with a focal-cropped thumbnail + type pill + region + description for each feature at that region. **Click a feature in the tooltip** and the page scrolls to its row and briefly highlights it. Regions with no attached photo show a quiet "no photo" placeholder.
- **Hero body-feature chips** (Phase G Slice 15) — the hero panel surfaces one subtle pill per distinct body-feature type the person currently has (e.g. `tattoo`, `piercing`). Three tattoos = one `Tattoo` chip — purely binary presence, no count. Amber for marks, teal for modifications. Driven by a derived cache column so a chip appears the moment the first instance is added and disappears when the last one is removed. Clicking the chip group jumps to the Appearance tab.
- Surgical changes to a status-bearing scalar attribute carry a per-delta **Kind** (Augmentation / Reduction / Reversal), driving the Enhanced / Reduced / Restored status badge (ADR-0007/0018)
- Folded chronologically from era history (latest delta wins per attribute — see the History panel for the full timeline)

**Details**
- Only visible when media categories exist
- Expandable groups of media categories (Physical Features, Body Marks, Body Modifications)
- Each category shows a photo count badge
- Click to expand and view a gallery for that category

**Career**
- **Catalogue stats strip** (top of the tab) — a gap/completeness view
  comparing what the biography *claims* against what you actually hold.
  Three rows — Photosets · Videos · Covers (covers = photosets + videos,
  always derived) — each showing **Have / Claimed** (with the
  promoted + staged breakdown, e.g. `35/50 (30+5)`), a completeness bar
  (solid = promoted, lighter = staged), the completeness %, and the
  **Missing** count. The bar caps at 100% and flags any overage (`+2`);
  when there's no claimed figure the bar is hidden and only the raw
  counts show. The Photos / Videos type tabs also carry a `have/claimed`
  badge.
  - *Claimed* figures are auto-parsed from the imported biography line
    ("… Y photosets, Z videos") into editable fields on the person
    (**Edit ▸ Claimed photosets / Claimed videos**, with a free-text
    **Claimed figures — source** note for where the numbers came from —
    shown under the table). Once you edit any of them by hand they're
    protected — a later re-import won't overwrite your values. *Staged*
    counts only active-pipeline staging sets (PENDING/REVIEWING/APPROVED)
    that aren't already matched to an existing Set **and have a confirmed
    archive link** — i.e. staged sets you actually hold on disk, never
    double-counting a shoot already promoted.
- Unified chronological timeline that blends Promoted Sets and Staged
  StagingSets per the type tab (Photos / Videos — defaults to Photos,
  remembered per person)
- Each row: cover thumbnail · `yyyy-mm-dd · channel · count · age` ·
  **title** + status pill (`PROMOTED` emerald / `STAGED` amber) +
  archive pill (green `In archive` / slate `Linked` / red specific
  issue) + rating stars. Multi-cast sets show a 3rd line listing the
  other participants (the viewer themselves is omitted)
- Promoted photo rows display up to 4 sample thumbnails on the right
  (cover counts as the first frame for videos and staged sets, so
  those rows skip the strip)
- **Hover the small cover thumbnail** to see an enlarged version of
  the cover (~240×320 photos / 480×270 videos) — purely visual; no
  link pill since clicking anywhere on the row already navigates
- Year navigation: sticky year header (year + era pill when defined
  + set count) and a narrow right-edge year scrubber whose row
  background fill encodes that year's density relative to the
  busiest
- **Label affiliation chips** (FemJoy 43/3, VipNudes 2/0, …) act as
  multi-select filters — click a chip to filter the timeline to sets
  in that label; the active chip is highlighted. The `n/m` indicator
  on each chip splits photo sets (n) from video sets (m)
- Filters in the toolbar — Channel · Rating · Era (when defined) ·
  Archive · Sort. Channel dropdown only lists channels with > 0
  matching sets in the current view. URL-driven via comma-separated
  searchParams (`channel`, `crating`, `era`, `archive`, `clabel`,
  `csort`)

**Connections** (formerly "Network")
How this person relates to others, in three sections:
- **Personal relationships** — hand-recorded ties (sister, spouse, partner, friend, mentor…).
  Click **Add**, pick a role and the other person (search existing people, or type a name to
  add a **new contact** as a reference), optionally a note. The role's **inverse** shows on the
  other person's page (e.g. Parent here → Child there). Remove with the trash icon on hover.
- **Work — held together** — people who actually share a set with this person, ranked by shared-set
  count (computed automatically; nothing to maintain).
- **Claimed collaborations** — "worked with" assertions pulled from import files, even when you
  hold no set proving it. People not yet added show as outlined **reference** chips.

(Not to be confused with the sidebar **Networks**, which groups Labels — a different concept.)

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
  - Profile Manager (per-framing representative + Standardize/Link)
  - Lightbox with reference context (usage toggles, entity linking, collections, categories)
- No edit/merge/delete buttons (reference sessions are immutable)

#### Production Session Detail

- Header with status badge, project/label links, participant/set counts
- **Inline editable** fields: name, description, location, notes
- **Gallery** — media grid with batch upload zone and lightbox
- **Contributors** — list of persons with role badges (Model, Photographer). Shows "as: [name]" when the credited name differs from the person's common alias. Click to navigate to person detail. Use **"+ Add"** to add a contributor (alias-aware search, role selector, optional "credited as" override). The **+ Add** button is only available on production sessions — reference sessions are 1:1 with their person and cannot have additional contributors.
- **Linked Sets** — sets connected via SetSession. Shows primary badge and release date. Click to navigate to set detail.
- **Actions:**
  - **Edit** — modify session fields
  - **Merge** — absorb another session into this one (consolidates participants, media, and set links; the absorbed session is permanently deleted)
  - **Delete** — permanently delete the session and cascade

---

## 4. Sets

**Routes:** `/sets`, `/sets/[id]`

### Sets List

Cards display: cover photo thumbnail, title, type icon (Photo/Video), channel name, release date, participant avatars, artist names, and media count.

An **archive status dot** appears inline with the channel name:
- 🟢 Green = verified archive folder linked
- 🟡 Amber = archive folder suggestion (hover for folder name and confidence)
- ⬜ Empty outline = no archive folder linked

Hover the dot for a tooltip with folder path and file count.

**Search:** Filter by set title.

**Filters:**
- **Type** — Photo, Video, or All
- **Channel** — filter to a specific channel
- **Label** — filter by associated label
- **Person** — filter to sets with a specific participant
- **Release Date / Added** — date range filters
- **Has media** — toggle to show only sets with uploaded media
- **Archive** — No archive, Verified, Changed, Missing, Not imported

**Sorting:** Newest/Oldest release, Title A→Z/Z→A, Recently added, Recently updated, Most media.

**Grouping:** Click the **"Group by"** button to organize sets into sections:
| Option | Description |
|--------|-------------|
| No grouping | Default flat list with infinite scroll |
| Year | Release year (newest first, undated last) |
| Channel | Channel name (alphabetical) |
| Channel → Year | Two-level: channel sections with year sub-sections |
| Label | Label name (from channel's primary label mapping) |
| Youngest participant | Age bracket of youngest participant at time of release |

Channel → Year uses nested section headers (level 1 = channel, level 2 = year) that collapse independently. Youngest participant brackets: Under 20 / 20–25 / 25–30 / 30–35 / 35+. When grouping is active, up to 500 sets are loaded at once.

**Pagination:** 50 sets per page with "Load more" in ungrouped mode.

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

#### Archive

Links the set to its archive folder (the on-disk image/video files). It shows in the right sidebar when the link needs attention, or — when healthy — behind the green **In archive** chip in the header (click it to manage).

- **Suggestions** — if the matcher found a folder for this set, it appears as **"Possible archive match"** → click **Confirm** to link it.
- **Link folder / Change folder** — opens the **Archive Folder Picker**: search unlinked folders by name/title/date and pick one to link (or re-assign a folder from another set). Use this for **manually-created sets** that didn't auto-match a folder.
- **Unlink folder** — detaches the folder.
- **Add to list** — adds the set to the media shopping list with a P1–P3 priority.
- A status pill (OK / Changed / Missing / Incomplete / Pending) shows the last-checked time and file count.

#### Credits Section

Tracks who participated in the set (models, photographers).

- **Add Credit** — inline form with role selector and person search
- **Bulk add** — type comma-separated names
- **Smart suggestions** — three-tier priority: (1) known alias on this channel (violet "known alias" badge), (2) previously resolved same name, (3) frequent in channel
- **Alias creation prompt** — after resolution, if the credited name is novel, an inline "Add as alias?" prompt appears so the alias can be persisted immediately
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

### Favorites (ADR-0019)

**Route:** `/favorites`

A **favorite** is a single global per-image flag, separate from collections:

- **One-click heart** — tap the ♥ in the image viewer toolbar, or press <kbd>.</kbd> in the
  viewer. A filled-heart badge appears on favorited grid tiles. The `/favorites` page is the
  gallery of all favorites, with a **Person** filter and a **Favorite persons** toggle.
- **Favorite persons** — the ★ on a person (detail hero) marks a favorite person; the People
  browser has a **Favorite** filter pill.

### Fast collection assignment (ADR-0019)

In the image viewer:

- **Quick-add palette** — press <kbd>B</kbd> (or the folder-plus toolbar button) to open a
  fuzzy palette; type a collection name and press Enter to toggle the current image's membership.
- **Target collection** — on any collection, the ★ "Set as quick-add target" marks it as the
  one-key destination; press <kbd>G</kbd> in the viewer to add the current image to it.
- **Convert to favorites** — a collection's ♥ button marks all its images as favorites (used to
  retire a hand-made "FAV" collection, which you can then delete).

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
| Layout | Yes | **Grid** (default justified gallery) or **Before / after** — a side-by-side composite. Pick *Before / after* for comparisons; for matched framing on both sides, add **Aligned images** (see the Atlas). Change the layout anytime via the collection's Edit dialog. |

Collections created from this page are global (no person scope). Person-scoped collections are created from the lightbox info panel on a person's reference session.

### Collection Detail

- **`GRID` collections** hold single photos in a justified grid (lightbox, drag-to-add, Browse & Add).
- **`SIDE_BY_SIDE` (Before / after) collections** hold **Comparisons** — each a group of 2…N photos that belong together. The collection shows one **montage tile** per comparison (a mini collage of its members + a count). Click **New comparison** and pick 2+ photos (selection order = before→after) to make one.
- **Edit** — modify name, description, and layout. **Delete** — removes the collection (photos themselves are untouched).

#### The Comparison viewer (open a montage tile)

- **Title** — click the heading to name the comparison (shows on its montage tile).
- The whole lineup is sized to fit the screen height; cells share the aspect-driver's shape.
- **Fill vs Fit** — *Fill* (default) crops each photo to fill its cell; click a photo to set its **focal point** (what stays centred). *Fit* letterboxes the whole photo (bars when shapes differ).
- **Aspect-driver (⚓)** — pick which photo's shape governs every cell. Independent of order.
- **Side by side / Slider** — for exactly two photos, a draggable before/after wipe.
- **Reorder** (◀ ▶, sets before↔after), **Add photos**, **remove** a photo (min 2), **Delete** the comparison.

### Adding photos

- **GRID collections** — from any lightbox's **info panel → Collections** (a person's Recent Photos, Photos/Details tab, a set/session), the collection's **Browse & Add** (multi-select), or **drag** a thumbnail onto the open collection.
- **Before/after collections** — a photo belongs to a *comparison*, not the collection directly, so you build comparisons:
  - **Compare tray** — in any lightbox, **Add to compare** (the ⧉ button) gathers photos into a tray (a bar at the bottom, kept as you browse). When you have 2+, **Make comparison** → pick a before/after collection (or make one) → it creates the comparison, or appends the tray to an existing one.
  - Inside a collection, **New comparison**; inside a comparison, **Add photos**.

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

- **Usage toggles** — PROFILE, PORTFOLIO, DETAIL
  - PROFILE: person's display picture
  - PORTFOLIO: general portfolio image
  - DETAIL: linked to a body feature or a Profile/locus category
- **Profile framings** are set in the **Profile Manager** (reference session), not here — see *Profile framings (Profile Manager)*.
- **Entity linking** (when usage is DETAIL) — link to a specific Body Mark or Body Modification
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

## 11. Data Import

**Routes:** `/import`, `/import/[id]`

The import pipeline enables semi-automatic data ingestion from structured text files (one file per person). Data is parsed, staged for review, matched against existing DB records, and imported entity-by-entity with dependency tracking.

### Uploading a File

1. Navigate to **Import** in the sidebar
2. Drag and drop a `.txt` file onto the upload zone (or click to browse)
3. The file is parsed server-side and a new **Import Batch** is created
4. You're redirected to the **Import Workspace** for review

**Filename format:** `YYYY-MM-DD_Name_(ICG-ID).txt` — the date is used as the extraction date for versioning.

### Import Workspace

The workspace has a split-panel layout:

- **Header** — Subject name, ICG-ID, item count, extraction date, status summary (New/Blocked/Matched/Imported counts)
- **Entity tabs** — Person, Aliases, Identities, Channels, Sets, Co-Models
- **Left panel** — Scrollable item list with status badges, match details, and blocking reasons
- **Right panel** — Detail view for the selected item with all parsed fields

### Entity Statuses

| Status | Meaning |
|--------|---------|
| **New** | Not in DB, ready to import |
| **Matched** | Exact match found in DB (confidence 100%) |
| **Probable** | Fuzzy match found, needs confirmation |
| **Blocked** | Dependencies not yet imported (e.g., set waiting for channel + person) |
| **Imported** | Successfully imported to DB |
| **Skipped** | User chose to skip |
| **Failed** | Import attempted but failed |

### Matching

Matching runs automatically on every page load (dynamic sync). If you create an entity in the regular app, refreshing the import page will detect it.

- **Person/Co-Model**: Exact ICG-ID match, then fuzzy name via trigram similarity (>0.6)
- **Channel**: Exact normalized name, then trigram (>0.7)
- **Set**: Exact external ID, then title + channel + date (within 30 days), then title-only (>0.8)
- **Label**: Exact normalized name only

Use the **Refresh** button to manually re-run matching.

### Dependency Order

Items must be imported in dependency order:

1. **Labels** (auto-derived from channel names)
2. **Channels** (depend on labels)
3. **Person** (the subject)
4. **Co-Models** (other people referenced in sets)
5. **Aliases** (depend on person)
6. **Digital Identities** (depend on person)
7. **Sets** (depend on channel + person + co-models)
8. **Credits** (depend on sets)

Blocked items show which dependencies are missing (e.g., "Waiting for: CHANNEL:FEMJOY, PERSON:CX-82HO").

### Importing

- Click an item, then click **Import** to import it individually
- Click **Import All** to import all ready items (New + Matched) in dependency order
- Click **Skip** to mark an item as skipped
- Sets with the same title + date across different channels are flagged as **Possible duplicates**

### Versioning

When uploading a newer file for the same person (same ICG-ID), the system links batches via `previousBatchId` for history tracking.

---

## 12. Staging Sets

**Route:** `/staging-sets`

The Staging Sets workspace is the pre-production review queue. Sets are collected here from the import pipeline (or created from orphan archive folders) and reviewed before promotion to the active Sets database.

### Staging Set List

Each row shows:
- **Cover thumbnail** (with hover preview)
- **Date · Channel** metadata line
- **Title**
- **Artist · Image count** detail line
- **Participant avatars** (up to 3, with overflow count)
- **Status badge** (Pending / Reviewing / Approved / Promoted / Inactive / Skipped)
- **Priority dot** (colour-coded 1–4)
- **Match badge** — "Exact" or confidence percentage if a production Set match was found
- **Archive section** — inline strip below the row (see below)

### Archive Section (per row)

Each staging set row shows its archive status as a compact strip below the main row:

| State | Indicator | Content |
|-------|-----------|---------|
| **Confirmed link** | Green dot (right badge) + green strip | Folder name · file count |
| **HIGH suggestion** | Amber dot + amber strip | `✓ date+code` label · folder name · file count · **Confirm** / **✗** buttons |
| **MEDIUM suggestion** | Dimmer amber dot + muted strip | `~ title match` label · folder name · **Confirm** / **✗** buttons |
| **No match** | Grey `○` in strip | Expected relative path · **Link folder** button |

**Confirm** — links the suggested folder immediately, generating a stable `archiveKey` UUID.  
**✗** — rejects the suggestion (folder remains unlinked, will not be re-suggested unless re-scanned).  
**Link folder** — opens the **Archive Folder Picker** sheet.

Suggestions are **person-aware**: the matcher reads the person from the folder name (`…-CODE Person - Title`) and matches it against the set's people — using *any* recorded alias, plus the names from the import — alongside title similarity. A folder that only shares the date and channel but has a different person and title is no longer offered as a HIGH suggestion, which cuts false positives on channels that publish many sets per day. When neither the person nor the title is a good enough match, no suggestion is made and you link the folder manually via the picker.

### Archive Folder Picker

A search sheet for manually linking an unlinked archive folder:

1. Click **"Link folder"** on any staging set row
2. The search field is pre-seeded with the channel short name and year
3. Type to search unlinked archive folders by name, title, date, or channel
4. Click a result to confirm the link — the row immediately shows the green confirmed state

Only folders not yet linked to any Set or StagingSet appear in results.

### Filters

- **Status tabs** — Photo Sets / Video Sets (top)
- **Status buttons** — Pending, Reviewing, Approved, Promoted, Inactive, Skipped (with counts)
- **Match buttons** — Exact match, Probable, No match, No date
- **Duplicate button** — shows sets flagged as exact or probable duplicates
- **Channel tier buttons** — A, B, C, D, E
- **Archive filter row** — Has path, Verified, Changed, Missing, In queue, Needs media
- **Search** — free-text on title, channel, artist, person name
- **Date range** — from/to date filter
- **Sort** — Date, Title, Priority, Import Date, Undated First

### Duplicate Warning

When a staging set shares its channel and release date with another set — or is a confirmed re-import from another file — its slide panel shows a duplicate banner:

- **Possible duplicate** (amber) — another staging set has the same channel + release date.
- **Confirmed duplicate** (orange) — the same set was already imported from another file.

The banner lists the **candidate set(s)** that triggered it, so you can verify rather than guess. Each candidate shows a cover thumbnail, title, participant name(s), external ID, photo/video, and status, with an **Open** link to jump straight to that set (it loads in the panel even when its status is filtered out of the current list). Then choose:

- **Resolve (skip)** — marks this entry SKIPPED and cleans up the duplicate group.
- **Dismiss warning** — clears the flag when the sets are genuinely different.

This is unrelated to a split set's photo/video **sibling** (one import that has both a photo gallery and a video): the sibling shares the same external ID and is never flagged as a duplicate.

### Editing participants

In a (non-promoted) staging set's slide panel, the **Participants** block lets you fix the cast before promoting:
- **Remove** — hover a participant and click the **×** (unresolved participants are flagged "unresolved").
- **Add / exchange** — use **"Add participant — search person…"** to find and add a known person. To swap a wrong participant for the right one, remove the wrong one and add the correct person.

### Promoting a Staging Set

1. Select a staging set to open its slide panel
2. Review the comparison diff (if a production Set match exists)
3. Click **"Promote"** — creates or updates a production Set, marks the staging set PROMOTED
4. The `archiveKey` from the staging set is copied to the promoted Set and linked ArchiveFolder

---

## 13. Archive

**Route:** `/archive`

The Archive workspace shows the filesystem scan results — a record of every folder found in the configured archive root(s) and its link status to DB records.

### Archive Status Dots

Every Set card and Staging Set row shows a small status dot for its archive folder link:

| Dot | Status | Meaning |
|-----|--------|---------|
| 🟢 Green | **Verified (OK)** | Folder confirmed, file count matches expectation |
| 🟡 Amber | **Suggestion** | Matching folder found (not yet confirmed) |
| 🟠 Orange | **Incomplete** | Folder found but file count below expected |
| 🔴 Red | **Missing** | Previously linked folder no longer found on disk |
| 🔵 Blue | **Pending** | Path recorded, not yet scanned |
| ⬜ Empty outline | **None** | No archive folder linked |

Hover the dot for a tooltip with folder name, path, and file count.

### Suggestion Confidence

The matching system runs two tiers:

| Confidence | Match Criteria |
|-----------|---------------|
| **HIGH** | Exact release date **and** exact channel short name match |
| **MEDIUM** | Same year **and** same channel short name **and** title trigram similarity ≥ 40% |

HIGH suggestions show amber; MEDIUM suggestions show dimmer amber.

### Linking an orphan folder

An **orphan** folder is one the scan found but that isn't linked to any Set or Staging Set. Each orphan row offers:

- **Confirm** — accept the suggested Set/Staging match (when one is shown).
- **+ Create** — open the **Add Known Set** sheet **pre-filled from the folder** (title, channel, release date, photo/video, and the **participant parsed from the folder name** — exact alias match → known, otherwise an *unresolved* candidate you resolve via person search). Saving creates a staging set **and links the folder** to it; you then promote it to a full Set (the archive link carries over). This is the canonical "make a set from an archive folder" path.
- **Link to existing set/staging** — search and attach the folder to a record that already exists.
- **Delete** — remove the scan record (safe; a rescan recreates it).

To attach a folder to a Set you've **already created**, use the Set detail page's **Archive → Link folder** picker instead (the inverse direction).

### Archive Roots (Multi-Root)

Configure archive roots in **Settings → Archive Roots**. Multiple roots are supported (one path per line, or a JSON array). The system will check all roots when computing expected paths and when scanning for folder moves.

---

### Archive Scan & Sidecar Workflow

This section explains the full lifecycle from running the scan script for the first time through to having stable sidecar files written into every linked folder on disk.

#### Overview

The stable identity for each linked archive folder is an **`archiveKey`** — a UUID generated by the server the moment you confirm a link between a folder and a Set or Staging Set. The `archiveKey` is:

- Stored in the DB on the `ArchiveFolder`, `StagingSet`, and `Set` records.
- Written into the archive folder on disk as `_pulseboard.json` (the *sidecar file*) — but **only after you explicitly run the scan with `-WriteSidecars`**.
- Used on future scans to detect if a folder has been moved to a different drive or root, without requiring re-linking.

The `archiveKey` is **never generated by the scan** — the scan only reads and reports. The key is created server-side when you confirm a link in the UI.

---

#### Step 1 — First scan (discover folders + generate archiveKeys)

Run a **Full** scan so the server learns about every folder on disk:

```powershell
.\archive-scan.ps1 `
    -Mode Full `
    -PhotosetRoot "D:\Sites\" `
    -BaseUrl "http://10.66.20.65:3000" `
    -ApiKey "your-api-key"
```

Add `-VideosetRoot "V:\Video\"` if you also have a video archive. After this run:

- Every leaf folder under the root(s) is recorded in the DB as an `ArchiveFolder`.
- **A stable `archiveKey` UUID is generated immediately for every folder** — no confirmation step is required. This is the folder's permanent identity.
- **Empty leaf folders are skipped**, not registered: a new leaf that holds no content *and* has no `_pulseboard.json` is treated as a maintenance/backup leftover and reported as `Skipped (empty)` in the summary. It gets neither an `ArchiveFolder` record nor an `archiveKey`/sidecar. (Folders that still carry their sidecar — e.g. you removed the images for maintenance — keep their record and are never skipped.) Once a skipped folder gains content, the next scan registers it normally.
- **Empty folders never overwrite an existing record's content.** If an empty, sidecar-less folder re-appears at a path that a record still occupies (e.g. a backup recreates the old folder name after you renamed/moved the real one), the scan skips it instead of clobbering that record to "empty" — so you can't lose a folder's tracked content to a badly-timed scan. The authoritative state stays with the real folder (which carries its `_pulseboard.json`).
- The **matching pass** runs automatically. Sets and Staging Sets that have a HIGH or MEDIUM confidence match will show an amber suggestion dot in the UI.
- At the end of the scan the script counts how many on-disk folders are missing `_pulseboard.json` and asks:
  ```
  Write _pulseboard.json into 243 folder(s) missing a sidecar? [Y/n]
  ```
  Press **Enter** (default Yes) to write sidecars immediately, or `n` to defer.

---

#### Step 2 — Confirm links in the UI (optional but recommended)

Go to **Staging Sets** (`/staging-sets`) or **Sets** (`/sets`) in the browser.

- Rows/cards with amber dots have a suggested folder — review the folder name and file count shown in the archive strip.
- Click **Confirm** (HIGH suggestion) or **Confirm** (MEDIUM suggestion after reviewing) to link the folder.
- For rows with no suggestion (grey `○`), click **Link folder** to open the picker and search manually.

When you confirm a link, the folder's existing `archiveKey` is propagated to the `Set`/`StagingSet` record. The sidecar file for this folder (if already written) remains unchanged — the same UUID it already has is now also the Set's identity.

---

#### Step 3 — Sidecar write prompt

After every Full scan the script counts on-disk folders that lack `_pulseboard.json` and presents an interactive prompt:

```
Write _pulseboard.json into 38 folder(s) missing a sidecar? [Y/n]
```

- Press **Enter** or `Y` → sidecars are written immediately.
- Type `n` → sidecar writing is deferred until the next scan.

For scheduled/automated runs, add `-NoSidecarPrompt` to skip the prompt (sidecars are always written):

```powershell
.\archive-scan.ps1 -Mode Full -PhotosetRoot "D:\Sites\" -NoSidecarPrompt ...
```

What happens during the write phase:

1. The script iterates all `ArchiveFolder` records that have an `archiveKey`.
2. For each record: if the folder path exists on this machine and `_pulseboard.json` is not already present → fetches `GET /api/archive/sidecar/{archiveKey}` and writes the file.
3. Folders that already have a sidecar → **skipped** (never overwritten).
4. Folders not present on this machine (e.g. on a different volume) → silently skipped.

Output:

```
Writing sidecar files (_pulseboard.json)...
  Checking 243 folder(s) for missing _pulseboard.json...
  [SIDECAR] D:\Sites\FJ\2023\2023-05-14-FJ Jane Doe - Beach Day\_pulseboard.json
  ...
  Sidecars written: 38 | Already present: 205
```

Use `-DryRun` to preview what would be written without touching any files.

---

#### The sidecar file format

```json
{
  "archiveKey": "a3f8c2d1-...",
  "folderName": "2023-05-14-FJ Jane Doe - Beach Day",
  "setId": "clxyz...",
  "stagingSetId": null,
  "title": "Beach Day",
  "releaseDate": "2023-05-14",
  "channel": "FJ"
}
```

- `archiveKey` — the stable UUID; source of truth for move detection. Always present.
- `folderName` — the leaf folder name. Always present.
- `setId` / `stagingSetId` — populated only if a link has been confirmed; otherwise `null`.
- `title`, `releaseDate`, `channel` — informational metadata; null for unlinked folders.

The sidecar is served by: `GET /api/archive/sidecar/{archiveKey}` (requires `x-archive-key` header).

---

#### Step 4 — Cross-drive / cross-root move detection (subsequent scans)

On every scan the script reads `_pulseboard.json` from each folder it visits. If it finds an `archiveKey` but the folder's path is not in the preloaded known-paths list (i.e. the folder looks "new"), the script classifies it as a **MOVE** instead of a **CREATE**:

```
[MOVE via sidecar] Beach Day — key:a3f8c2d1…
```

The server then:
- Finds the existing `ArchiveFolder` record by `archiveKey`.
- Updates its `fullPath` and `relativePath`.
- Propagates the new `archivePath` to the linked `Set` or `StagingSet` (if any).

This works transparently across drive letters (e.g. `D:\` → `E:\`) and across archive root changes. **No re-linking is needed — even for unlinked folders.**

---

#### Recommended scan schedule

| When | Command | Purpose |
|------|---------|---------|
| Initial setup | `-Mode Full` | Discover folders, generate archiveKeys, write sidecars (prompted) |
| Routine (daily/weekly) | `-Mode Full` | Detect new/renamed/moved folders; prompt for any new missing sidecars |
| Automated/scheduled task | `-Mode Full -NoSidecarPrompt` | Same as routine but non-interactive |
| After bulk archive reorganisation | `-Mode Full` | Full reconciliation + sidecar check |

> **Tip:** Every routine `-Mode Full` run already handles sidecars via the end-of-scan prompt. There is no need for a separate sidecar-only run.

---

## 14. Settings

**Route:** `/settings`

### Appearance

- **Theme** — toggle between dark and light mode
- **Color Palette** — choose from predefined color schemes
- **Preview palettes** — link to a side-by-side comparison page

### Display Density

Dropdown to adjust UI spacing across the app: Compact, Normal, or Comfortable.

### Person Detail Layout

Controls information density for the person detail hero card: Minimal, Normal, or Detailed.

### Profile framings

Profile framings (Headshot, Photo 2, …) are now ordinary **categories** of the **Profile** group — rename or reorder them under **Media Categories** (below). There's no separate "Profile Slots" settings page anymore; their names drive the people-browser **Card photo framing** selector and the **Profile Manager** on each reference session.

### Media Categories

Organize photo documentation by category. An accordion interface allows managing category groups and individual categories.

**Built-in groups:**
- Physical Features
- Body Marks
- Body Modifications

**Per category:**
- Name and slug
- Sort order (drag to reorder)
- Entity model link (optional): BodyMark or BodyModification

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

These definitions are used in **Recording physical changes** — extensible attribute inputs appear in the Record/Edit Physical Change sheets below the 5 fixed fields. For a **status-bearing** attribute (breast size), an inline **Kind** picker sits directly under the field (default `Natural`); choosing `Augmentation` / `Reduction` / `Reversal` drives the derived status badge (ADR-0018). The Kind belongs to that one attribute — it is never a change-set-wide control and never affects unrelated fields.

**When did this change? (Phase G Slice 7 / ADR-0006).** The Record sheet no longer has an Era picker. Instead you pick one of three intents:

- **On this date** — pick a date and precision. The delta is auto-clustered into a draft Era of nearby changes (within ±6 months). If no draft is in range, a new one is started for you.
- **I don't know when yet** — files the delta into your *Undated changes* drawer (a dedicated dateless draft Era — distinct from baseline). Set the date later and it re-clusters into the right draft.
- **Actually, this was always true (baseline)** — adds the value to baseline. Use this when you're filling in measurements that were always true but weren't captured at import.

The default reflects history: a fresh person opens with **baseline** preselected; a person with existing measurements opens with **On this date**. Once a draft Era reaches a meaningful size, the Overview History panel will nudge you to name it (curation nudge — coming in Slice 9). Naming an Era promotes it from draft → curated and locks its membership.

**Editing a recorded change.** Open the Edit sheet on any History row to change values, the date, or the intent. While the containing Era is still a **draft** (unnamed), editing the date freely re-clusters the change into a better-fitting draft — and a now-empty source draft cleans itself up automatically. Once you name (curate) the Era, membership becomes sticky: you can still edit the date itself, but the change stays in the curated Era.

**Undated changes drawer.** Changes saved with "I don't know when yet" land in a per-person drawer surfaced on the Overview History panel as **Undated changes** (soft-amber styling). Each row has a `Set date` affordance opening an inline mini-form: edit the value, pick a date + precision (or change intent), and Save. The change re-clusters into a dated draft Era of its own (or joins one nearby per the ±6-month rule). When the drawer empties, it disappears.

**Curation nudge & promotion.** When a draft Era accumulates ≥3 populated changes, a soft inline prompt appears on the Era card: *"N changes saved here — Name this phase?"*. Clicking opens an **inline promotion editor**: enter a name + a checkbox list of the member deltas (all checked by default). Save promotes the Era from draft → curated; **unchecked rows split out** into their own draft Eras (clustered by date). At least one change must stay in the source Era. Dismissing the nudge (×) hides it for 7 days. The aggregate count of nudge-eligible drafts also surfaces as a badge on the **Overview tab label** itself.

**Attribute status** (derived automatically per ADR-0007/0018 from each delta's **Kind**, shown as badges in the Appearance tab; only attributes with `statusBearing=true` surface a badge):
- **Natural** — no surgical-kind delta on this attribute
- **Enhanced** (purple badge) — the winning delta is `Augmentation`
- **Reduced** (amber badge) — the winning delta is `Reduction`
- **Restored** (green badge) — the winning delta is `Reversal` (explant), or a surgical kind exists in history but a later natural delta overrode it

**Operations:** Add group, add definition to group, edit definition, delete definition (blocked if in use), reorder.

---

## 15. Workflows

### Documenting a New Person

1. Go to `/people` and click **"Add Person"**
2. Fill in ICG-ID, display name, and status
3. After creation, click the **"Reference Media"** card on the person detail page
4. Upload reference photos via the batch upload zone
5. Use the **Profile Manager** to set the Headshot framing (Standardize or Link) → its representative becomes the avatar
6. Set focal points for smart cropping
7. Assign usage types (Profile, Portfolio, Detail)
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
3. Click a credit to see suggestions from (highest to lowest confidence):
   - **Known alias on this channel** (violet badge) — person has this exact alias linked to the channel
   - Previous credits with the same name in other sets
   - Frequent participants in the same channel
4. Select the correct person or search for a different one
5. After resolution, if the credited name is not yet an alias for the person, an inline prompt appears: **"Add as alias?"** — click **Add Alias** to create it (linked to the channel), or **Skip** to dismiss
6. To skip a credit, click **"Ignore"**
7. To undo, click **"Unresolve"** on a resolved credit

**Alias-aware search:** Searching for a person by a non-common alias shows the matched alias in the dropdown as `(a.k.a.: [alias])`. The person's common name remains the display identity.

**"Credited as" display:** Set participants and session contributors show a secondary "as: [name]" hint when the credited name differs from their common alias.

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

### Linking an Archive Folder to a Staging Set

**Using a suggestion (HIGH/MEDIUM):**
1. Navigate to `/staging-sets`
2. Any row with an amber dot has a suggested match — the archive section below the row shows the folder name and confidence label
3. Click **Confirm** to link immediately, or **✗** to reject the suggestion
4. After confirming, the row shows a green strip with the folder name and file count

**Manually linking (no suggestion):**
1. Click **"Link folder"** on any staging set row (shown when no suggestion exists)
2. The picker sheet opens, pre-seeded with the channel short name and year
3. Search for the correct folder — only unlinked folders are shown
4. Click a result to confirm the link

**After any link is confirmed:**
- A stable `archiveKey` UUID is generated and written to the staging set, production set (after promotion), and archive folder record
- The external scan script can use `GET /api/archive/sidecar/{archiveKey}` to write a `_pulseboard.json` sidecar into the folder — this makes the link survive drive migrations

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
  ├── Era (curated phases — baseline first, deltas/events filed within)
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

### Eras — how a person develops over time

An **Era** is a curated phase of a person's development — a meaningful, user-named span like "2019 — went blonde, added sleeve tattoo". Eras form the spine of the History panel on the person Overview tab.

**Baseline.** Every person has exactly one **baseline Era**, auto-created. It carries no date of its own — it is "time zero" and holds the initial value of every changing attribute (the values formerly called "natural" hair color, breast size, etc.). It cannot be deleted; non-baseline Eras can be deleted (the events filed into them are cascaded).

**Filing changes.** A "change" is anything that develops — a body mark added, a hair color shift, a piercing modified, a digital identity gained. Every change carries its own date and is **filed into** an Era by the user. Membership is **sticky**: re-dating a change does not move it out of its Era. The fold that derives current state sorts changes by their own date and ignores Era boundaries — Eras are folders, not gates.

**Draft eras.** When you make a quick edit (e.g. add a tattoo with a specific date) and there's no Era covering that year yet, the app auto-creates a year-bucket Era flagged as **Draft** — shown with a dashed amber dot + amber "Draft" pill in the History panel. The Era still works correctly; the pill is just a nudge to give it a meaningful name. Editing the label, date, or notes clears the draft flag.

**Era-linked participation.** When you add a contributor to a session, the **Add Contributor** sheet shows an Era picker for the person and defaults to the Era whose date best covers the session. After creation, each participant row on `/sessions/[id]` shows a clickable amber Era pill — clicking it opens a small dialog to change the linked Era. The pill also surfaces an `at-shoot:` summary line (hair color · weight · build at the time, computed by point-in-time fold).

On `/sets/[id]`, each participant avatar shows a tiny amber Era label below the age. A compilation Set that spans multiple Eras for the same person shows "N eras" instead — there's no single shoot moment to anchor a single Era.

**Plausibility flags** (soft, never block saves):
- *Era is dated before birthdate* — likely a typo.
- *Change is dated before birthdate* — same, for individual deltas.
- *Era ranges overlap* — Eras may overlap (the design permits it), but the warning nudges manual tidy-up.
- *Participation is pinned to an Era that doesn't cover the session date* — either the pin or the session date is wrong.

---

## Date Modifiers & Data Quality

### Date Modifiers

When entering or editing dates (birthdate, career dates, era dates, session dates, set release dates), you can set a **modifier** indicating how confident you are in the value:

| Modifier | Display | When to use |
|----------|---------|-------------|
| **Exact** | *(no prefix)* | You know the precise date |
| **Approximate** | `~` | Close to the real date but unconfirmed (e.g. `~1995`) |
| **Estimated** | `est.` | Derived from indirect evidence (e.g. `est. March 2020`) |
| **Before** | `before` | The actual date is on or before this value |
| **After** | `after` | The actual date is on or after this value |

The modifier selector appears next to every date input that supports precision (birthdate, career dates in Edit Person, era dates, session dates, set release dates).

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
| `/import` | Import batch list |
| `/import/[id]` | Import workspace |
| `/staging-sets` | Staging Sets review queue |
| `/archive` | Archive workspace (filesystem scan results) |
| `/media-queue` | Media import queue |
| `/settings` | Settings |
| `/media/similar` | Find similar images |
