import { Layers } from 'lucide-react'
import { StagingSetsWorkspace } from '@/components/staging-sets/staging-sets-workspace'

export const dynamic = 'force-dynamic'

export default function StagingSetsPage() {
  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
            <Layers size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight">Staging Sets</h1>
            <p className="text-sm text-muted-foreground">
              Review, annotate, and promote sets to production
            </p>
          </div>
        </div>
      </div>

      {/* Workspace */}
      <StagingSetsWorkspace />
    </div>
  )
}
