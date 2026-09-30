import { useState, type ReactNode } from 'react'
import { Check, ChevronDown, FileText, MapPin, Network, RotateCcw, X } from 'lucide-react'
import { toApiError, type ApiError } from '@/app/lib/api'
import { invalidate } from '@/app/lib/useResource'
import { cn } from '@/app/lib/cn'
import { formatDate, formatDateTime, humanise } from '@/app/lib/format'
import { categoryLabel, findingTitle, SOURCE_LABEL } from '@/app/lib/labels'
import { findingDocumentId, findingPins } from '@/app/lib/bidmarkStatus'
import { cases, type Bidder, type BidSubmission, type Finding, type Requirement } from '@/app/services/bidmark'
import { Button, Mono, Textarea } from '@/app/components/ui/primitives'
import { SeverityTag, StatusPill } from './Status'

export interface FindingContext {
  bidder?: Bidder | null
  bid?: BidSubmission | null
  requirements?: Requirement[]
  documentNames?: Record<string, string>
  bidderNames?: Record<string, string>
}

function Row({ label, children, emphasis }: { label: string; children: ReactNode; emphasis?: 'finding' | 'pass' }) {
  return (
    <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-3 py-1.5 text-[13px]">
      <dt className="text-ink-3">{label}</dt>
      <dd className={cn('min-w-0 break-words text-ink', emphasis === 'finding' && 'font-semibold text-finding', emphasis === 'pass' && 'text-pass')}>{children}</dd>
    </div>
  )
}

const str = (v: unknown) => (v == null ? '' : String(v))

// The structured "claimed versus observed" view for each kind of finding.
export function EvidenceFacts({ finding: f, ctx }: { finding: Finding; ctx: FindingContext }) {
  const e = f.evidence ?? {}
  const pins = f.evidence?.pins ?? []
  switch (f.code) {
    case 'OVERLAPPING_TEXT':
      return (
        <dl>
          <Row label="Printed value"><Mono>{str(e.visible_text)}</Mono> <span className="text-ink-3">in {str((e.visible_fonts as string[] | undefined)?.join(', '))}</span></Row>
          <Row label="Recovered underneath" emphasis="finding"><Mono>{str(e.covered_text)}</Mono> <span className="font-normal text-ink-3">in {str((e.covered_fonts as string[] | undefined)?.join(', '))}</span></Row>
          <Row label="What it means">The original value is still in the file beneath the visible one. Issuers regenerate a certificate; they do not type over it.</Row>
        </dl>
      )
    case 'FIELD_FONT_OUTLIER': {
      const fonts = (e.document_fonts ?? {}) as Record<string, number>
      return (
        <dl>
          <Row label="Font on this field" emphasis="finding"><Mono>{str(e.font)}</Mono></Row>
          <Row label="Use in document">{str(e.chars_in_document)} characters, all of them in this field</Row>
          <Row label="Fonts in file">
            <span className="flex flex-wrap gap-1.5">
              {Object.entries(fonts).map(([name, n]) => (
                <span key={name} className={cn('rounded border px-1.5 py-0.5 font-mono text-[12px]', name === e.font ? 'border-finding-line bg-finding-bg text-finding' : 'border-line bg-subtle text-ink-2')}>
                  {name} <span className="text-ink-3">{n}</span>
                </span>
              ))}
            </span>
          </Row>
        </dl>
      )
    }
    case 'MODIFIED_AFTER_SIGNING':
    case 'SIGNATURE_BROKEN':
      return (
        <dl>
          <Row label="Signed by">{str(e.signer)}</Row>
          <Row label="Signed at">{str(e.signed_at)}</Row>
          <Row label="Signature">{e.intact ? 'Cryptographically intact' : 'Broken'}{e.trusted ? ', chains to a trusted root' : ', not trusted'}</Row>
          <Row label="Covers">{humanise(str(e.coverage))}</Row>
          <Row label="Later changes" emphasis="finding">{e.modification_level === 'OTHER' ? 'Content changes after the signed revision' : humanise(str(e.modification_level))}</Row>
        </dl>
      )
    case 'EXPIRED_AT_BID_DATE': {
      const until = pins.find(p => p.field === 'valid_until')?.value ?? pins[0]?.value
      return (
        <dl>
          <Row label="Required">Valid on the bid submission date</Row>
          <Row label="Document value" emphasis="finding">{until ? formatDate(until) : 'See document'}</Row>
          <Row label="Bid submitted">{ctx.bid?.submitted_at ? formatDateTime(ctx.bid.submitted_at) : 'Not recorded'}</Row>
          <Row label="Result">{f.detail}</Row>
        </dl>
      )
    }
    case 'NAME_LOOKALIKE':
    case 'NAME_MISMATCH': {
      const pin = pins[0]
      return (
        <dl>
          <Row label="Registered entity">{ctx.bidder?.legal_name ?? ctx.bidder?.company_name ?? 'Not recorded'}</Row>
          <Row label={pin ? `On ${categoryLabel(pin.category)}` : 'On document'} emphasis="finding">{pin?.value ?? 'See detail'}</Row>
          <Row label="Result">{f.detail}</Row>
        </dl>
      )
    }
    case 'TIMESTAMP_INVERSION':
      return (
        <dl>
          <Row label="Created">{str(e.created)}</Row>
          <Row label="Modified" emphasis="finding">{str(e.modified)}</Row>
        </dl>
      )
    case 'EDITOR_TOOL':
      return <dl><Row label="Written by" emphasis="finding">{(e.writers as string[] | undefined)?.join(', ')}</Row></dl>
    case 'INCREMENTAL_UPDATES':
      return <dl><Row label="Revisions in file">{str(e.revisions)} (the original plus {Number(e.revisions) - 1} appended)</Row></dl>
    case 'REQUIREMENT_NOT_MET': {
      const req = ctx.requirements?.find(r => r.id === e.requirement_id)
      return (
        <dl>
          <Row label="Tender requirement">{req ? `${req.description}${req.is_mandatory ? ' (mandatory)' : ''}` : 'See tender requirements'}</Row>
          <Row label="Result" emphasis="finding">{f.detail}</Row>
        </dl>
      )
    }
    case 'LINKED_BIDDER_RING':
    case 'POSSIBLE_COVER_BID':
      return (
        <dl>
          <Row label="Observation">{f.detail}</Row>
          <Row label="Status">A lead for review. Links do not by themselves prove collusion.</Row>
        </dl>
      )
    default: {
      const entries = Object.entries(e).filter(([k, v]) => k !== 'pins' && k !== 'score_impact' && v != null && typeof v !== 'object')
      if (!entries.length) return null
      return <dl>{entries.map(([k, v]) => <Row key={k} label={humanise(k)}>{str(v)}</Row>)}</dl>
    }
  }
}

export function RuleRecord({ finding }: { finding: Finding }) {
  const { reviewed, precision } = finding.reliability ?? { reviewed: 0, precision: 0.5 }
  if (!reviewed) return <span>No officer rulings recorded yet for this rule</span>
  return <span>Officers upheld this rule {Math.round(precision * 100)}% of the time across {reviewed} ruling{reviewed === 1 ? '' : 's'}</span>
}

export function DispositionControl({ caseId, finding, disabled, onChanged }: {
  caseId: string; finding: Finding; disabled?: boolean; onChanged?: () => void
}) {
  const [mode, setMode] = useState<'idle' | 'dismiss' | 'uphold'>('idle')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<'UPHELD' | 'DISMISSED' | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [editing, setEditing] = useState(false)
  const d = finding.disposition

  async function rule(outcome: 'UPHELD' | 'DISMISSED') {
    if (outcome === 'DISMISSED' && note.trim().length < 10) {
      setError(toApiError(new Error('A dismissal needs a reason of at least 10 characters.')))
      return
    }
    setBusy(outcome)
    setError(null)
    try {
      await cases.dispose(caseId, finding.id, outcome, note.trim())
      invalidate(`case:${caseId}`)
      invalidate('board:')
      invalidate('audit')
      invalidate('details:')
      invalidate('timeline:')
      setMode('idle')
      setEditing(false)
      setNote('')
      onChanged?.()
    } catch (e) {
      setError(toApiError(e))
    } finally {
      setBusy(null)
    }
  }

  if (d && !editing) {
    return (
      <div className={cn('flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2', d.outcome === 'UPHELD' ? 'border-finding-line bg-finding-bg/60' : 'border-line bg-subtle')}>
        <div className="min-w-0 text-[12.5px]">
          <span className="font-semibold text-ink">{d.outcome === 'UPHELD' ? 'Upheld by officer' : 'Dismissed by officer'}</span>
          <span className="text-ink-3"> on {formatDateTime(d.at)}</span>
          {d.note && <p className="mt-0.5 text-ink-2">{d.note}</p>}
        </div>
        {!disabled && (
          <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink">
            <RotateCcw className="size-3" aria-hidden /> Change ruling
          </button>
        )}
      </div>
    )
  }
  if (disabled) return null

  return (
    <div className="space-y-2">
      {mode === 'idle' ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[12px] font-medium text-ink-3">Officer ruling</span>
          <Button size="sm" variant="secondary" icon={<Check className="size-3.5" aria-hidden />} onClick={() => setMode('uphold')}>Uphold finding</Button>
          <Button size="sm" variant="ghost" icon={<X className="size-3.5" aria-hidden />} onClick={() => setMode('dismiss')}>Dismiss with reason</Button>
          {editing && <button className="text-[12px] text-ink-3 hover:text-ink" onClick={() => setEditing(false)}>Keep current ruling</button>}
        </div>
      ) : (
        <div className="rounded-md border border-line-strong bg-subtle p-3 animate-fade-in">
          <label htmlFor={`note-${finding.id}`} className="block text-[12.5px] font-medium text-ink-2">
            {mode === 'dismiss' ? 'Reason for dismissal (required, at least 10 characters)' : 'Note for the record (optional)'}
          </label>
          <Textarea id={`note-${finding.id}`} value={note} onChange={ev => setNote(ev.target.value)} className="mt-1.5 min-h-[64px] bg-surface"
            placeholder={mode === 'dismiss' ? 'For example: original certificate verified with the issuer by phone on 29 Sep.' : 'For example: original date confirmed as 15/08/2026 with the OEM.'} autoFocus />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className={cn('text-[12px] tnum', mode === 'dismiss' && note.trim().length < 10 ? 'text-ink-4' : 'text-ink-3')}>
              {mode === 'dismiss' ? `${note.trim().length} / 10 characters minimum` : 'Recorded in the audit trail'}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => { setMode('idle'); setError(null) }}>Cancel</Button>
              {mode === 'uphold'
                ? <Button size="sm" variant="primary" busy={busy === 'UPHELD'} onClick={() => rule('UPHELD')}>Record: upheld</Button>
                : <Button size="sm" variant="primary" busy={busy === 'DISMISSED'} disabled={note.trim().length < 10} onClick={() => rule('DISMISSED')}>Record: dismissed</Button>}
            </div>
          </div>
        </div>
      )}
      {error && <p className="text-[12.5px] text-finding" role="alert">{error.kind === 'unavailable' ? 'Verification service unavailable. The ruling was not recorded.' : error.message}</p>}
    </div>
  )
}

export function FindingCard({ finding: f, caseId, ctx, canRule, onOpenEvidence, onOpenConnections, defaultOpen, highlighted }: {
  finding: Finding
  caseId: string
  ctx: FindingContext
  canRule: boolean
  onOpenEvidence?: (f: Finding) => void
  onOpenConnections?: () => void
  defaultOpen?: boolean
  highlighted?: boolean
}) {
  const [open, setOpen] = useState(!!defaultOpen)
  const docId = findingDocumentId(f)
  const pins = findingPins(f)
  const docName = f.filename ?? (docId ? ctx.documentNames?.[docId] : undefined)
  const needsRuling = f.severity === 'HIGH' && !f.disposition
  return (
    <article id={`finding-${f.id}`} className={cn(
      'card overflow-hidden transition-shadow',
      highlighted && 'ring-2 ring-navy-600/40',
      f.severity === 'HIGH' && 'border-l-[3px] border-l-finding',
      f.severity === 'MEDIUM' && 'border-l-[3px] border-l-review',
    )}>
      <button className="flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-subtle/60" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <SeverityTag severity={f.severity} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-[15px] font-semibold tracking-tight text-ink">{findingTitle(f.code, f.title)}</h3>
            {needsRuling && <StatusPill kind="pending" size="sm" label="Needs ruling" />}
            {f.disposition && <StatusPill kind={f.disposition.outcome === 'UPHELD' ? 'finding' : 'not_required'} size="sm" label={f.disposition.outcome === 'UPHELD' ? 'Upheld' : 'Dismissed'} />}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-3">
            <span>{SOURCE_LABEL[f.source] ?? f.source}</span>
            {(docName || f.category) && (
              <span className="inline-flex items-center gap-1"><FileText className="size-3.5" aria-hidden />{docName ?? categoryLabel(f.category)}{f.page ? `, page ${f.page}` : ''}</span>
            )}
          </p>
        </div>
        <ChevronDown className={cn('mt-1 size-4 shrink-0 text-ink-4 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div className="space-y-3 border-t border-line bg-subtle/50 px-4 py-4 animate-fade-in">
          <p className="text-[14px] leading-relaxed text-ink-2">{f.detail}</p>
          <EvidenceFacts finding={f} ctx={ctx} />
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            {pins.length > 0 && onOpenEvidence && (
              <Button size="sm" variant="secondary" icon={<MapPin className="size-3.5" aria-hidden />} onClick={() => onOpenEvidence(f)}>
                Show on page {pins[0].page}
              </Button>
            )}
            {!pins.length && docId && onOpenEvidence && (
              <Button size="sm" variant="secondary" icon={<FileText className="size-3.5" aria-hidden />} onClick={() => onOpenEvidence(f)}>
                Open document
              </Button>
            )}
            {f.source === 'CARTEL' && onOpenConnections && (
              <Button size="sm" variant="secondary" icon={<Network className="size-3.5" aria-hidden />} onClick={onOpenConnections}>
                Open connections
              </Button>
            )}
            {!pins.length && docId && <span className="text-[12px] text-ink-3">This is a file-level signal, so it has no position on the page.</span>}
            <span className="ml-auto text-[12px] text-ink-4"><Mono className="mr-2 text-[12px]">{f.code}</Mono><RuleRecord finding={f} /></span>
          </div>
          <DispositionControl caseId={caseId} finding={f} disabled={!canRule} />
        </div>
      )}
    </article>
  )
}

// Observed versus expected, in one line each, for the forensic inspector.
export function findingValues(f: Finding, ctx: FindingContext): { observed: string; expected: string } {
  const e = f.evidence ?? {}
  const pins = f.evidence?.pins ?? []
  switch (f.code) {
    case 'OVERLAPPING_TEXT':
      return { observed: str(e.visible_text), expected: `${str(e.covered_text)} (recovered from beneath)` }
    case 'FIELD_FONT_OUTLIER': {
      const others = Object.keys((e.document_fonts ?? {}) as Record<string, number>).filter(n => n !== e.font)
      const value = pins[0]?.value ?? f.detail.match(/value '([^']+)'/)?.[1]
      return { observed: value ? `${value} (in ${str(e.font)})` : `Font ${str(e.font)}`, expected: others.length ? `Fonts used elsewhere: ${others.join(', ')}` : 'Same font as the rest of the document' }
    }
    case 'MODIFIED_AFTER_SIGNING':
    case 'SIGNATURE_BROKEN':
      return { observed: e.modification_level === 'OTHER' ? 'Content changed after the signed revision' : humanise(str(e.modification_level) || 'Signature broken'), expected: 'No change after digital signing' }
    case 'EXPIRED_AT_BID_DATE': {
      const until = pins.find(p => p.field === 'valid_until')?.value ?? pins[0]?.value
      return { observed: until ? `Valid until ${formatDate(until)}` : 'Expiry date on document', expected: `Valid on bid date${ctx.bid?.submitted_at ? ` (${formatDate(ctx.bid.submitted_at)})` : ''}` }
    }
    case 'NAME_LOOKALIKE':
    case 'NAME_MISMATCH':
      return { observed: pins[0]?.value ?? 'Name on document', expected: ctx.bidder?.legal_name ?? ctx.bidder?.company_name ?? 'Registered entity name' }
    case 'TIMESTAMP_INVERSION':
      return { observed: `Modified ${str(e.modified)}`, expected: `After creation (${str(e.created)})` }
    case 'EDITOR_TOOL':
      return { observed: `Written by ${(e.writers as string[] | undefined)?.join(', ') ?? 'an editing tool'}`, expected: 'Issued directly by the issuing system' }
    case 'INCREMENTAL_UPDATES':
      return { observed: `${str(e.revisions)} saved revisions`, expected: 'Single revision as issued' }
    default:
      return { observed: f.detail, expected: 'See rule description' }
  }
}

// One plain sentence for a finding. The forensic wording stays in the viewer and the finding card.
export function plainExplanation(f: Finding): string {
  const field = f.title.match(/^'([^']+)'/)?.[1]
  switch (f.code) {
    case 'FIELD_FONT_OUTLIER': return `${field ? field.charAt(0).toUpperCase() + field.slice(1) : 'This value'} uses a font not found elsewhere in the document.`
    case 'OVERLAPPING_TEXT': return 'A value is printed over an earlier value that is still in the file.'
    case 'MODIFIED_AFTER_SIGNING': return 'The document was changed after it was digitally signed.'
    case 'SIGNATURE_BROKEN': return 'The digital signature no longer matches the document.'
    case 'INCREMENTAL_UPDATES': return 'The file was edited after it was first created.'
    case 'EDITOR_TOOL': return 'The file was last saved by an editing tool, not the issuing system.'
    case 'TIMESTAMP_INVERSION': return 'The file says it was modified before it was created.'
    case 'EXPIRED_AT_BID_DATE': return 'The document had expired by the bid submission date.'
    default: return f.detail
  }
}
