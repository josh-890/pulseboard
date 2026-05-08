export const dynamic = 'force-dynamic'

import { withTenantFromHeaders } from '@/lib/tenant-context'
import { ImageIcon } from 'lucide-react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { CoverBasketsSection } from '@/components/import/cover-baskets-section'

type ImportCoversPageProps = {
  searchParams: Promise<{ personId?: string; personLabel?: string }>
}

export default async function ImportCoversPage({ searchParams }: ImportCoversPageProps) {
  return withTenantFromHeaders(async () => {
    const { personId, personLabel } = await searchParams

    return (
      <div className="flex h-[calc(100vh-4rem)] flex-col gap-4 px-0">
        {/* Page header */}
        <div className="flex shrink-0 items-center gap-3">
          <Link href="/import" className="text-muted-foreground hover:text-foreground">
            <ChevronLeft size={18} />
          </Link>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
            <ImageIcon size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight">Cover Baskets</h1>
            <p className="text-sm text-muted-foreground">
              Upload and match cover images before transferring to staging sets
            </p>
          </div>
        </div>

        {/* Section */}
        <CoverBasketsSection
          initialPersonId={personId}
          initialPersonLabel={personLabel}
        />
      </div>
    )
  })
}
