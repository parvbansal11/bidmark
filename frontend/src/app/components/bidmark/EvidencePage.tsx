import { useEffect, useRef, useState } from 'react'
import { toApiError, type ApiError } from '@/app/lib/api'
import { cn } from '@/app/lib/cn'
import { evidence, type BBox } from '@/app/services/bidmark'
import { ErrorState } from '@/app/components/ui/states'

const imageCache = new Map<string, string>()

export interface PageBox {
  id: string
  bbox: BBox
  tone: 'finding' | 'review' | 'field'
  label?: string
  active?: boolean
}

export function usePageImage(documentId: string, page: number) {
  const key = `${documentId}:${page}`
  const [url, setUrl] = useState<string | null>(() => imageCache.get(key) ?? null)
  const [error, setError] = useState<ApiError | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let alive = true
    const cached = imageCache.get(key)
    setError(null)
    if (cached) { setUrl(cached); return }
    setUrl(null)
    evidence.pageImage(documentId, page)
      .then(blob => {
        const objectUrl = URL.createObjectURL(blob)
        imageCache.set(key, objectUrl)
        if (alive) setUrl(objectUrl)
      })
      .catch(e => { if (alive) setError(toApiError(e)) })
    return () => { alive = false }
  }, [key, documentId, page, attempt])
  return { url, error, retry: () => setAttempt(a => a + 1) }
}

const TONE: Record<PageBox['tone'], string> = {
  finding: 'border-finding bg-finding/[0.07]',
  review: 'border-review bg-review/[0.07]',
  field: 'border-navy-600/70 bg-navy-600/[0.05] border-dashed',
}

export function EvidencePage({ documentId, page, pageSize, boxes = [], onBoxClick, className }: {
  documentId: string
  page: number
  pageSize: [number, number] | undefined
  boxes?: PageBox[]
  onBoxClick?: (id: string) => void
  className?: string
}) {
  const { url, error, retry } = usePageImage(documentId, page)
  const activeRef = useRef<HTMLButtonElement | null>(null)
  const [w, h] = pageSize ?? [595, 842]
  const activeId = boxes.find(b => b.active)?.id

  useEffect(() => {
    if (activeId && url) {
      activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
    }
  }, [activeId, url])

  if (error) {
    return (
      <ErrorState error={error} onRetry={retry} what="the page image" compact className="bg-surface" />
    )
  }

  return (
    <div className={cn('relative w-full overflow-hidden rounded-sm bg-white shadow-[0_1px_2px_rgb(14_26_43/0.08),0_12px_32px_-12px_rgb(14_26_43/0.25)] ring-1 ring-line', className)}
      style={{ aspectRatio: `${w} / ${h}` }}>
      {url ? (
        <img src={url} alt={`Page ${page} of the uploaded document`} className="absolute inset-0 size-full select-none" draggable={false} />
      ) : (
        <div className="skeleton absolute inset-0 rounded-none" role="status" aria-label="Rendering page" />
      )}
      {url && boxes.map(b => {
        const [x0, top, x1, bottom] = b.bbox
        const pad = 2
        return (
          <button
            key={b.id}
            ref={b.active ? activeRef : undefined}
            type="button"
            onClick={() => onBoxClick?.(b.id)}
            aria-label={b.label ? `Evidence: ${b.label}` : 'Evidence location'}
            className={cn(
              'absolute rounded-[2px] border-2 transition-[box-shadow,opacity] duration-200',
              TONE[b.tone],
              b.active ? 'z-10 animate-pin-in shadow-[0_0_0_4px_rgb(168_35_26/0.18)]' : 'opacity-70 hover:opacity-100',
              b.tone === 'field' && b.active && 'shadow-[0_0_0_4px_rgb(38_70_127/0.15)]',
              !onBoxClick && 'pointer-events-none',
            )}
            style={{
              left: `${((x0 - pad) / w) * 100}%`,
              top: `${((top - pad) / h) * 100}%`,
              width: `${((x1 - x0 + pad * 2) / w) * 100}%`,
              height: `${((bottom - top + pad * 2) / h) * 100}%`,
            }}
          >
            {b.active && b.label && (
              <span className="absolute -top-6 left-0 whitespace-nowrap rounded bg-ink px-1.5 py-0.5 text-[12px] font-medium text-white shadow-raised">
                {b.label}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// A magnified view of the region around one evidence box, cut from the same page image.
export function EvidenceCrop({ documentId, page, pageSize, bbox, tone = 'finding', caption }: {
  documentId: string; page: number; pageSize: [number, number] | undefined; bbox: BBox; tone?: 'finding' | 'review'; caption?: string
}) {
  const { url, error } = usePageImage(documentId, page)
  const [pw, ph] = pageSize ?? [595, 842]
  const [x0, top, x1, bottom] = bbox
  const w = Math.min(pw, Math.max(x1 - x0 + 140, 220))
  const h = Math.min(ph, Math.max(bottom - top + 44, 56))
  const rx = Math.max(0, Math.min(pw - w, (x0 + x1) / 2 - w / 2 - 30))
  const ry = Math.max(0, Math.min(ph - h, (top + bottom) / 2 - h / 2))
  if (error) return null
  return (
    <figure className="overflow-hidden rounded-md border border-line bg-white">
      <div className="relative w-full" style={{
        aspectRatio: `${w} / ${h}`,
        backgroundImage: url ? `url(${url})` : undefined,
        backgroundSize: `${(pw / w) * 100}% auto`,
        backgroundPosition: `${pw === w ? 0 : (rx / (pw - w)) * 100}% ${ph === h ? 0 : (ry / (ph - h)) * 100}%`,
        backgroundRepeat: 'no-repeat',
      }}>
        {!url && <div className="skeleton absolute inset-0 rounded-none" />}
        {url && (
          <span className={cn('absolute rounded-[2px] border-2 animate-pin-in', tone === 'finding' ? 'border-finding bg-finding/[0.06]' : 'border-review bg-review/[0.06]')}
            style={{ left: `${((x0 - 2 - rx) / w) * 100}%`, top: `${((top - 2 - ry) / h) * 100}%`, width: `${((x1 - x0 + 4) / w) * 100}%`, height: `${((bottom - top + 4) / h) * 100}%` }} />
        )}
      </div>
      <figcaption className="flex items-center justify-between border-t border-line bg-subtle px-2.5 py-1 text-[12px] text-ink-3">
        <span>Evidence close-up, page {page}</span>
        {caption && <span className="font-mono">{caption}</span>}
      </figcaption>
    </figure>
  )
}
