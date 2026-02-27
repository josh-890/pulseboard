# People-Centric Image Focal Point Auto-Detection

## Technical Specification

**Stack:** Next.js (App Router), TypeScript, PostgreSQL, Prisma, MinIO\
**Focus:** Automatic face-based focal point detection with manual
override\
**Version:** 1.0

------------------------------------------------------------------------

# 1. Overview

This document specifies the architecture and implementation strategy for
automatic focal point detection in a people-driven web application.

Images are stored in MinIO, metadata in PostgreSQL via Prisma.\
The system automatically detects the most relevant face in an image and
stores a normalized focal point (`focalX`, `focalY`) for use in
responsive UI layouts using `object-fit: cover`.

------------------------------------------------------------------------

# 2. Goals

-   Automatically detect the primary person in uploaded images
-   Store focal metadata in PostgreSQL
-   Support manual override in admin UI
-   Maintain performance and scalability
-   Avoid destructive cropping (keep originals)

------------------------------------------------------------------------

# 3. System Architecture

## 3.1 High-Level Flow

1.  User uploads image
2.  Image stored in MinIO
3.  DB record created with status `pending`
4.  Job enqueued
5.  Worker downloads image
6.  Worker runs face detection
7.  Focal point stored in Postgres
8.  Frontend renders using `object-position`

------------------------------------------------------------------------

# 4. Database Schema (Prisma)

## 4.1 Minimal Single-Focal Implementation

``` prisma
model Image {
  id           String   @id @default(cuid())
  bucket       String
  objectKey    String

  width        Int?
  height       Int?

  focalX       Float?   // normalized 0..1
  focalY       Float?   // normalized 0..1
  focalSource  String?  // "auto" | "manual"
  modelVersion String?

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

------------------------------------------------------------------------

# 5. Auto-Detection Worker

## 5.1 Responsibilities

-   Download image from MinIO
-   Resize for efficient processing (max 1024px)
-   Detect faces
-   Select primary face
-   Compute normalized focal point
-   Persist result

## 5.2 Recommended Dependencies

-   sharp
-   @tensorflow/tfjs-node
-   @vladmandic/face-api
-   bullmq (queue)
-   @prisma/client
-   minio

------------------------------------------------------------------------

# 6. Face Selection Heuristic

## 6.1 Primary Face Selection

If multiple faces detected: - Choose largest bounding box (area-based) -
Tie-breaker: highest confidence

## 6.2 Focal Point Calculation

Given bounding box:

x, y, width, height

``` ts
focalX = (x + width / 2) / imageWidth
focalY = (y + height * 0.4) / imageHeight
```

Note: Using 0.4 biases toward eye region.

Clamp to 0..1 range.

------------------------------------------------------------------------

# 7. Worker Pseudocode

``` ts
async function processImage(imageId: string) {
  const image = await prisma.image.findUnique({ where: { id: imageId } })
  
  const buffer = await downloadFromMinio(image.bucket, image.objectKey)

  const resized = await sharp(buffer)
    .resize({ width: 1024, withoutEnlargement: true })
    .toBuffer()

  const detections = await faceapi.detectAllFaces(resized)

  if (!detections.length) {
    await prisma.image.update({
      where: { id: imageId },
      data: { focalX: 0.5, focalY: 0.5, focalSource: "auto" }
    })
    return
  }

  const primary = selectLargestFace(detections)

  const focalX = (primary.x + primary.width / 2) / primary.imageWidth
  const focalY = (primary.y + primary.height * 0.4) / primary.imageHeight

  await prisma.image.update({
    where: { id: imageId },
    data: {
      focalX,
      focalY,
      focalSource: "auto",
      modelVersion: "face-v1"
    }
  })
}
```

------------------------------------------------------------------------

# 8. Frontend Rendering

``` tsx
<img
  src={src}
  alt={alt}
  style={{
    objectFit: "cover",
    objectPosition: `${(focalX ?? 0.5) * 100}% ${(focalY ?? 0.5) * 100}%`
  }}
/>
```

------------------------------------------------------------------------

# 9. Manual Override (Admin UI)

## 9.1 Behavior

-   Show image in aspect-ratio preview
-   User clicks desired focal point
-   Convert click position to normalized coordinates
-   Save as `focalSource = "manual"`

## 9.2 Click Conversion Formula

Given:

-   Display box width/height
-   Natural image width/height
-   Cover scaling logic

Compute scale:

    scale = max(boxWidth / imgWidth, boxHeight / imgHeight)
    renderWidth = imgWidth * scale
    renderHeight = imgHeight * scale
    offsetX = (renderWidth - boxWidth) / 2
    offsetY = (renderHeight - boxHeight) / 2

Convert click to original coordinates:

    imgX = (clickX + offsetX) / scale
    imgY = (clickY + offsetY) / scale

    focalX = imgX / imgWidth
    focalY = imgY / imgHeight

------------------------------------------------------------------------

# 10. Performance Considerations

-   Always resize before detection
-   Run worker outside request lifecycle
-   Use job queue
-   Avoid reprocessing manual images
-   Store model version

------------------------------------------------------------------------

# 11. Failure Handling

If detection fails: - Fallback to 0.5 / 0.5 - Log error - Mark status as
processed

------------------------------------------------------------------------

# 12. Optional Enhancements

-   Per-variant focal points (card vs carousel)
-   Confidence score
-   Auto-reprocess if model updated
-   Eye-level weighting tuning
-   Multiple-face layout optimization

------------------------------------------------------------------------

# 13. Security Considerations

-   Validate MIME type
-   Limit image size
-   Prevent malicious payloads
-   Run worker in isolated environment

------------------------------------------------------------------------

# 14. Summary

This specification defines a scalable, modern, people-focused image
focal detection system with:

-   Automatic face detection
-   Normalized focal metadata
-   Manual override
-   Efficient worker processing
-   Responsive frontend integration

End of Specification.
