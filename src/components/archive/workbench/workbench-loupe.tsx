'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, Film } from 'lucide-react'
import { cn } from '@/lib/utils'
import { letterboxColumn, MIN_OVERLAY_WIDTH, type OverlayLevel } from '@/lib/workbench-session'
import { PersonIdentity } from '@/components/shared/person-identity'

/**
 * What the loupe needs in order to draw a folder.
 *
 * Deliberately narrower than any one caller's own type: the attribution workbench
 * and the contradiction session ask different questions about the same picture,
 * and the picture should not have to know which one is on screen.
 */
export type LoupeFolder = {
  folderName: string
  fullPath: string
  coverUrl: string | null
  isVideo: boolean
  attributions: { icgId: string; name: string }[]
  matcherSuggestion: {
    title: string
    releaseDate: string | null
    channelName: string | null
    agrees: { date: boolean; title: boolean }
  } | null
}

/** Who the question is about — shown as the face inset in the frame's corner. */
export type LoupeSubject = { icgId: string; name: string }

/** The reference face for that person, as resolved by the reference ladder. */
export type LoupeReference = { avatarUrl: string | null } | undefined

/**
 * The measured width of one empty column beside the cover.
 *
 * Re-measured when the cover changes and when the frame resizes; nothing else can
 * move it. The arithmetic itself lives in `letterboxColumn`, where it is tested.
 */
function useLetterboxColumn(ref: React.RefObject<HTMLImageElement | null>, coverUrl: string | null): number {
  const [column, setColumn] = useState(0)

  useEffect(() => {
    const el = ref.current
    const measure = () => {
      if (!el) return setColumn(0)
      const box = el.getBoundingClientRect()
      setColumn(letterboxColumn(box, { width: el.naturalWidth, height: el.naturalHeight }))
    }
    // Measure straight away — a cached cover is already complete and will fire no
    // load event — then again when one arrives, and whenever the frame resizes.
    measure()
    if (!el) return
    el.addEventListener('load', measure)
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => {
      el.removeEventListener('load', measure)
      ro.disconnect()
    }
  }, [ref, coverUrl])

  return column
}

/**
 * The cover, with everything the decision needs inside one fixation.
 *
 * The folder name used to sit under the image, ~370 px below where the eye rests
 * on the cover — about 10° of visual angle, where the useful field is 1–2°. Every
 * folder cost a look down and a look back: 30–120 ms of movement plus a ~200 ms
 * refractory period each way, twice per folder, across groups of 150. Lightroom's
 * Loupe Info overlay is the settled answer — identity next to the item, with `I`
 * cycling how much it says.
 *
 * Three details carry the whole idea:
 *
 * **The name sits directly above the cover, on its centre line.** An overlay in a
 * corner is closer than the old caption but still off to one side; centred, the
 * eye leaves the face straight upwards with no horizontal component, and the
 * shortest saccade is the one that only moves in one axis. Above rather than on
 * the picture also means it never covers the face being judged, whatever the
 * cover's aspect.
 *
 * **The face inset is width-capped to the measured letterbox column.** A 3:4 cover
 * in a wide frame leaves empty columns — 224 px on an 832 × 512 frame — and the
 * inset lives in one of them. The column is measured rather than assumed because
 * it depends on the cover; when it is too narrow (a wide videoset still that fills
 * the frame) the inset falls back onto the image behind its scrim, which is what
 * `I` is for — the same escape hatch Lightroom gives.
 *
 * **The frame is a constant size.** Successive covers differ in aspect, and the
 * title row holds a fixed height per level, so the cover lands in the same place
 * every time. If the box moved per folder the eye would have to re-find the
 * subject after every keystroke, spending back what the placement saves.
 */
export function LoupeView({
  folder,
  overlay,
  reference,
  subject,
  collecting = false,
}: {
  folder: LoupeFolder
  overlay: OverlayLevel
  reference: LoupeReference
  subject: LoupeSubject | null
  /** Collect mode is on: every key adds, nothing advances until Enter. */
  collecting?: boolean
}) {
  const Icon = folder.isVideo ? Film : Camera
  const matcher = folder.matcherSuggestion
  const imgRef = useRef<HTMLImageElement>(null)
  const column = useLetterboxColumn(imgRef, folder.coverUrl)
  // Below this a column holds nothing legible, so the block is allowed onto the
  // image instead of being squeezed into a word-per-line ribbon.
  const capped = column >= MIN_OVERLAY_WIDTH ? { maxWidth: column } : undefined

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col items-center">
      {/* Directly above the cover, on the cover's own centre line: the eye leaves
          the face straight upwards, with no horizontal component at all.

          The row keeps a fixed height per overlay level and hangs its content from
          the bottom, so a folder with an extra line does not push the cover down —
          the frame below must stay put from folder to folder. */}
      {overlay !== 'off' && (
        <div
          className={cn(
            'flex w-full max-w-3xl shrink-0 flex-col justify-end overflow-hidden px-2 pb-1 text-center',
            overlay === 'detail' ? 'h-[4.5rem]' : 'h-14',
          )}
        >
          <p className="line-clamp-2 text-sm font-medium leading-snug" title={folder.fullPath}>
            {folder.folderName}
          </p>
          {(folder.attributions.length > 0 || collecting) && (
            <p className="flex flex-wrap items-baseline justify-center gap-x-2 text-xs text-emerald-700 dark:text-emerald-400">
              {/* The mode belongs where the eye already is. In the header alone it
                  is invisible at the moment it changes what a keystroke does. */}
              {collecting && (
                <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
                  collecting · Enter when done
                </span>
              )}
              {folder.attributions.map((a) => (
                <PersonIdentity key={a.icgId} name={a.name} icgId={a.icgId} />
              ))}
            </p>
          )}
          {overlay === 'detail' && matcher && (
            <p
              className={cn(
                'truncate text-xs leading-snug',
                matcher.agrees.date || matcher.agrees.title
                  ? 'text-muted-foreground'
                  : 'text-amber-600 dark:text-amber-400',
              )}
            >
              matcher: {matcher.title}
              {matcher.channelName && ` · ${matcher.channelName}`}
              {matcher.releaseDate && ` · ${matcher.releaseDate}`}
            </p>
          )}
        </div>
      )}

      <div className="relative min-h-0 w-full flex-1">
        {folder.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- MinIO URL
          <img
            ref={imgRef}
            src={folder.coverUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-contain"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <Icon className="h-8 w-8" />
          </span>
        )}

        {/* Top-right: who we are asking about — the face, within the same look. */}
        {overlay !== 'off' && subject && (
          <div
            style={capped}
            className="absolute right-0 top-0 flex max-w-[35%] items-start gap-1.5 rounded-md bg-background/75 p-1.5 backdrop-blur-sm"
          >
            {reference?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- MinIO URL
              <img src={reference.avatarUrl} alt="" className="h-24 w-16 shrink-0 rounded object-cover" />
            ) : (
              <span className="flex h-24 w-16 shrink-0 items-center justify-center rounded bg-muted text-center text-[10px] text-muted-foreground">
                no face
              </span>
            )}
            <PersonIdentity name={subject.name} icgId={subject.icgId} className="min-w-0 pt-0.5 text-xs" />
          </div>
        )}
      </div>
    </div>
  )
}

