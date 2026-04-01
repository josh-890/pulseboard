import { NextResponse } from "next/server";
import { mediaUploadSchema } from "@/lib/validations/media";
import { uploadPhotoToStorage } from "@/lib/media-upload";
import {
  createMediaItemDirect,
  findExactDuplicates,
  replaceMediaItemFile,
} from "@/lib/services/media-service";
import { computeSha256, computeDHash } from "@/lib/image-hash";
import { withTenantFromHeaders } from "@/lib/tenant-context";

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

export async function POST(request: Request) {
  return withTenantFromHeaders(async () => {
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
      const sourceVideoRef = (formData.get("sourceVideoRef") as string | null) || undefined;
      const sourceTimecodeRaw = formData.get("sourceTimecodeMs");
      const sourceTimecodeMs = sourceTimecodeRaw ? Number(sourceTimecodeRaw) : undefined;

      const parsed = mediaUploadSchema.safeParse(metadata);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0].message },
          { status: 400 },
        );
      }

      const { sessionId, personId, setId, usage, slot, sortOrder } = parsed.data;

      // Read buffer and compute hashes
      const buffer = Buffer.from(await file.arrayBuffer());
      console.log(`[upload] Buffer ready: ${file.name} (${buffer.length} bytes)`);
      const hash = computeSha256(buffer);
      const phash = await computeDHash(buffer);
      console.log(`[upload] Hashes computed: sha256=${hash.slice(0, 12)}…`);

      // Check for duplicate action from client (re-submission after dialog)
      const duplicateAction = formData.get("duplicateAction") as string | null;
      const replaceMediaItemId = formData.get("replaceMediaItemId") as string | null;

      // Generate a unique ID for storage paths (works in all environments)
      const uniqueId = globalThis.crypto?.randomUUID?.()
        ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      // Handle replace action — swap file on existing MediaItem
      if (duplicateAction === "replace" && replaceMediaItemId) {
        console.log(`[upload] Replace mode: target=${replaceMediaItemId}`);
        const uploadResult = await uploadPhotoToStorage(
          buffer,
          file.type,
          "session",
          sessionId,
          uniqueId,
        );

        await replaceMediaItemFile(replaceMediaItemId, {
          variants: uploadResult.variants,
          size: file.size,
          originalWidth: uploadResult.originalWidth,
          originalHeight: uploadResult.originalHeight,
          hash,
          phash,
          filename: file.name,
          mimeType: file.type,
        });

        return NextResponse.json(
          { mediaItem: { id: replaceMediaItemId, filename: file.name, replaced: true } },
          { status: 201 },
        );
      }

      // If not an accepted duplicate re-submission, check for duplicates
      if (duplicateAction !== "accept") {
        const matches = await findExactDuplicates(hash, { personId, sessionId });

        if (matches.length > 0) {
          return NextResponse.json(
            { duplicateFound: true, matches, hash, phash },
            { status: 200 },
          );
        }
      }

      // Proceed with upload (no duplicates, or accepted duplicate)
      console.log(`[upload] Uploading to MinIO: session/${sessionId}/${uniqueId}`);
      const uploadResult = await uploadPhotoToStorage(
        buffer,
        file.type,
        "session",
        sessionId,
        uniqueId,
      );
      console.log(`[upload] MinIO upload complete, creating DB record`);

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
        hash,
        phash,
        sourceVideoRef,
        sourceTimecodeMs,
      });

      return NextResponse.json({ mediaItem }, { status: 201 });
    } catch (err) {
      console.error("Media upload failed:", err);
      return NextResponse.json(
        { error: "Upload failed" },
        { status: 500 },
      );
    }
  });
}
