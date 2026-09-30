import { useMemo, useState } from 'react'
import { ArrowUpRight, Search } from 'lucide-react'
import { cn } from '@/app/lib/cn'
import { formatINR } from '@/app/lib/format'
import { categoryLabel, findingTitle, REQUIREMENT_SHORT } from '@/app/lib/labels'
import {
  bidStatus, decisionStatus, forensicsCell, linksCell, requirementCell, type RequirementCell,
} from '@/app/lib/bidmarkStatus'
import type { Finding, Requirement } from '@/app/services/bidmark'
import { SeverityTag, StatusPill, type StatusKind } from '@/app/components/bidmark/Status'
import { Button, Drawer, Input, Mono, Select, Tooltip } from '@/app/components/ui/primitives'
import { EmptyState } from '@/app/components/ui/states'
import { valueOf, type Board, type BoardRow } from '@/app/features/case/data'

type Filter = 'all' | 'high' | 'review' | 'clear' | 'decided'
type Sort = 'priority' | 'name' | 'price' | 'findings'

interface CellInfo {
  title: string
  bidder: string
  caseId: string
  kind: StatusKind
  label: string
  requirement?: Requirement
  cell?: RequirementCell
  findings: Finding[]
  note?: string
  tab: string
}

export function ComparisonMatrix({ board, onOpenCase }: { board: Board; onOpenCase: (caseId: string, tab?: string, finding?: string) => void }) {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('priority')
  const [cell, setCell] = useState<CellInfo | null>(null)
  const reqs = board.requirements

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let list = board.rows.filter(r => !needle || r.queue.bidder_name.toLowerCase().includes(needle) || (valueOf(r.bidder)?.gstin ?? '').toLowerCase().includes(needle))
    list = list.filter(r => {
      const c = r.queue.counts
      if (filter === 'high') return c.HIGH > 0
      if (filter === 'review') return c.HIGH === 0 && c.MEDIUM > 0
      if (filter === 'clear') return c.HIGH === 0 && c.MEDIUM === 0
      if (filter === 'decided') return !!r.queue.decision
      return true
    })
    const price = (r: BoardRow) => valueOf(r.bid)?.quoted_price ?? Number.MAX_VALUE
    return [...list].sort((a, b) => {
      if (sort === 'name') return a.queue.bidder_name.localeCompare(b.queue.bidder_name)
      if (sort === 'price') return price(a) - price(b)
      if (sort === 'findings') return (b.queue.counts.HIGH * 10 + b.queue.counts.MEDIUM) - (a.queue.counts.HIGH * 10 + a.queue.counts.MEDIUM)
      return b.queue.priority - a.queue.priority
    })
  }, [board.rows, q, filter, sort])

  const counts = {
    all: board.rows.length,
    high: board.rows.filter(r => r.queue.counts.HIGH > 0).length,
    review: board.rows.filter(r => r.queue.counts.HIGH === 0 && r.queue.counts.MEDIUM > 0).length,
    clear: board.rows.filter(r => r.queue.counts.HIGH === 0 && r.queue.counts.MEDIUM === 0).length,
    decided: board.rows.filter(r => r.queue.decision).length,
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-4" aria-hidden />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search bidder or GSTIN" className="h-9 pl-9" aria-label="Search bidders" />
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-0.5" role="group" aria-label="Filter bidders">
          {([
            ['all', 'All'], ['high', 'High findings'], ['review', 'Needs review'], ['clear', 'No findings'], ['decided', 'Decided'],
          ] as [Filter, string][]).map(([id, label]) => (
            <button key={id} onClick={() => setFilter(id)} aria-pressed={filter === id}
              className={cn('h-8 rounded-md px-2.5 text-[12.5px] font-medium transition-colors', filter === id ? 'bg-navy text-white' : 'text-ink-2 hover:bg-sunken')}>
              {label} <span className={cn('tnum ml-0.5', filter === id ? 'text-white/70' : 'text-ink-4')}>{counts[id]}</span>
            </button>
          ))}
        </div>
        <Select value={sort} onChange={e => setSort(e.target.value as Sort)} className="h-9 w-auto sm:ml-auto" aria-label="Sort bidders">
          <option value="priority">Sort: review priority</option>
          <option value="findings">Sort: most findings</option>
          <option value="price">Sort: lowest price</option>
          <option value="name">Sort: bidder name</option>
        </Select>
      </div>

      <div className="card overflow-hidden">
        <div className="max-h-[70vh] overflow-auto scroll-thin">
          <table className="w-full border-separate border-spacing-0 text-[13px]">
            <caption className="sr-only">Technical evaluation of every bid against each tender requirement and Bidmark screening</caption>
            <thead>
              <tr className="text-left text-[12px] uppercase tracking-[0.05em] text-ink-3">
                <th scope="col" className="sticky left-0 top-0 z-20 min-w-[200px] border-b border-r border-line bg-subtle px-4 py-2.5 font-medium">Bidder</th>
                {reqs.map(r => (
                  <th key={r.id} scope="col" className="sticky top-0 z-10 border-b border-line bg-subtle px-1.5 py-2.5 font-medium">
                    <Tooltip side="bottom" label={`${r.description}${r.is_mandatory ? '. Mandatory.' : '. Optional.'}`}>
                      <span tabIndex={0} className="whitespace-nowrap">{REQUIREMENT_SHORT[r.requirement_type] ?? r.requirement_type}{r.is_mandatory && <span className="text-finding" aria-label="mandatory">*</span>}</span>
                    </Tooltip>
                  </th>
                ))}
                <th scope="col" className="sticky top-0 z-10 border-b border-l border-line bg-navy-50 px-2 py-2.5 font-medium text-navy-600">Forensics</th>
                <th scope="col" className="sticky top-0 z-10 border-b border-line bg-navy-50 px-2 py-2.5 font-medium text-navy-600">Links</th>
                <th scope="col" className="sticky top-0 z-10 border-b border-l border-line bg-subtle px-3 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const detail = valueOf(r.detail)
                const findings = detail?.findings ?? []
                const docs = valueOf(r.documents) ?? []
                const evaluation = r.evaluation ? valueOf(r.evaluation) : null
                const evalFailed = r.evaluation && !r.evaluation.ok
                const bid = valueOf(r.bid)
                const overall = bidStatus(r.queue)
                const decision = decisionStatus(r.queue.decision)
                const fc = forensicsCell(findings)
                const lc = linksCell(findings, r.queue.in_ring)
                const name = r.queue.bidder_name
                return (
                  <tr key={r.queue.case_id} className="group">
                    <th scope="row" className="sticky left-0 z-10 border-b border-r border-line bg-surface px-4 py-2.5 text-left font-normal group-hover:bg-subtle">
                      <button onClick={() => onOpenCase(r.queue.case_id)} className="group/n block max-w-[210px] text-left">
                        <span className="flex items-center gap-1 text-[13px] font-semibold text-ink group-hover/n:text-navy-600 group-hover/n:underline underline-offset-2">
                          <span className="truncate">{name}</span><ArrowUpRight className="size-3 shrink-0 opacity-0 group-hover/n:opacity-100" aria-hidden />
                        </span>
                        <span className="block text-[12px] text-ink-3"><Mono className="text-[12px]">{valueOf(r.bidder)?.gstin ?? 'GSTIN not recorded'}</Mono>{bid && <span className="tnum"> · {formatINR(bid.quoted_price)}</span>}</span>
                      </button>
                    </th>
                    {reqs.map(req => {
                      if (evalFailed || !detail) {
                        return <td key={req.id} className="border-b border-line px-1.5 py-2.5 group-hover:bg-subtle"><StatusPill size="sm" kind="unavailable" label="Unavailable" title="Could not load this check" /></td>
                      }
                      const rc = requirementCell(req, evaluation, findings, docs, reqs)
                      return (
                        <td key={req.id} className="border-b border-line px-1.5 py-2.5 group-hover:bg-subtle">
                          <button className="rounded-full" onClick={() => setCell({
                            title: categoryLabel(req.requirement_type), bidder: name, caseId: r.queue.case_id, kind: rc.kind, label: rc.label,
                            requirement: req, cell: rc, findings: rc.findings, tab: 'registry',
                          })} aria-label={`${name}, ${req.requirement_type}: ${rc.label}`}>
                            <StatusPill size="sm" kind={rc.kind} label={rc.label} className="cursor-pointer hover:brightness-95" />
                          </button>
                        </td>
                      )
                    })}
                    <td className="border-b border-l border-line bg-navy-50/30 px-2 py-2.5 group-hover:bg-subtle">
                      <button onClick={() => setCell({ title: 'Document forensics', bidder: name, caseId: r.queue.case_id, kind: fc.kind, label: fc.label, findings: fc.findings, tab: 'documents',
                        note: 'Every uploaded file is inspected for retyped values, edits after signing, one-off fonts, editor re-saves and reuse.' })}
                        aria-label={`${name}, forensics: ${fc.label}`}>
                        <StatusPill size="sm" kind={fc.kind} label={fc.label} className="cursor-pointer" />
                      </button>
                    </td>
                    <td className="border-b border-line bg-navy-50/30 px-2 py-2.5 group-hover:bg-subtle">
                      <button onClick={() => setCell({ title: 'Linked-party analysis', bidder: name, caseId: r.queue.case_id, kind: lc.kind, label: lc.label, findings: lc.findings, tab: 'connections',
                        note: 'Compared with every other bidder on this tender: device, network, directors, phone, email, address, PDF authors, identical files and submission timing.' })}
                        aria-label={`${name}, links: ${lc.label}`}>
                        <StatusPill size="sm" kind={lc.kind} label={lc.label} className="cursor-pointer" />
                      </button>
                    </td>
                    <td className="whitespace-nowrap border-b border-l border-line px-3 py-2 group-hover:bg-subtle">
                      {decision ? <StatusPill size="sm" kind={decision.kind} label={decision.label} title="Recorded by the procurement officer" />
                        : <StatusPill size="sm" kind={overall.kind} label={overall.label.replace(/^(\d+ high) findings?$/, '$1')} title={overall.note} />}
                      <span className="mt-0.5 block text-[12px] text-ink-3">
                        {decision ? 'Officer decision' : r.queue.stage === 'CLARIFICATION_REQUESTED' ? 'Awaiting bidder' : detail?.undisposed_high.length ? `Locked, ${detail.undisposed_high.length} to rule` : 'Decision pending'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {rows.length === 0 && <EmptyState title="No bidders match" body="Clear the search or choose another filter." />}
        </div>
      </div>

      <MatrixLegend />

      <Drawer open={!!cell} onClose={() => setCell(null)} title={cell ? `${cell.title}` : ''} subtitle={cell?.bidder}
        footer={cell && (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCell(null)}>Close</Button>
            <Button variant="primary" onClick={() => onOpenCase(cell.caseId, cell.findings[0] && cell.tab !== 'registry' ? cell.tab : cell.findings[0] ? 'findings' : cell.tab, cell.findings[0]?.id)}>Open in case</Button>
          </div>
        )}>
        {cell && <CellDetail cell={cell} onOpenFinding={f => onOpenCase(cell.caseId, 'findings', f.id)} />}
      </Drawer>
    </div>
  )
}

function CellDetail({ cell, onOpenFinding }: { cell: CellInfo; onOpenFinding: (f: Finding) => void }) {
  const ev = cell.cell?.evaluation
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2"><StatusPill kind={cell.kind} label={cell.label} /></div>
      {cell.requirement && (
        <section>
          <p className="eyebrow mb-1.5">Tender requirement</p>
          <p className="text-[13.5px] text-ink">{cell.requirement.description}</p>
          <p className="mt-0.5 text-[12px] text-ink-3">{cell.requirement.is_mandatory ? 'Mandatory' : 'Optional'}. Evidence expected: {categoryLabel(cell.requirement.evidence_type)}.</p>
        </section>
      )}
      {cell.requirement && (
        <section>
          <p className="eyebrow mb-1.5">Requirement check</p>
          {ev ? (
            <div className="rounded-lg border border-line bg-subtle px-3 py-2.5 text-[13px]">
              <p className="text-ink">{ev.explanation}</p>
              {ev.evidence.filter(Boolean).map((e, i) => <p key={i} className="mt-1 text-[12px] text-ink-3">{e.replace('MOCK_GOVERNMENT_API (mock)', 'sandbox registry')}</p>)}
            </div>
          ) : <p className="text-[13px] text-ink-3">No evaluation on record for this requirement.</p>}
          {cell.cell && cell.cell.documents.length > 0 && (
            <ul className="mt-2 space-y-1 text-[12.5px]">
              {cell.cell.documents.map(d => <li key={d.id} className="flex items-center justify-between gap-2"><Mono className="truncate text-[12px]">{d.original_filename}</Mono><span className="text-ink-3">{d.status.toLowerCase().replace('_', ' ')}</span></li>)}
            </ul>
          )}
        </section>
      )}
      {cell.note && <p className="text-[13px] text-ink-2">{cell.note}</p>}
      <section>
        <p className="eyebrow mb-1.5">Findings behind this cell ({cell.findings.length})</p>
        {cell.findings.length ? (
          <ul className="space-y-2">
            {cell.findings.map(f => (
              <li key={f.id}>
                <button onClick={() => onOpenFinding(f)} className="w-full rounded-lg border border-line px-3 py-2.5 text-left transition-colors hover:border-navy-600 hover:bg-subtle">
                  <span className="flex items-center gap-2"><SeverityTag severity={f.severity} /><span className="text-[13px] font-semibold">{findingTitle(f.code, f.title)}</span></span>
                  <span className="mt-1 block text-[12.5px] leading-relaxed text-ink-2">{f.detail}</span>
                  {f.disposition && <span className="mt-1 block text-[12px] text-ink-3">{f.disposition.outcome === 'UPHELD' ? 'Upheld' : 'Dismissed'} by officer</span>}
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="text-[13px] text-ink-3">No findings raised for this check.</p>}
      </section>
      {cell.kind === 'met' && cell.findings.length === 0 && (
        <p className="rounded-md border border-dashed border-line-strong px-3 py-2 text-[12px] text-ink-3">Met means the requirement check passed on the documents read. It does not certify the bidder; the officer decides.</p>
      )}
    </div>
  )
}

function MatrixLegend() {
  const items: [StatusKind, string, string][] = [
    ['met', 'Met', 'Requirement satisfied on the evidence read'],
    ['finding', 'Finding', 'High finding on the related evidence'],
    ['review', 'Review', 'Medium finding or needs manual review'],
    ['not_met', 'Not met', 'Requirement failed'],
    ['not_submitted', 'Missing', 'Mandatory document not submitted'],
    ['not_required', 'Optional', 'Optional and not submitted'],
    ['unchecked', 'Not checked', 'Check could not run; never a pass'],
    ['unavailable', 'Unavailable', 'Service did not respond'],
  ]
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-1 text-[12px] text-ink-3">
      {items.map(([k, l, d]) => (
        <span key={k} className="inline-flex items-center gap-1.5"><StatusPill size="sm" kind={k} label={l} /> {d}</span>
      ))}
      <span className="inline-flex items-center gap-1"><span className="text-finding">*</span> Mandatory requirement</span>
    </div>
  )
}
