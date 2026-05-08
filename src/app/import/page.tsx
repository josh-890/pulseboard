export const dynamic = 'force-dynamic'

import { withTenantFromHeaders } from '@/lib/tenant-context'
import { Upload, ImageIcon } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { getAllBatches } from '@/lib/services/import/staging-service'
import { ImportBatchList } from '@/components/import/import-batch-list'
import { ImportUploadZone } from '@/components/import/import-upload-zone'

export default async function ImportPage() {
  return withTenantFromHeaders(async () => {
    const batches = await getAllBatches()

    return (
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
              <Upload size={20} className="text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold leading-tight">Import</h1>
              <p className="text-sm text-muted-foreground">
                {batches.length} {batches.length === 1 ? 'batch' : 'batches'}
              </p>
            </div>
          </div>

          <Link href="/import/covers">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ImageIcon size={14} />
              Cover Baskets
            </Button>
          </Link>
        </div>

        {/* Upload zone */}
        <ImportUploadZone />

        {/* Batch list */}
        <ImportBatchList batches={batches} />
      </div>
    )
  })
}
