import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { minioClient, getMinioBucket } from '@/lib/minio'
import { buildUrl } from '@/lib/media-url'
import { prisma } from '@/lib/db'

const MAX_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withTenantFromHeaders(async () => {
    const { id } = await params
    try {
      const formData = await request.formData()
      const file = formData.get('file') as File | null
      if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 })
      }

      if (!ALLOWED_TYPES.has(file.type)) {
        return NextResponse.json({ error: 'Invalid file type. Accepted: JPEG, PNG, WebP' }, { status: 400 })
      }

      if (file.size > MAX_SIZE) {
        return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 })
      }

      // Verify staging set exists
      const stagingSet = await prisma.stagingSet.findUnique({ where: { id }, select: { id: true } })
      if (!stagingSet) {
        return NextResponse.json({ error: 'Staging set not found' }, { status: 404 })
      }

      // Resize to max 800px wide JPEG
      const buffer = Buffer.from(await file.arrayBuffer())
      const resized = await sharp(buffer)
        .rotate() // auto-orient from EXIF
        .resize({ width: 800, withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer()

      // Use a versioned key so the URL changes on every upload — prevents the
      // browser from serving a cached copy of the old image after a replace.
      const version = Date.now()
      const key = `staging/${id}/cover-${version}.jpg`
      const bucket = getMinioBucket()

      // Delete any previous cover object(s) for this staging set
      const { ListObjectsV2Command } = await import('@aws-sdk/client-s3')
      const listed = await minioClient.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `staging/${id}/cover-` }))
      for (const obj of listed.Contents ?? []) {
        if (obj.Key && obj.Key !== key) {
          await minioClient.send(new DeleteObjectCommand({ Bucket: bucket, Key: obj.Key }))
        }
      }

      await minioClient.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: resized,
          ContentType: 'image/jpeg',
        }),
      )

      // Build full URL and store on record
      const url = buildUrl(key)
      await prisma.stagingSet.update({
        where: { id },
        data: { coverImageUrl: url },
      })

      return NextResponse.json({ url })
    } catch (err) {
      console.error('Cover upload error:', err)
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
    }
  })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withTenantFromHeaders(async () => {
    const { id } = await params
    try {
      const body = await request.json() as { degrees?: number }
      // degrees is CCW; sharp.rotate() is CW → negate
      const degrees = body.degrees ?? 90
      const cwDegrees = (360 - (degrees % 360)) % 360

      const { ListObjectsV2Command } = await import('@aws-sdk/client-s3')
      const bucket = getMinioBucket()

      // Find the current cover object
      const listed = await minioClient.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `staging/${id}/cover-` }))
      const currentKey = listed.Contents?.[0]?.Key
      if (!currentKey) {
        return NextResponse.json({ error: 'No cover image found' }, { status: 404 })
      }

      // Fetch current image bytes from MinIO
      const getResult = await minioClient.send(new GetObjectCommand({ Bucket: bucket, Key: currentKey }))
      const chunks: Uint8Array[] = []
      for await (const chunk of getResult.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk)
      }
      const buffer = Buffer.concat(chunks)

      // Rotate and re-encode
      const rotated = await sharp(buffer)
        .rotate(cwDegrees)
        .jpeg({ quality: 80 })
        .toBuffer()

      // Save under a new versioned key
      const version = Date.now()
      const newKey = `staging/${id}/cover-${version}.jpg`
      await minioClient.send(new PutObjectCommand({
        Bucket: bucket,
        Key: newKey,
        Body: rotated,
        ContentType: 'image/jpeg',
      }))

      // Delete old key
      await minioClient.send(new DeleteObjectCommand({ Bucket: bucket, Key: currentKey }))

      const url = buildUrl(newKey)
      await prisma.stagingSet.update({ where: { id }, data: { coverImageUrl: url } })

      return NextResponse.json({ url })
    } catch (err) {
      console.error('Cover rotate error:', err)
      return NextResponse.json({ error: 'Rotate failed' }, { status: 500 })
    }
  })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withTenantFromHeaders(async () => {
    const { id } = await params
    try {
      const { ListObjectsV2Command } = await import('@aws-sdk/client-s3')
      const bucket = getMinioBucket()
      // Delete all cover objects for this staging set (versioned + legacy cover.jpg)
      const listed = await minioClient.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `staging/${id}/cover` }))
      for (const obj of listed.Contents ?? []) {
        if (obj.Key) await minioClient.send(new DeleteObjectCommand({ Bucket: bucket, Key: obj.Key }))
      }
      await prisma.stagingSet.update({ where: { id }, data: { coverImageUrl: null } })
      return NextResponse.json({ ok: true })
    } catch (err) {
      console.error('Cover delete error:', err)
      return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
    }
  })
}
