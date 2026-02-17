# People_Browser.md

## Purpose

This document defines the **People Browser**, the primary overview interface used to browse, scan, and navigate large numbers of person profiles.

It serves as a **living senior-level specification** and defines:

* Layout philosophy
* Card orientation decisions
* Information density strategy
* Density modes
* Grid execution strategy
* Data loading strategy (pagination vs infinite scroll)
* Rendering constraints
* Performance foundations
* Scaling considerations

This document is intended to evolve over time as the system grows.

---

# 1. Core Design Goal

The People Browser is **not a profile showcase**.

It is a:

> **High-density browsing interface optimized for fast scanning and navigation.**

Primary goals:

* Show many persons simultaneously
* Enable fast recognition
* Surface key metadata immediately
* Minimize scrolling effort
* Maintain visual stability

---

# 2. Fundamental UX Principle

## Browse Fast → Inspect Deep

The system separates responsibilities:

### People Browser

* fast scanning
* dense information display
* navigation-focused

### Person Detail Page

* deep inspection
* large media
* rich information context

The overview prioritizes **efficiency over presentation**.

---

# 3. Card Orientation Decision

## Decision: Horizontal Cards (Landscape)

Cards must be horizontally oriented.

```
+--------------------------------------+
| [Image]  Name                        |
|          Birth date                  |
|          Birth place                 |
|          Optional metadata           |
+--------------------------------------+
```

---

## Rationale

### 3.1 Information Density

Horizontal layout:

* reduces vertical space usage
* allows more cards per screen
* scales better with large datasets

Vertical cards produce excessive scrolling when metadata is required.

---

### 3.2 Scan Efficiency

Natural visual flow:

* left = identity anchor (face)
* right = factual information

This aligns with reading behavior and improves scanning speed.

---

### 3.3 Industry Pattern

Large internal systems and data-heavy interfaces commonly use:

* horizontal compositions
* compact layouts
* face + metadata alignment

Examples include CRM systems, admin panels, and internal archives.

---

# 4. Card Structure Specification

## 4.1 Fixed Height (Mandatory)

Card height must be fixed.

Reasons:

* visual stability
* predictable scrolling
* future virtualization support
* avoids layout shifts

---

### Recommended Baseline Dimensions

Comfortable mode baseline:

* Card height: **130–140px**
* Image width: **90–110px**
* Image ratio: **4:5** (reuse PROFILE image renditions)

---

## 4.2 Internal Structure

```
Card
 ├─ Image (left)
 └─ Content (right)
     ├─ Name (primary)
     ├─ Metadata line(s)
     └─ Optional tags
```

Rules:

* Name is the strongest text element.
* Metadata remains compact.
* Avoid uncontrolled wrapping.

---

## 4.3 Metadata Compression

Preferred format:

```
Birth date • Birth place
```

instead of stacked labels.

Reason:

* reduced visual noise
* faster scanning
* higher information density

---

# 5. Image Rules (Overview)

Images use PROFILE variants defined in `media_photos.md`.

Requirements:

* Aspect ratio: 4:5
* `object-fit: cover`
* consistent crop
* face recognizability at small sizes

Image purpose:

> recognition anchor, not primary content.

---

# 6. Grid Execution Strategy

## 6.1 Target Scale

Expected dataset size:

> **~500 – 5000 persons**

This range requires stability and density, but does **not** require heavy virtualization initially.

---

## 6.2 Decision: Fixed Columns per Breakpoint (Enterprise Pattern)

The People Browser uses:

* CSS Grid
* fixed card geometry
* fixed column counts per breakpoint

Example concept:

* wide desktop: 5–6 columns
* desktop: 4 columns
* laptop: 3 columns
* tablet: 2 columns
* mobile: 1 column

Implementation detail (exact values adjustable during tuning).

---

## 6.3 Why Fixed Columns

Reasons:

* visual stability (muscle memory)
* predictable scanning
* consistent card sizes
* reduced layout reflow compared to fully fluid auto-fill
* easier future optimization

---

## 6.4 Card Geometry Rules

Mandatory:

* card width remains constant per density mode
* card height is fixed
* images keep fixed ratio

Result:

* stable grid structure
* predictable row layout
* easier performance tuning later

---

## 6.5 Responsive Behavior

Grid adapts via breakpoint-based column count.

Cards themselves do not stretch vertically.

Desktop is the primary optimization target.

---

## 6.6 Performance Strategy for 500–5000 Items

Initial implementation:

* chunked data loading
* avoid rendering entire dataset at once

Recommended chunk size:

* **50–100 items per load** (tune after testing)

---

## 6.7 Why Not Virtualization (Yet)

Virtualization is intentionally deferred because:

* complexity not justified at this scale
* fixed geometry keeps migration path easy later

Current decisions ensure virtualization can be added without redesign.

---

# 7. Data Loading Strategy

## 7.1 Decision Overview

For the People Browser:

* ❌ classic pagination is not preferred
* ❌ fully unbounded infinite scroll is avoided
* ⭐ **Load-More / Chunked Infinite Hybrid** is the selected approach

---

## 7.2 Why Not Classic Pagination

Pagination introduces:

* flow interruption
* extra cognitive load
* slower scanning for large datasets

The People Browser optimizes continuous scanning, not page-based navigation.

---

## 7.3 Why Not Pure Infinite Scroll

Pure infinite scroll causes long-term issues:

* loss of orientation
* difficult navigation when returning from detail pages
* uncontrolled DOM growth
* unclear progress through dataset

These drawbacks are especially problematic in data-oriented internal tools.

---

## 7.4 Selected Pattern: Load-More Hybrid

Behavior:

* initial load: 50–100 persons
* additional data loaded in chunks
* trigger can be:

  * explicit **Load more** button
  * or auto-trigger near bottom (optional later)

Example:

```
Load more (50)
```

---

## 7.5 Benefits of Hybrid Approach

* preserves browsing flow
* keeps DOM size controlled
* predictable performance
* easier debugging
* user retains control over data loading

This approach combines the benefits of pagination and infinite scroll without their main drawbacks.

---

## 7.6 Scroll Position Preservation (Mandatory)

When navigating:

```
People Browser → Person Detail → Back
```

The system must restore:

* scroll position
* loaded chunks

Loss of position is considered a UX failure for this interface.

---

## 7.7 URL State (Future Improvement)

Recommended future enhancement:

```
/people?offset=300
```

Allows:

* deep linking
* exact restoration
* stable back-navigation behavior

---

# 8. Density Modes (Core Concept)

## Purpose

Density modes define **how tightly information is visually packed** without changing structure or meaning.

They change:

* spacing
* sizing
* typography
* card height
* image size

They do NOT change:

* information hierarchy
* layout logic
* interaction behavior

---

## Why Density Modes Exist

Users operate in different modes:

### Browsing / Exploration

* visual orientation
* comfortable spacing
* lower cognitive load

### Power Scanning

* fast navigation
* maximum visibility
* minimal scrolling

---

## 8.1 Comfortable Mode (Default)

Goals:

* readability
* visual clarity
* relaxed browsing

Typical values:

* Card height: **130–140px**
* Larger image
* Generous padding
* 2–3 metadata lines

---

## 8.2 Compact Mode (Power Mode)

Goals:

* maximum density
* faster scanning
* reduced scrolling

Typical values:

* Card height: **90–110px**
* Smaller image
* Reduced padding
* Condensed metadata (ideally one line)

---

## 8.3 Mode Implementation Strategy

Single component pattern:

```
<PersonCard density="comfortable" />
<PersonCard density="compact" />
```

Only layout variables change.

---

## 8.4 Density Variables

| Property       | Comfortable | Compact  |
| -------------- | ----------- | -------- |
| Card Height    | 130–140px   | 90–110px |
| Image Width    | 90–110px    | 72–80px  |
| Padding        | 12–16px     | 6–8px    |
| Font Size      | base/sm     | sm/xs    |
| Metadata Lines | 2–3         | 1        |

---

# 9. Density Mode Selection

## Product Decision

* **Comfortable = default**
* **Compact = Power Mode**

---

## Settings Integration

Density mode is selected globally via:

> **Settings Page**

Requirements:

* persistent user preference
* applied globally to People Browser
* simple selector UI

Example:

```
Density:
(•) Comfortable
( ) Compact
```

---

# 10. Performance Foundations

Key rules:

* fixed-height cards
* stable image sizes
* predictable layout
* no dynamic expansion inside cards

Use:

* `profile_256` or `profile_512`

Avoid loading larger media in overview.

---

# 11. Interaction Model

* Entire card clickable
* Navigates to Person Detail

Possible future additions:

* quick actions
* hover preview
* selection mode

---

# 12. Visual Priority Hierarchy

1. Face (recognition)
2. Name (identity)
3. Core metadata
4. Secondary information

---

# 13. Anti-Patterns (Avoid)

Do NOT:

* use portrait-heavy social-media cards
* allow variable heights
* use masonry-like layouts
* place image above text
* allow uncontrolled text growth

---

# 14. Scaling Philosophy

As datasets grow:

* stability beats decoration
* predictable layout improves scanning speed
* dense layouts reduce cognitive load

---

# 15. Future Extensions

Possible additions:

* list view toggle
* ultra-compact mode
* keyboard navigation
* virtualization
* advanced filtering and grouping

---

# 16. Definition of Done

People Browser is complete when:

* many persons visible simultaneously
* faces recognizable at a glance
* metadata readable quickly
* layout remains stable
* scrolling feels efficient

---

# 17. Design Philosophy

Overview = efficiency
Detail = richness

The People Browser is a navigation tool — not a gallery.
