import { useState } from 'react'
import { FileText, Network } from 'lucide-react'
import { cn } from '@/app/lib/cn'
import { categoryLabel, findingTitle, STAGE_LABEL } from '@/app/lib/labels'
import { decisionStatus, sortFindings } from '@/app/lib/bidmarkStatus'
import { passportRows, passportSummary, RESULT_KIND, type PassportRow } from '@/app/lib/passport'
import { valueOf, type Board, type BoardRow } from '@/app/features/case/data'
import { riskKind, riskLevel } from '@/app/features/officer/data'
import { SeverityTag, StatusPill } from '@/app/components/bidmark/Status'
import { Button, Drawer } from '@/app/components/ui/primitives'
import { EmptyState } from '@/app/components/ui/states'
import { ComparisonMatrix } from './ComparisonMatrix'

type OpenCase = (caseId: string, tab?: string, finding?: string) => void

function rowPassport(board: Board, r: BoardRow): PassportRow[] | null {
  const c = valueOf(r.detail)
  const ev = r.evaluation ? valueOf(r.evaluation) : null
  if (!c || !ev) return null
  return passportRows({ c, evaluation: ev, documents: valueOf(r.documents) ?? [], requirements: board.requirements, bidder: valueOf(r.bidder) })
}

// One line per bidder. Detail opens in a drawer; the full requirement grid is one click away.
export function BidderMatrix({ board, onOpenCase }: { board: Board; onOpenCase: OpenCase }) {
  const [view, setView] = useState<'bidders' | 'requirements'>('bidders')
  const [drawer, setDrawer] = useState<{ row: BoardRow; kind: 'compliance' | 'risk' } | null>(null)
  if (!board.rows.length) return <div className="card"><EmptyState title="No bids received on this tender" /></div>

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-line bg-surface p-0.5" role="group" aria-label="View">
        {([['bidders', 'Bidder view'], ['requirements', 'Requirement view']] as const).map(([v, label]) => (
          <button key={v} onClick={() => setView(v)} aria-pressed={view === v}
            className={cn('h-8 rounded-md px-3 text-[13px] font-medium transition-colors', view === v ? 'bg-navy text-white' : 'text-ink-2 hover:bg-subtle')}>
            {label}
          </button>
        ))}
      </div>

      {view === 'requirements' ? <ComparisonMatrix board={board} onOpenCase={onOpenCase} /> : (
        <section className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Bidder</th><th>Compliance</th><th>Documents</th><th>Risk</th><th>Decision</th><th aria-label="Action" /></tr></thead>
              <tbody>
                {board.rows.map(r => {
                  const q = r.queue
                  const c = valueOf(r.detail)
                  const docs = valueOf(r.documents) ?? []
                  const pr = rowPassport(board, r)
                  const s = pr ? passportSummary(pr) : null
                  const docFindings = c?.findings.filter(f => f.source === 'DOCUMENT' && f.severity !== 'INFO') ?? []
                  const risk = riskLevel(q.lane, c?.summary.compliance_risk)
                  const d = decisionStatus(q.decision)
                  return (
                    <tr key={q.case_id}>
                      <td><span className="font-semibold text-ink">{q.bidder_name}</span><span className="meta">{STAGE_LABEL[q.stage]}</span></td>
                      <td>
                        {s ? (
                          <button onClick={() => setDrawer({ row: r, kind: 'compliance' })} className="rounded text-left transition-colors hover:text-navy-600">
                            <span className="tnum font-medium text-ink">{s.verified} / {s.applicable}</span><span className="text-ink-3"> verified</span>
                            {s.review + s.nonCompliant > 0 && <span className="meta text-review">{s.review + s.nonCompliant} need review</span>}
                          </button>
                        ) : <span className="text-ink-3">-</span>}
                      </td>
                      <td>
                        <button onClick={() => onOpenCase(q.case_id, 'documents')} className="text-left transition-colors hover:text-navy-600">
                          <span className="inline-flex items-center gap-1.5 text-ink-2"><FileText className="size-3.5 text-ink-4" aria-hidden />{docs.length} files</span>
                          {docFindings.length > 0 && <span className="meta text-finding">{docFindings.length} finding{docFindings.length === 1 ? '' : 's'}</span>}
                        </button>
                      </td>
                      <td>
                        <button onClick={() => setDrawer({ row: r, kind: 'risk' })} className="inline-flex items-center gap-2">
                          <StatusPill kind={riskKind(risk)} label={risk} size="sm" />
                          {q.in_ring && <span className="inline-flex items-center gap-1 text-[12.5px] text-finding"><Network className="size-3.5" aria-hidden />Linked</span>}
                        </button>
                      </td>
                      <td>{d ? <StatusPill kind={d.kind} label={d.label} size="sm" /> : <span className="text-ink-3">Pending</span>}</td>
                      <td className="text-right"><Button size="sm" onClick={() => onOpenCase(q.case_id)}>Open</Button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {drawer && <MatrixDrawer board={board} row={drawer.row} kind={drawer.kind} onOpenCase={onOpenCase} onClose={() => setDrawer(null)} />}
    </div>
  )
}

function MatrixDrawer({ board, row, kind, onOpenCase, onClose }: { board: Board; row: BoardRow; kind: 'compliance' | 'risk'; onOpenCase: OpenCase; onClose: () => void }) {
  const c = valueOf(row.detail)
  const q = row.queue
  if (kind === 'compliance') {
    const shown = (rowPassport(board, row) ?? []).filter(p => p.result !== 'Not applicable' && p.result !== 'Unavailable')
    return (
      <Drawer open onClose={onClose} title="Compliance checks" subtitle={q.bidder_name}
        footer={<Button variant="primary" className="w-full" onClick={() => onOpenCase(q.case_id, 'passport')}>Open compliance passport</Button>}>
        <ul className="divide-y divide-line rounded-lg border border-line">
          {shown.map(p => (
            <li key={p.key} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
              <span><span className="block text-[14px] text-ink">{p.label}</span><span className="block text-[12.5px] text-ink-3">{p.source}</span></span>
              <StatusPill kind={RESULT_KIND[p.result]} label={p.result} size="sm" />
            </li>
          ))}
        </ul>
      </Drawer>
    )
  }
  const findings = sortFindings((c?.findings ?? []).filter(f => f.severity !== 'INFO' && (f.source === 'DOCUMENT' || f.source === 'CARTEL')))
  return (
    <Drawer open onClose={onClose} title="Risk" subtitle={q.bidder_name}
      footer={
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => onOpenCase(q.case_id, 'connections')}>Relationship evidence</Button>
          <Button variant="primary" className="flex-1" onClick={() => onOpenCase(q.case_id, 'documents')}>Document evidence</Button>
        </div>
      }>
      {findings.length === 0 ? <p className="text-[14px] text-ink-3">No document or relationship findings on this bid.</p> : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {findings.map(f => (
            <li key={f.id} className="flex items-start gap-2.5 px-3.5 py-2.5">
              <SeverityTag severity={f.severity} className="mt-0.5" />
              <span><span className="block text-[14px] text-ink">{findingTitle(f.code, f.title)}</span><span className="block text-[12.5px] text-ink-3">{f.source === 'CARTEL' ? 'Linked bidder analysis' : categoryLabel(f.category)}</span></span>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  )
}
