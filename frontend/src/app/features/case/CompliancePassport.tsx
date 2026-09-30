import { Fragment, useState, type ReactNode } from 'react'
import { ChevronDown, FlaskConical } from 'lucide-react'
import { cn } from '@/app/lib/cn'
import { formatDate, formatDateTime, humanise } from '@/app/lib/format'
import { categoryLabel, findingTitle, RECOMMENDATION_LABEL } from '@/app/lib/labels'
import { findingDocumentId, findingPins, sortFindings } from '@/app/lib/bidmarkStatus'
import { passportRows, passportSummary, RESULT_KIND, type PassportRow } from '@/app/lib/passport'
import type { Resource } from '@/app/lib/useResource'
import type { Bidder, BidderEvaluation, CaseDetail, DocumentRecord, Finding, Requirement } from '@/app/services/bidmark'
import { riskBasis } from '@/app/features/officer/data'
import { SeverityTag, StatusPill } from '@/app/components/bidmark/Status'
import { Drawer, Mono, SkeletonRows } from '@/app/components/ui/primitives'
import { ErrorState } from '@/app/components/ui/states'

// Compliance: which requirements did this bidder pass or fail?
export function CompliancePassport({ c, evaluation, documents, requirements, bidder, onOpenFinding, sourceRecords }: {
  sourceRecords?: ReactNode
  c: CaseDetail
  evaluation: Resource<BidderEvaluation>
  documents: DocumentRecord[]
  requirements: Requirement[]
  bidder: Bidder | null
  onOpenFinding: (f: Finding) => void
}) {
  const [open, setOpen] = useState<PassportRow | null>(null)
  const [showAll, setShowAll] = useState(false)
  if (evaluation.error) return <ErrorState error={evaluation.error} onRetry={evaluation.reload} what="the compliance verification" />
  if (!evaluation.data) return <SkeletonRows rows={8} />
  const rows = passportRows({ c, evaluation: evaluation.data, documents, requirements, bidder })
  const s = passportSummary(rows)
  const quiet = (r: PassportRow) => r.result === 'Not applicable' || r.result === 'Unavailable'
  const hidden = rows.filter(quiet).length
  const visible = showAll ? rows : rows.filter(r => !quiet(r))
  const groups = [...new Set(visible.map(r => r.group))]

  return (
    <div className="space-y-5">

      <dl className="grid grid-cols-2 divide-x divide-y divide-line rounded-lg border border-line bg-surface sm:grid-cols-4 sm:divide-y-0">
        {([['Verified', s.verified, 'verified'], ['Review required', s.review, 'review'], ['Non-compliant', s.nonCompliant, 'not_met'], ['Pending', s.pending, 'pending']] as const).map(([label, n, kind]) => (
          <div key={label} className="flex items-center justify-between px-4 py-3">
            <dt className="text-[14px] text-ink-2">{label}</dt>
            <dd><StatusPill kind={kind} label={String(n)} /></dd>
          </div>
        ))}
      </dl>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>Requirement</th><th>Result</th><th>Source</th><th>Last checked</th><th aria-label="Action" /></tr></thead>
            <tbody>
              {groups.map(g => (
                <Fragment key={g}>
                  <tr><td colSpan={5} className="bg-subtle py-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">{g}</td></tr>
                  {visible.filter(r => r.group === g).map(r => (
                    <tr key={r.key} className="row-link" onClick={() => setOpen(r)}>
                      <td className="font-medium text-ink">{r.label}</td>
                      <td><StatusPill kind={RESULT_KIND[r.result]} label={r.result} size="sm" /></td>
                      <td className="text-ink-2">{r.source}</td>
                      <td className="whitespace-nowrap">{r.checked ? formatDate(r.checked) : '-'}</td>
                      <td className="text-right">
                        <button onClick={e => { e.stopPropagation(); setOpen(r) }} className="text-[14px] text-navy-600 hover:underline">
                          {r.result === 'Review required' || r.result === 'Non-compliant' ? 'Review' : r.result === 'Not applicable' || r.result === 'Unavailable' ? 'Details' : 'View'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {hidden > 0 && (
          <button onClick={() => setShowAll(v => !v)} aria-expanded={showAll} className="flex w-full items-center gap-1.5 border-t border-line px-5 py-3 text-left text-[14px] text-navy-600 hover:bg-subtle">
            <ChevronDown className={cn('size-4 transition-transform', showAll && 'rotate-180')} aria-hidden />
            {showAll ? 'Hide checks not required or not connected' : `Show ${hidden} checks not required by this tender or not connected`}
          </button>
        )}
        {rows.some(r => r.sandbox) && (
          <p className="flex items-start gap-2 border-t border-line bg-subtle px-5 py-2.5 text-[12.5px] text-ink-3">
            <FlaskConical className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Results marked sandbox come from the sandbox registry held by the verification service, not a live government registry.
          </p>
        )}
      </section>

      {sourceRecords && <SourceRecords>{sourceRecords}</SourceRecords>}

      {open && <CheckDrawer row={open} onClose={() => setOpen(null)} onOpenFinding={f => { setOpen(null); onOpenFinding(f) }} />}
    </div>
  )
}

// Why the assessment says what it says: the strongest findings, then the basis for the risk level.
export function WhyDetails({ c }: { c: CaseDetail }) {
  const top = sortFindings(c.findings.filter(f => (f.severity === 'HIGH' || f.severity === 'MEDIUM') && f.disposition?.outcome !== 'DISMISSED')).slice(0, 5)
  return (
    <div className="space-y-5 text-[14px]">
      <div>
        <p className="eyebrow mb-2">Strongest contributing findings</p>
        {top.length ? (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {top.map(f => (
              <li key={f.id} className="flex items-center gap-2.5 px-3 py-2.5">
                <SeverityTag severity={f.severity} />
                <span className="min-w-0 flex-1">{findingTitle(f.code, f.title)}</span>
                {f.category && <span className="shrink-0 text-[12.5px] text-ink-3">{categoryLabel(f.category)}</span>}
              </li>
            ))}
          </ul>
        ) : <p className="text-ink-2">No findings raised. The assessment reflects the tender requirements that were verified.</p>}
      </div>
      <div>
        <p className="eyebrow mb-1">Risk basis</p>
        <p className="text-ink-2">{riskBasis(c.lane, c.summary.compliance_risk) || 'Not recorded'}.</p>
      </div>
      {c.ai_recommendation && (
        <div>
          <p className="eyebrow mb-1">Recommendation</p>
          <p className="text-ink-2">{RECOMMENDATION_LABEL[c.ai_recommendation]}. Final qualification remains with the Procurement Officer.</p>
        </div>
      )}
    </div>
  )
}

function registryValue(row: PassportRow): ReactNode {
  const d = row.registry?.details ?? {}
  const parts: [string, unknown][] = [
    ['Status', d.registration_status ?? d.company_status ?? d.status],
    ['Entity name', d.legal_name ?? d.company_name ?? d.name],
    ['Directors', Array.isArray(d.directors) ? (d.directors as string[]).join(', ') : undefined],
  ]
  const shown = parts.filter(([, v]) => v != null && v !== '')
  if (!row.registry) return 'No registry response on record'
  if (!shown.length) return humanise(row.registry.status)
  return <dl className="space-y-0.5">{shown.map(([k, v]) => <div key={k} className="flex gap-2"><dt className="text-ink-3">{k}</dt><dd>{String(v)}</dd></div>)}</dl>
}

function CheckDrawer({ row, onClose, onOpenFinding }: { row: PassportRow; onClose: () => void; onOpenFinding: (f: Finding) => void }) {
  const items: [string, ReactNode][] = [
    ['Submitted value', row.submitted ? <Mono className="text-[13.5px]">{row.submitted}</Mono> : 'Not submitted'],
    ['Registry value', registryValue(row)],
    ['Result', <StatusPill key="r" kind={RESULT_KIND[row.result]} label={row.result} />],
    ['Reason', row.reason || 'Not recorded'],
    ['Source', <span key="s">{row.source}{row.registry?.reference_id && <span className="block text-[12.5px] text-ink-3">Reference {row.registry.reference_id}</span>}</span>],
    ['Checked', row.checked ? formatDateTime(row.checked) : 'Not checked'],
  ]
  return (
    <Drawer open onClose={onClose} title={row.label} subtitle={row.group}>
      <dl className="divide-y divide-line">
        {items.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[130px_minmax(0,1fr)] gap-3 py-2.5 text-[14px]">
            <dt className="text-ink-3">{k}</dt><dd className="min-w-0 break-words text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      {(row.documents.length > 0 || row.findings.length > 0) && (
        <div className="mt-5">
          <p className="eyebrow mb-2">Evidence</p>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {row.findings.map(f => (
              <li key={f.id} className="flex items-center gap-2.5 px-3 py-2.5">
                <SeverityTag severity={f.severity} />
                <span className="min-w-0 flex-1 text-[14px]">{findingTitle(f.code, f.title)}</span>
                {(findingPins(f).length > 0 || findingDocumentId(f)) && <button onClick={() => onOpenFinding(f)} className="text-[13.5px] text-navy-600 hover:underline">Review evidence</button>}
              </li>
            ))}
            {row.documents.map(d => (
              <li key={d.id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-[14px]">
                <span className="min-w-0 truncate font-mono text-[13px]">{d.original_filename}</span>
                <span className="shrink-0 text-[12.5px] text-ink-3">Uploaded {formatDate(d.uploaded_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Drawer>
  )
}

function SourceRecords({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <section>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-navy-600 hover:underline">
        <ChevronDown className={cn('size-4 transition-transform duration-200', open && 'rotate-180')} aria-hidden />
        {open ? 'Hide source records' : 'Show source records (identifier checks, registry responses, cross-document checks)'}
      </button>
      {open && <div className="mt-4 animate-fade-in">{children}</div>}
    </section>
  )
}
