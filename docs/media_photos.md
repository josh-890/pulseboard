# media_photos.md

## Purpose

This document defines the complete media and photo architecture for the people-centric web application.

It is intended to be used as a **coding blueprint** for:

* Data modeling (Prisma)
* Upload pipeline
* Image processing
* Rendition strategy
* Frontend rendering rules
* Justified gallery layout
* Naming conventions

Context:

* Next.js (App Router)
* TypeScript (strict mode)
* Tailwind CSS + shadcn/ui
* PostgreSQL via Prisma
* Single admin uploader
* Internal application (no public traffic)
* ~5–50 photos per person

---

# 1. Core Principles

## 1.1 Single Source of Truth

For every photo:

* The **original file** is always stored.
* All display variants are generated from the original.

There are no manual resizes.

---

## 1.2 Image Roles

Photos are categorized by purpose.

### PROFILE

Primary profile / headshot image.

Characteristics:

* Used in overview cards
* Consistent cropping allowed
* Designed for predictable layouts

---

### GALLERY

All additional photos.

Characteristics:

* Original aspect ratio preserved
* No hard cropping
* Displayed inside the justified gallery

---

## 1.3 Intentional Simplicity

Because this is:

* internal only
* single admin
* no privacy or moderation concerns

The following are intentionally excluded:

* moderation workflows
* versioning
* AI smart cropping
* multi-user ownership
* complex CDN strategies

---

# 2. Upload & Processing Pipeline

## 2.1 High-Level Flow

1. Admin uploads image.
2. Upload happens via pre-signed URL.
3. Backend receives `uploadComplete`.
4. Processing worker generates renditions.
5. Metadata is written to the database.

---

## 2.2 Processing Steps

### Step 1 — Validation

* Validate MIME type (magic bytes)
* Enforce max file size (e.g. 25 MB)
* Ensure image is decodable

---

### Step 2 — Normalization

* Apply EXIF orientation
* Strip EXIF metadata
* Normalize color space (sRGB)

---

### Step 3 — Generate Renditions (sharp)

* `fit: cover` for PROFILE images
* `fit: inside` for GALLERY images

---

### Step 4 — Persist Metadata

Store:

* image dimensions
* URLs
* generated variants
* image role

---

# 3. Rendition Strategy

## 3.1 PROFILE Renditions

Goal: cards and profile display.

| Name        | Width | Fit   | Ratio |
| ----------- | ----- | ----- | ----- |
| profile_128 | 128   | cover | 4:5   |
| profile_256 | 256   | cover | 4:5   |
| profile_512 | 512   | cover | 4:5   |
| profile_768 | 768   | cover | 4:5   |

Rules:

* Cropping is allowed.
* Focus point optional (default: center).

---

## 3.2 GALLERY Renditions

Goal: justified gallery and detail views.

| Name         | Max Width | Fit    |
| ------------ | --------- | ------ |
| gallery_512  | 512       | inside |
| gallery_1024 | 1024      | inside |
| gallery_1600 | 1600      | inside |

Rules:

* Aspect ratio must be preserved.
* No cropping.

---

## 3.3 File Formats

Default:

* WebP (primary format)
* Optional JPEG fallback
* for uploading usual Image formats (are allowed)

For internal use, storing only WebP + original is sufficient.

---

# 4. Data Model (Prisma)

## 4.1 Person

```prisma
model Person {
  id       String   @id @default(cuid())
  name     String

  photos   Photo[]
}
```

---

## 4.2 Photo

```prisma
model Photo {
  id              String   @id @default(cuid())

  personId        String
  person          Person   @relation(fields: [personId], references: [id])

  role            PhotoRole

  originalUrl     String
  originalWidth   Int
  originalHeight  Int

  focusX          Float?   // 0..1
  focusY          Float?   // 0..1

  variants        Json

  sortOrder       Int      @default(0)

  createdAt       DateTime @default(now())
}
```

---

## 4.3 Enum

```prisma
enum PhotoRole {
  PROFILE
  GALLERY
}
```

---

## 4.4 Variants JSON Shape

```ts
type ImageVariants = {
  profile_128?: Variant
  profile_256?: Variant
  profile_512?: Variant
  profile_768?: Variant

  gallery_512?: Variant
  gallery_1024?: Variant
  gallery_1600?: Variant
}

type Variant = {
  url: string
  width: number
  height: number
}
```

---

# 5. Storage & Naming Convention

Recommended structure:

```
/media
  /persons
    /{personId}
      /original
      /{photoId}_profile_512.webp
      /{photoId}_gallery_1024.webp
```

Filename format:

```
{photoId}_{variant}.webp
```

---

# 6. Frontend Rendering Rules

## 6.1 General Rules

* Always provide width and height.
* Avoid layout shift (CLS).
* Use lazy loading by default.

---

## 6.2 Profile Cards

Container:

* Aspect ratio: 4 / 5
* `overflow: hidden`

Image:

```css
object-fit: cover;
object-position: center;
```

Default source:

* `profile_512`

---

## 6.3 Detail Header

* Large PROFILE image
* Constrained max-width
* Optional ratio container (4:5)

---

# 7. Justified Gallery Specification

## 7.1 Goal

* Natural presentation
* No cropping
* Balanced rows
* Professional photo gallery appearance

---

## 7.2 Required Input

Per image:

* width
* height
* src (gallery_512)

---

## 7.3 Row Packing Algorithm

### Parameters

```ts
TARGET_ROW_HEIGHT = 220
GAP = 8
MAX_ROW_HEIGHT = 280
MIN_ROW_HEIGHT = 160
```

---

### Algorithm Steps

1. Accumulate images until row width is exceeded.
2. Compute total aspect ratio sum:

```
sum(width / height)
```

3. Calculate row height:

```
rowHeight = containerWidth / ratioSum
```

4. If row height is outside min/max bounds, adjust image grouping.
5. Render row using uniform height.

---

## 7.4 Rendering

For each image:

```
renderWidth = rowHeight * aspectRatio
renderHeight = rowHeight
```

Layout:

* Flex row
* Fixed gap
* No cropping

---

## 7.5 Mobile Behavior

* Smaller target row height (~140–180)
* Automatic reduction of images per row

---

# 8. Performance Rules

* Gallery grid uses `gallery_512`
* Lightbox uses `gallery_1024`
* Optional zoom uses `gallery_1600`

Never load high-resolution images directly in the grid.

---

# 9. Admin Workflow

## Upload

Admin can:

* Choose role (PROFILE / GALLERY)
* Adjust ordering (drag & drop optional later)

---

## PROFILE Rule

Per person:

* Maximum one active PROFILE image
* Uploading a new PROFILE replaces the previous one

---

# 10. Future Extensions (Not Initial Scope)

Architecture should allow:

* Focus point editor
* Face-aware auto focus
* Lightbox viewer
* Virtualized gallery
* AI tagging

---

# 11. Recommended Implementation Order

1. Prisma schema
2. Upload endpoint
3. Sharp processing utility
4. Variant generation
5. Profile card rendering
6. Justified gallery layout utility
7. Gallery component
8. Lightbox (optional)

---

# 12. Definition of Done

Feature is complete when:

* Upload generates all variants correctly
* Cards render consistently without layout shifts
* Gallery displays mixed aspect ratios cleanly
* Gallery images are never unintentionally cropped
* Profile images remain visually consistent

---

# 13. Design Philosophy

Cards = structure
Gallery = authenticity

Profile images may be controlled and cropped.

Gallery images must preserve their original composition.
