import { NextResponse } from "next/server";
import { mediaUploadSchema } from "@/lib/validations/media";
import { uploadPhotoToStorage } from "@/lib/media-upload";
import { createMediaItemDirect } from "@/lib/services/media-service";

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

    // Validate file
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

    // Parse and validate metadata
    const metadata = {
      sessionId: formData.get("sessionId"),
      personId: formData.get("personId") || undefined,
      setId: formData.get("setId") || undefined,
      usage: formData.get("usage") || undefined,
      slot: formData.get("slot") || undefined,
      sortOrder: formData.get("sortOrder") || undefined,
    };

    const parsed = mediaUploadSchema.safeParse(metadata);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    const { sessionId, personId, setId, usage, slot, sortOrder } = parsed.data;

    // Use sessionId as storage prefix entity
    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadResult = await uploadPhotoToStorage(
      buffer,
      file.type,
      "session",
      sessionId,
      crypto.randomUUID(),
    );

    const mediaItem = await createMediaItemDirect({
      sessionId,
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      originalWidth: uploadResult.originalWidth,
      originalHeight: uploadResult.originalHeight,
      variants: uploadResult.variants,
      sortOrder,
      personId,
      usage,
      slot,
      setId,
    });

    return NextResponse.json({ mediaItem }, { status: 201 });
  } catch (err) {
    console.error("Media upload failed:", err);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 },
    );
  }
}
