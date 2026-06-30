export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { Upload, ImageIcon } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  getImportInbox,
  type ImportDoneSort,
} from '@/lib/services/import/staging-service'
import { ImportInboxWorkspace } from '@/components/import/import-inbox-workspace'
import { ImportUploadZone } from '@/components/import/import-upload-zone'
import {
  BrowserToolbar,
  type BrowserToolbarConfig,
} from '@/components/shared/browser-toolbar'

type ImportPageProps = {
  searchParams: Promise<{ q?: string; sort?: string }>
}

export default async function ImportPage({ searchParams }: ImportPageProps) {
  return withTenantFromHeaders(async () => {
    const sp = await searchParams
    const q = sp.q?.trim() || undefined
    const sort: ImportDoneSort = sp.sort === 'recent' ? 'recent' : 'name'

    const inbox = await getImportInbox({ q, sort })
    const shown = inbox.needsReview.length + inbox.done.length

    const toolbarConfig: BrowserToolbarConfig = {
      basePath: '/import',
      searchPlaceholder: 'Search by name or ICG-ID…',
      sortOptions: [
        { value: 'name', label: 'Name A–Z' },
        { value: 'recent', label: 'Recently imported' },
      ],
      defaultSort: 'name',
      filterGroups: [],
      resultCount: shown,
      totalCount: inbox.totalGroups,
    }

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
                <span className="font-medium text-foreground tabular-nums">
                  {inbox.totalGroups}
                </span>{' '}
                {inbox.totalGroups === 1 ? 'person' : 'people'}
                {inbox.needsReview.length > 0 && (
                  <> · {inbox.needsReview.length} need review</>
                )}
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

        <Suspense>
          <BrowserToolbar config={toolbarConfig} />
        </Suspense>

        {/* Triage inbox */}
        <ImportInboxWorkspace
          key={`${q ?? ''}|${sort}`}
          needsReview={inbox.needsReview}
          done={inbox.done}
          doneNextOffset={inbox.doneNextOffset}
          q={q}
          sort={sort}
        />
      </div>
    )
  })
}
