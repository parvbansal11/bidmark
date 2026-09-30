import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowRight, Building2, CalendarClock, MapPin } from 'lucide-react'
import { useUser } from '@/app/auth/AuthContext'
import { cn } from '@/app/lib/cn'
import { formatDate, formatDateTime, formatINR, formatINRFull, humanise, relativeDays } from '@/app/lib/format'
import { categoryLabel, findingTitle, RECOMMENDATION_LABEL, STAGE_LABEL, readableRationale } from '@/app/lib/labels'
import { bidStatus, decisionStatus } from '@/app/lib/bidmarkStatus'
import { useResource } from '@/app/lib/useResource'
import { audit, cases, tenders, type QueueRow, type Tender } from '@/app/services/bidmark'
import { PageHeader, Section } from '@/app/features/shell/AppShell'
import { ROLE_BASE } from '@/app/features/shell/nav'
import { SeverityCounts, SeverityTag, StatusPill, StatusText } from '@/app/components/bidmark/Status'
import { BidmarkGlyph } from '@/app/components/gov/Brand'
import { Button, Drawer, Mono, Skeleton, SkeletonRows, Tabs } from '@/app/components/ui/primitives'
import { EmptyState, ErrorState, Loadable } from '@/app/components/ui/states'
import { canEvaluate, useTenderBoard, valueOf, type Board, type BoardRow } from '@/app/features/case/data'
import { Connections, PriceScreens } from '@/app/features/intelligence/Connections'
import { BidderMatrix } from './BidderMatrix'

export function tenderStatusKind(status: string) {
  return status === 'ACTIVE' ? 'pending' as const : status === 'DRAFT' ? 'unchecked' as const : 'not_required' as const
}

export function TenderListPage() {
  const user = useUser()
  const base = ROLE_BASE[user.role]
  const list = useResource('tenders', () => tenders.list())
  const queue = useResource('queue:all', () => cases.queue())
  const byTender = useMemo(() => {
    const m = new Map<string, QueueRow[]>()
    for (const r of queue.data ?? []) m.set(r.tender_id, [...(m.get(r.tender_id) ?? []), r])
    return m
  }, [queue.data])

  return (
    <div>
      <PageHeader eyebrow="GeM Procurement" title={user.role === 'AUDITOR' ? 'Tender records' : 'Tenders'}
        description="Bids for Chennai Petroleum Corporation Limited. Bidmark screens every bid as it is submitted." />
      <Loadable resource={list} what="tenders" skeleton={<SkeletonRows rows={4} />}>
        {items => items.length === 0 ? <div className="card"><EmptyState title="No tenders published" /></div> : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-[13px]">
                <thead className="bg-subtle text-left text-[12px] uppercase tracking-[0.05em] text-ink-3">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">Tender</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 text-right font-medium">Estimated value</th>
                    <th className="px-3 py-2.5 font-medium">Bid end date</th>
                    <th className="px-3 py-2.5 font-medium">Bids</th>
                    <th className="px-3 py-2.5 font-medium"><span className="inline-flex items-center gap-1.5 text-navy-600"><BidmarkGlyph className="size-3.5" />Bidmark screening</span></th>
                    <th className="px-5 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {[...items].sort((a, b) => (a.status === 'ACTIVE' ? -1 : 1) - (b.status === 'ACTIVE' ? -1 : 1)).map(t => {
                    const rows = byTender.get(t.id) ?? []
                    const high = rows.filter(r => r.counts.HIGH > 0 && !r.decision).length
                    const ring = rows.filter(r => r.in_ring).length
                    return (
                      <tr key={t.id} className="group align-top hover:bg-subtle">
                        <td className="px-5 py-3">
                          <Link to={`${base}/tenders/${t.id}`} className="font-semibold text-ink hover:text-navy-600 hover:underline underline-offset-2">{t.title}</Link>
                          <p className="mt-0.5 text-[12px] text-ink-3"><Mono className="text-[12px]">{t.tender_number}</Mono> <span aria-hidden>·</span> <Mono className="text-[12px]">{t.gem_tender_id}</Mono></p>
                        </td>
                        <td className="px-3 py-3"><StatusPill size="sm" kind={tenderStatusKind(t.status)} label={humanise(t.status)} /></td>
                        <td className="tnum px-3 py-3 text-right">{formatINR(t.estimated_value)}</td>
                        <td className="px-3 py-3">{formatDate(t.deadline)}<p className="text-[12px] text-ink-3">{relativeDays(t.deadline)}</p></td>
                        <td className="tnum px-3 py-3">{queue.data ? rows.length : '...'}</td>
                        <td className="px-3 py-3">
                          {queue.error ? <StatusText kind="unavailable" /> : !queue.data ? <Skeleton className="h-4 w-28" /> : rows.length === 0 ? <span className="text-ink-3">No bids yet</span> : (
                            <span className="flex flex-col gap-0.5 text-[12.5px]">
                              {high > 0 ? <StatusText kind="finding" label={`${high} bid${high > 1 ? 's' : ''} with high findings`} /> : <StatusText kind="pass" label="No open high findings" />}
                              {ring > 0 && <span className="text-ink-3">{ring} linked bidders</span>}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right"><Link to={`${base}/tenders/${t.id}`} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-navy-600">Open <ArrowRight className="size-3.5" aria-hidden /></Link></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Loadable>
    </div>
  )
}

type TabId = 'overview' | 'requirements' | 'bids' | 'evaluation' | 'intelligence' | 'history'

export function TenderPage() {
  const { tenderId } = useParams()
  const user = useUser()
  const base = ROLE_BASE[user.role]
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const evaluates = canEvaluate(user.role)
  const tab = (params.get('tab') as TabId) || 'overview'
  const board = useTenderBoard(tenderId, user.role)
  const intel = useResource(tenderId ? `intel:${tenderId}` : null, () => tenders.intelligence(tenderId!))

  const openCase = (caseId: string, t?: string, finding?: string) =>
    navigate(`${base}/cases/${caseId}${t ? `?tab=${t}${finding ? `&finding=${encodeURIComponent(finding)}` : ''}` : ''}`)

  if (board.error) return <ErrorState error={board.error} onRetry={board.reload} what="this tender" />
  if (!board.data) return <div className="space-y-4"><Skeleton className="h-4 w-60" /><Skeleton className="h-9 w-[30rem]" /><Skeleton className="h-10" /><SkeletonRows rows={6} /></div>
  const b = board.data
  const t = b.tender
  const names = Object.fromEntries(b.rows.map(r => [r.queue.bidder_id, r.queue.bidder_name]))
  const prices = Object.fromEntries(b.rows.map(r => [r.queue.bidder_id, valueOf(r.bid)?.quoted_price ?? null]))
  const openHigh = b.rows.filter(r => r.queue.counts.HIGH > 0 && !r.queue.decision).length
  const setTab = (id: TabId) => setParams(id === 'overview' ? {} : { tab: id }, { replace: true })

  const tabs: { id: TabId; label: string; count?: number | null; tone?: 'finding' | 'review' }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'requirements', label: 'Requirements', count: b.requirements.length },
    { id: 'bids', label: 'Bids received', count: b.rows.length },
    ...(evaluates ? [{ id: 'evaluation' as TabId, label: 'Technical evaluation', count: openHigh || null, tone: 'finding' as const }] : []),
    { id: 'intelligence', label: 'Bidmark Intelligence', count: intel.data?.rings.length || null, tone: 'finding' },
    { id: 'history', label: 'Decision history' },
  ]

  return (
    <div>
      <PageHeader
        crumbs={[{ label: user.role === 'AUDITOR' ? 'Tender records' : 'Tenders', to: `${base}/tenders` }, { label: t.tender_number }]}
        eyebrow={<span className="flex items-center gap-2"><Mono className="text-[12px]">{t.gem_tender_id}</Mono><StatusPill size="sm" kind={tenderStatusKind(t.status)} label={humanise(t.status)} /></span>}
        title={t.title}
        meta={
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px] text-ink-2">
            <span className="inline-flex items-center gap-1.5"><Building2 className="size-3.5 text-ink-3" aria-hidden />{t.department}</span>
            <span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5 text-ink-3" aria-hidden />{t.location ?? 'Location not stated'}</span>
            <span className="inline-flex items-center gap-1.5"><CalendarClock className="size-3.5 text-ink-3" aria-hidden />Bid end {formatDateTime(t.deadline)}</span>
            <span className="tnum">Estimated {formatINR(t.estimated_value)}</span>
          </div>
        }
        actions={evaluates && b.rows.length > 0 ? <Button variant="primary" onClick={() => setTab('evaluation')}>Open technical evaluation</Button> : undefined}
      />
      <Tabs<TabId> label="Tender sections" tabs={tabs} value={tab} onChange={setTab} className="mb-5" />

      {tab === 'overview' && <TenderOverview board={b} intelRings={intel.data?.rings.length} onTab={setTab} evaluates={evaluates} />}
      {tab === 'requirements' && <RequirementsTable board={b} />}
      {tab === 'bids' && <BidsTable board={b} onOpenCase={openCase} />}
      {tab === 'evaluation' && evaluates && <BidderMatrix board={b} onOpenCase={openCase} />}
      {tab === 'intelligence' && (
        intel.error ? <ErrorState error={intel.error} onRetry={intel.reload} what="bidder link analysis" />
          : !intel.data ? <SkeletonRows rows={6} />
            : (
              <div className="space-y-5">
                <Connections intel={intel.data} names={names} prices={prices}
                  onOpenBidder={id => { const row = b.rows.find(r => r.queue.bidder_id === id); if (row) openCase(row.queue.case_id, 'connections') }} />
                <PriceScreens intel={intel.data} prices={prices} nameOf={id => names[id] ?? 'Unknown bidder'} />
              </div>
            )
      )}
      {tab === 'history' && <DecisionHistory board={b} onOpenCase={openCase} />}
    </div>
  )
}

function TenderOverview({ board, intelRings, onTab, evaluates }: { board: Board; intelRings?: number; onTab: (t: TabId) => void; evaluates: boolean }) {
  const t = board.tender
  const rows = board.rows
  const screened = rows.filter(r => !['DRAFT', 'SUBMITTED'].includes(r.queue.stage)).length
  const high = rows.filter(r => r.queue.counts.HIGH > 0).length
  const linked = rows.filter(r => r.queue.in_ring).length
  const decided = rows.filter(r => r.queue.decision).length
  const facts: [string, React.ReactNode][] = [
    ['Tender number', <Mono key="n">{t.tender_number}</Mono>],
    ['GeM bid number', <Mono key="g">{t.gem_tender_id ?? 'Not recorded'}</Mono>],
    ['Buyer', `${t.department}, ${t.organization}`],
    ['Category', humanise(t.tender_category ?? 'Not stated')],
    ['Type', humanise(t.tender_type ?? 'Not stated')],
    ['Bid system', humanise(t.bid_system ?? 'Not stated')],
    ['Estimated value', formatINRFull(t.estimated_value)],
    ['Published', formatDateTime(t.published_at)],
    ['Bid end date', formatDateTime(t.deadline)],
    ['Bid validity', t.bid_validity_days ? `${t.bid_validity_days} days` : 'Not stated'],
    ['Consignee location', t.location ?? 'Not stated'],
  ]
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
      <Section title="Tender details">
        <dl className="grid gap-x-8 gap-y-3 px-5 py-4 text-[13px] sm:grid-cols-2">
          {facts.map(([k, v]) => <div key={k}><dt className="text-[12px] text-ink-3">{k}</dt><dd className="mt-0.5 text-ink">{v}</dd></div>)}
        </dl>
      </Section>
      <section className="card overflow-hidden" aria-label="Bidmark verification summary">
        <div className="flex items-center gap-2 border-b border-line bg-navy px-5 py-3 text-white">
          <BidmarkGlyph className="size-5 [&_rect:first-child]:fill-white/15" />
          <h2 className="text-[14px] font-semibold">Bidmark verification</h2>
          <span className="ml-auto text-[12px] text-white/60">For this tender</span>
        </div>
        <dl className="grid grid-cols-2 gap-px bg-line">
          {[
            ['Bids received', rows.length, null],
            ['Screened', screened, null],
            ['With high findings', high, high ? 'text-finding' : null],
            ['Linked bidders', linked, linked ? 'text-finding' : null],
            ['Linked groups', intelRings ?? '...', null],
            ['Decided by officer', decided, null],
          ].map(([k, v, cls]) => (
            <div key={k as string} className="bg-surface px-5 py-3">
              <dt className="text-[12px] text-ink-3">{k}</dt>
              <dd className={cn('tnum mt-0.5 text-[20px] font-semibold tracking-tight', cls as string)}>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3">
          {evaluates && <Button size="sm" variant="primary" onClick={() => onTab('evaluation')}>Compare bidders</Button>}
          <Button size="sm" onClick={() => onTab('intelligence')}>Open Bidmark Intelligence</Button>
        </div>
      </section>
    </div>
  )
}

function RequirementsTable({ board }: { board: Board }) {
  if (!board.requirements.length) return <div className="card"><EmptyState title="No eligibility requirements set" body="An administrator adds requirements before bids are evaluated." /></div>
  return (
    <Section title="Eligibility requirements" description="Bidmark evaluates each against the documents the bidder uploaded.">
      <table className="w-full text-[13px]">
        <thead className="bg-subtle text-left text-[12px] uppercase tracking-[0.05em] text-ink-3">
          <tr><th className="px-5 py-2 font-medium">Requirement</th><th className="px-3 py-2 font-medium">Evidence</th><th className="px-3 py-2 font-medium">Threshold</th><th className="px-5 py-2 font-medium">Mandatory</th></tr>
        </thead>
        <tbody className="divide-y divide-line">
          {board.requirements.map(r => (
            <tr key={r.id}>
              <td className="px-5 py-2.5"><p className="font-medium">{categoryLabel(r.requirement_type)}</p><p className="text-[12px] text-ink-3">{r.description}</p></td>
              <td className="px-3 py-2.5 text-ink-2">{r.requirement_type === 'DEBARMENT' ? 'Registry check' : categoryLabel(r.evidence_type)}</td>
              <td className="tnum px-3 py-2.5">{r.threshold != null ? `${r.threshold} ${r.threshold_unit.toLowerCase()}` : 'None'}</td>
              <td className="px-5 py-2.5">{r.is_mandatory ? 'Mandatory' : 'Optional'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  )
}

function BidsTable({ board, onOpenCase }: { board: Board; onOpenCase: (caseId: string, tab?: string) => void }) {
  const [inspect, setInspect] = useState<BoardRow | null>(null)
  const rows = [...board.rows].sort((a, b) => (valueOf(a.bid)?.submitted_at ?? '').localeCompare(valueOf(b.bid)?.submitted_at ?? ''))
  return (
    <>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-[13px]">
            <thead className="bg-subtle text-left text-[12px] uppercase tracking-[0.05em] text-ink-3">
              <tr>
                <th className="w-10 px-4 py-2.5 font-medium">#</th>
                <th className="px-3 py-2.5 font-medium">Bidder</th>
                <th className="px-3 py-2.5 font-medium">Bid reference</th>
                <th className="px-3 py-2.5 font-medium">Submitted</th>
                <th className="px-3 py-2.5 text-right font-medium">Quoted price</th>
                <th className="px-3 py-2.5 font-medium">Evaluation stage</th>
                <th className="bg-navy-50 px-4 py-2.5 font-medium text-navy-600"><span className="inline-flex items-center gap-1.5"><BidmarkGlyph className="size-3.5" />Bidmark</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r, i) => {
                const bid = valueOf(r.bid)
                const s = bidStatus(r.queue)
                const d = decisionStatus(r.queue.decision)
                return (
                  <tr key={r.queue.case_id} className="hover:bg-subtle">
                    <td className="tnum px-4 py-3 text-ink-3">{i + 1}</td>
                    <td className="px-3 py-3">
                      <button onClick={() => onOpenCase(r.queue.case_id)} className="font-semibold text-ink hover:text-navy-600 hover:underline underline-offset-2">{r.queue.bidder_name}</button>
                      <Mono className="block text-[12px] text-ink-3">{valueOf(r.bidder)?.gstin}</Mono>
                    </td>
                    <td className="px-3 py-3"><Mono className="text-[12px]">{bid ? `BID-${bid.id.slice(0, 8).toUpperCase()}` : 'Not recorded'}</Mono></td>
                    <td className="whitespace-nowrap px-3 py-3 text-ink-2">{bid ? formatDateTime(bid.submitted_at) : 'Not recorded'}</td>
                    <td className="tnum px-3 py-3 text-right">{bid ? formatINRFull(bid.quoted_price) : 'Not recorded'}</td>
                    <td className="px-3 py-3">{d ? <StatusText kind={d.kind} label={d.label} /> : <span className="text-ink-2">{STAGE_LABEL[r.queue.stage]}</span>}</td>
                    <td className="bg-navy-50/30 px-4 py-3">
                      <button onClick={() => setInspect(r)} className="rounded-full" aria-label={`Inspect Bidmark result for ${r.queue.bidder_name}: ${s.label}`}>
                        <StatusPill kind={s.kind} label={s.label} className="cursor-pointer hover:brightness-95" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <Drawer open={!!inspect} onClose={() => setInspect(null)} title={inspect?.queue.bidder_name ?? ''}
        subtitle={<span className="inline-flex items-center gap-1.5"><BidmarkGlyph className="size-3.5" />Bidmark inspection</span>}
        footer={inspect && <div className="flex justify-end"><Button variant="primary" onClick={() => onOpenCase(inspect.queue.case_id)}>Open full case</Button></div>}>
        {inspect && <InspectBody row={inspect} onOpen={tab => onOpenCase(inspect.queue.case_id, tab)} />}
      </Drawer>
    </>
  )
}

function InspectBody({ row, onOpen }: { row: BoardRow; onOpen: (tab: string) => void }) {
  const detail = valueOf(row.detail)
  const s = bidStatus(row.queue)
  if (!detail) return row.detail.ok ? null : <ErrorState error={row.detail.error} what="this case" />
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2"><StatusPill kind={s.kind} label={s.label} /><SeverityCounts counts={row.queue.counts} /></div>
      <div className="rounded-lg border border-line bg-subtle px-3.5 py-3">
        <p className="eyebrow">System assessment</p>
        <p className="mt-1 text-[13.5px] font-semibold">{detail.ai_recommendation ? RECOMMENDATION_LABEL[detail.ai_recommendation] : 'Not assessed'}</p>
        <p className="mt-0.5 text-[12.5px] text-ink-2">{readableRationale(detail.summary.recommendation_rationale)}</p>
      </div>
      <section>
        <p className="eyebrow mb-2">Findings</p>
        {detail.findings.length ? (
          <ul className="space-y-2">
            {detail.findings.map(f => (
              <li key={f.id} className="rounded-lg border border-line px-3 py-2.5">
                <span className="flex items-center gap-2"><SeverityTag severity={f.severity} /><span className="text-[13px] font-semibold">{findingTitle(f.code, f.title)}</span></span>
                <p className="mt-1 text-[12.5px] text-ink-2">{f.detail}</p>
              </li>
            ))}
          </ul>
        ) : <p className="text-[13px] text-ink-3">No findings raised.</p>}
      </section>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => onOpen('documents')}>Open documents</Button>
        <Button size="sm" onClick={() => onOpen('connections')}>Connections</Button>
        <Button size="sm" onClick={() => onOpen('decision')}>Decision</Button>
      </div>
    </div>
  )
}

function DecisionHistory({ board, onOpenCase }: { board: Board; onOpenCase: (caseId: string, tab?: string) => void }) {
  const feed = useResource('audit:feed:FINAL_DECISION', () => audit.feed({ action: 'FINAL_DECISION', limit: 200 }))
  const caseIds = new Set(board.rows.map(r => r.queue.case_id))
  return (
    <Loadable resource={feed} what="decision history">
      {entries => {
        const mine = entries.filter(e => e.entity_id && caseIds.has(e.entity_id))
        if (!mine.length) return <div className="card"><EmptyState title="No decisions recorded on this tender yet" body="Each qualification decision appears here with its reason and audit hash." /></div>
        return (
          <ul className="space-y-2.5">
            {mine.map(e => {
              const row = board.rows.find(r => r.queue.case_id === e.entity_id)
              const decision = String(e.metadata.decision ?? '')
              return (
                <li key={e.id} className="card flex flex-wrap items-start justify-between gap-4 px-5 py-4">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-[14px] font-semibold">{row?.queue.bidder_name}
                      <StatusPill size="sm" kind={decision === 'QUALIFIED' ? 'met' : 'not_met'} label={decision === 'QUALIFIED' ? 'Qualified' : 'Disqualified'} />
                      {e.metadata.against_ai === true && <StatusPill size="sm" kind="review" label="Differs from system assessment" />}
                    </p>
                    <p className="mt-1 text-[13px] text-ink-2">{e.description.replace(/^(QUALIFIED|DISQUALIFIED):\s*/, '')}</p>
                    <p className="mt-1 text-[12px] text-ink-3">{formatDateTime(e.created_at)} <span aria-hidden>·</span> entry {e.seq} <span aria-hidden>·</span> <Mono className="text-[12px]">{e.row_hash.slice(0, 16)}</Mono></p>
                  </div>
                  {row && <Button size="sm" onClick={() => onOpenCase(row.queue.case_id, 'decision')}>Open case</Button>}
                </li>
              )
            })}
          </ul>
        )
      }}
    </Loadable>
  )
}

export type { Tender }
