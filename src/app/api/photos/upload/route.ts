import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { photoUploadSchema } from "@/lib/validations/photo";
import { uploadPhotoToStorage } from "@/lib/photo-upload";
import { createPhoto } from "@/lib/services/photo-service";
import { createMediaItemFromPhoto, createMediaItemForPerson } from "@/lib/services/media-service";
import { prisma } from "@/lib/db";

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    // Parse tags from form data
    const rawTags = formData.get("tags");
    const tags = rawTags ? (rawTags as string).split(",").filter(Boolean) : undefined;

    const metadata = {
      entityType: formData.get("entityType"),
      entityId: formData.get("entityId"),
      caption: formData.get("caption") || undefined,
      tags,
    };
    const parsed = photoUploadSchema.safeParse(metadata);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 },
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File size must be 25MB or less" },
        { status: 400 },
      );
    }
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "File must be JPEG, PNG, WebP, or GIF" },
        { status: 400 },
      );
    }

    const { entityType, entityId, caption } = parsed.data;
    const photoId = randomUUID();
    const buffer = Buffer.from(await file.arrayBuffer());

    const uploadResult = await uploadPhotoToStorage(
      buffer,
      file.type,
      entityType,
      entityId,
      photoId,
    );

    const photo = await createPhoto({
      id: photoId,
      entityType,
      entityId,
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      originalWidth: uploadResult.originalWidth,
      originalHeight: uploadResult.originalHeight,
      variants: uploadResult.variants,
      tags: parsed.data.tags,
      caption,
    });

    // Bridge: also create a MediaItem when uploading to a set with a linked session
    if (entityType === "set") {
      try {
        const setSession = await prisma.setSession.findFirst({
          where: { setId: entityId, isPrimary: true },
          select: { sessionId: true },
        });
        if (setSession) {
          await createMediaItemFromPhoto({
            sessionId: setSession.sessionId,
            setId: entityId,
            filename: file.name,
            mimeType: file.type,
            size: file.size,
            originalWidth: uploadResult.originalWidth,
            originalHeight: uploadResult.originalHeight,
            variants: uploadResult.variants,
            caption,
            tags: parsed.data.tags,
          });
        }
      } catch (bridgeErr) {
        // Log but don't fail the upload — the Photo was already created
        console.error("MediaItem set bridge failed:", bridgeErr);
      }
    }

    // Bridge: also create a MediaItem in the person's reference session
    if (entityType === "person") {
      try {
        const refSession = await prisma.session.findFirst({
          where: { personId: entityId, status: "REFERENCE" },
          select: { id: true },
        });
        if (refSession) {
          await createMediaItemForPerson({
            sessionId: refSession.id,
            personId: entityId,
            filename: file.name,
            mimeType: file.type,
            size: file.size,
            originalWidth: uploadResult.originalWidth,
            originalHeight: uploadResult.originalHeight,
            variants: uploadResult.variants,
            caption,
            tags: parsed.data.tags,
          });
        }
      } catch (bridgeErr) {
        // Log but don't fail the upload — the Photo was already created
        console.error("MediaItem person bridge failed:", bridgeErr);
      }
    }

    return NextResponse.json({ photo }, { status: 201 });
  } catch (err) {
    console.error("Upload failed:", err);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 },
    );
  }
}
