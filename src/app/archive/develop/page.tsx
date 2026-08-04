import { withTenantFromHeaders } from '@/lib/tenant-context'
import { getDevelopQueue } from '@/lib/services/attribution-confirm-service'
import { DevelopQueueClient } from '@/components/archive/develop-queue-client'

// Stage 2 of archive attribution (ADR-0027, plan slice 6). A page of its own on
// purpose: "who is in this set" and "do I want this set in the app yet" are
// different questions, and annotation research measured >10x throughput from
// asking one question per pass instead of a compound one.
export default async function DevelopPage() {
  return withTenantFromHeaders(async () => {
    const people = await getDevelopQueue({ limit: 60 })
    // Strip the fields the client does not render — notably the Date objects.
    // Large or complex client-component props can silently break SSR of other
    // client components on the page under Turbopack, and the fix is always to
    // send only what is used.
    return (
      <DevelopQueueClient
        people={people.map((p) => ({
          icgId: p.icgId,
          name: p.name,
          personId: p.personId,
          contactId: p.contactId,
          folders: p.folders.map((f) => ({
            id: f.id,
            folderName: f.folderName,
            fullPath: f.fullPath,
            coverUrl: f.coverUrl,
            isVideo: f.isVideo,
          })),
        }))}
      />
    )
  })
}
