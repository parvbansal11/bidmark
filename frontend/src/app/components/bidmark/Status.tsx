import type { ReactNode } from 'react'
import {
  BadgeCheck, Check, CircleDashed, CircleSlash, Clock, FileX, LoaderCircle, Minus, OctagonAlert, TriangleAlert, X, FlaskConical, Equal,
} from 'lucide-react'
import { cn } from '@/app/lib/cn'
import type { Severity } from '@/app/services/bidmark/types'

// One vocabulary for every verification state in the product. Each state has its
// own word and its own glyph so it reads the same without colour.
export type StatusKind =
  | 'verified' | 'met' | 'matched' | 'pass'
  | 'finding' | 'not_met' | 'mismatch'
  | 'review'
  | 'unchecked' | 'unavailable' | 'not_required' | 'not_submitted'
  | 'pending' | 'processing'
  | 'sandbox'

type Tone = 'pass' | 'finding' | 'review' | 'unchecked' | 'process'

const SPEC: Record<StatusKind, { label: string; tone: Tone; icon: typeof Check }> = {
  verified: { label: 'Verified', tone: 'pass', icon: BadgeCheck },
  met: { label: 'Met', tone: 'pass', icon: Check },
  matched: { label: 'Matched', tone: 'pass', icon: Equal },
  pass: { label: 'Passed', tone: 'pass', icon: Check },
  finding: { label: 'Finding', tone: 'finding', icon: OctagonAlert },
  not_met: { label: 'Not met', tone: 'finding', icon: X },
  mismatch: { label: 'Mismatch', tone: 'finding', icon: X },
  review: { label: 'Review', tone: 'review', icon: TriangleAlert },
  unchecked: { label: 'Not checked', tone: 'unchecked', icon: CircleDashed },
  unavailable: { label: 'Unavailable', tone: 'unchecked', icon: CircleSlash },
  not_required: { label: 'Not required', tone: 'unchecked', icon: Minus },
  not_submitted: { label: 'Not submitted', tone: 'unchecked', icon: FileX },
  pending: { label: 'Pending', tone: 'process', icon: Clock },
  processing: { label: 'Processing', tone: 'process', icon: LoaderCircle },
  sandbox: { label: 'Sandbox registry', tone: 'unchecked', icon: FlaskConical },
}

const TONE: Record<Tone, string> = {
  pass: 'text-pass bg-pass-bg border-pass-line',
  finding: 'text-finding bg-finding-bg border-finding-line',
  review: 'text-review bg-review-bg border-review-line',
  unchecked: 'text-unchecked bg-unchecked-bg border-unchecked-line border-dashed',
  process: 'text-process bg-process-bg border-process-line',
}

const TONE_TEXT: Record<Tone, string> = {
  pass: 'text-pass', finding: 'text-finding', review: 'text-review', unchecked: 'text-unchecked', process: 'text-process',
}

export function statusTone(kind: StatusKind): Tone {
  return SPEC[kind].tone
}

export function StatusPill({ kind, label, className, size = 'md', title }: {
  kind: StatusKind; label?: ReactNode; className?: string; size?: 'sm' | 'md'; title?: string
}) {
  const spec = SPEC[kind]
  const Icon = spec.icon
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full border font-medium',
        size === 'sm' ? 'h-5 px-1.5 text-[12px]' : 'h-6 px-2 text-[12px]',
        TONE[spec.tone],
        className,
      )}
    >
      <Icon className={cn(size === 'sm' ? 'size-3' : 'size-3.5', kind === 'processing' && 'animate-spin')} aria-hidden strokeWidth={2.25} />
      {label ?? spec.label}
    </span>
  )
}

export function StatusText({ kind, label, className }: { kind: StatusKind; label?: ReactNode; className?: string }) {
  const spec = SPEC[kind]
  const Icon = spec.icon
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-medium', TONE_TEXT[spec.tone], className)}>
      <Icon className="size-3.5 shrink-0" aria-hidden strokeWidth={2.25} />
      {label ?? spec.label}
    </span>
  )
}

const SEVERITY_STYLE: Record<Severity, string> = {
  HIGH: 'bg-finding text-white border-finding',
  MEDIUM: 'bg-review-bg text-review border-review-line',
  LOW: 'bg-unchecked-bg text-ink-2 border-line-strong',
  INFO: 'bg-surface text-ink-3 border-line',
}

export function SeverityTag({ severity, className }: { severity: Severity; className?: string }) {
  return (
    <span className={cn('inline-flex h-[22px] items-center rounded-[4px] border px-1.5 text-[12px] font-bold uppercase tracking-[0.05em]', SEVERITY_STYLE[severity], className)}>
      {severity}
    </span>
  )
}

export function SeverityCounts({ counts, className, compact }: { counts: Partial<Record<Severity, number>>; className?: string; compact?: boolean }) {
  const high = counts.HIGH ?? 0
  const medium = counts.MEDIUM ?? 0
  const low = counts.LOW ?? 0
  if (!high && !medium && !low) {
    return <span className={cn('text-[13px] text-ink-3', className)}>No findings</span>
  }
  return (
    <span className={cn('inline-flex items-center gap-2 text-[12.5px] tnum', className)}>
      {high > 0 && <span className="inline-flex items-center gap-1 font-semibold text-finding"><OctagonAlert className="size-3.5" aria-hidden />{high}{!compact && ' high'}</span>}
      {medium > 0 && <span className="inline-flex items-center gap-1 font-medium text-review"><TriangleAlert className="size-3.5" aria-hidden />{medium}{!compact && ' medium'}</span>}
      {low > 0 && <span className="inline-flex items-center gap-1 text-ink-3"><Minus className="size-3.5" aria-hidden />{low}{!compact && ' low'}</span>}
    </span>
  )
}
