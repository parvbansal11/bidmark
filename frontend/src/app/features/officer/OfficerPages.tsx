import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Clock, Info, Lock, LockOpen } from 'lucide-react'
import { useUser } from '@/app/auth/AuthContext'
import { cn } from '@/app/lib/cn'
import { firstName, formatDate, greeting, relativeDays } from '@/app/lib/format'
import { LANE_LABEL, LANE_NOTE, RECOMMENDATION_LABEL, STAGE_LABEL } from '@/app/lib/labels'
import { bidStatus, decisionStatus } from '@/app/lib/bidmarkStatus'
import { useResource } from '@/app/lib/useResource'
import { cases, home, tenders, type CaseDetail, type Lane, type OfficerHome, type QueueRow } from '@/app/services/bidmark'
import { PageHeader, Section } from '@/app/features/shell/AppShell'
import { SeverityCounts, SeverityTag, StatusPill, StatusText } from '@/app/components/bidmark/Status'
import { Button, Drawer, Mono, Select, Skeleton, SkeletonRows } from '@/app/components/ui/primitives'
import { EmptyState, ErrorState, Loadable } from '@/app/components/ui/states'
import { attentionItems, useCaseIndex, useSharedSignals, type CaseRow } from './data'
import { AttentionDrawer } from './AttentionDrawer'

function useCaseDetails(rows: QueueRow[] | undefined) {
  const ids = (rows ?? []).map(r => r.case_id).join(',')
  return useResource<Record<string, CaseDetail>>(ids ? `details:${ids}` : null, async () => {
    const list = await Promise.all((rows ?? []).map(r => cases.get(r.case_id)))
    return Object.fromEntries(list.map(c => [c.id, c]))
  })
}

const laneKind = (lane: Lane | null) => (lane === 'ESCALATED' ? 'finding' : lane === 'STANDARD' ? 'review' : 'pass') as 'finding' | 'review' | 'pass'

const VISIBLE = 4

export function OfficerWorkspace() {
  const user = useUser()
  const res = useResource('home', () => home())
  const tenderList = useResource('tenders', () => tenders.list())
  const index = useCaseIndex()
  const data = res.data as OfficerHome | undefined
  const ringTenders = useMemo(() => (index.data ?? []).filter(r => r.queue.in_ring).map(r => r.queue.tender_id), [index.data])
  const signals = useSharedSignals(ringTenders)
  const [drawer, setDrawer] = useState<CaseRow | null>(null)
  const [about, setAbout] = useState(false)

  if (res.error) return <ErrorState error={res.error} onRetry={res.reload} what="your workspace" />
  if (!data) return <div className="space-y-5"><Skeleton className="h-8 w-80" /><Skeleton className="h-24" /><SkeletonRows rows={4} /></div>
  const s = data.stats
  const items = index.data ? attentionItems(index.data, signals.data ?? {}).filter(i => i.severity !== 'INFO') : null
  const active = (tenderList.data ?? []).filter(t => t.status === 'ACTIVE')

  const kpis: { label: string; value: number; tone?: 'finding' | 'review'; to: string }[] = [
    { label: 'Bids', value: s.to_review, to: '/officer/queue' },
    { label: 'Need attention', value: items?.length ?? 0, tone: items?.length ? 'review' : undefined, to: '/officer/queue' },
    { label: 'High risk', value: s.escalated, tone: s.escalated ? 'finding' : undefined, to: '/officer/queue?lane=ESCALATED' },
    { label: 'Clarification pending', value: s.awaiting_bidder, to: '/officer/decisions' },
  ]

  return (
    <div>
      <PageHeader eyebrow={`${formatDate(new Date().toISOString())}, Chennai Petroleum Corporation Limited`}
        title={`${greeting()}, ${firstName(user.full_name).split(' ')[0]}`}
        description={s.to_review ? `${s.to_review} bids currently under evaluation` : 'Nothing is waiting for review'} />

      <dl className="mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-4">
        {kpis.map(k => (
          <Link key={k.label} to={k.to} className="group bg-surface px-5 py-4 transition-colors hover:bg-subtle">
            <dd className={cn('tnum text-[28px] font-semibold leading-none tracking-[-0.02em]', k.tone === 'finding' ? 'text-finding' : k.tone === 'review' ? 'text-review' : 'text-ink')}>{k.value}</dd>
            <dt className="mt-2 flex items-center gap-1 text-[13.5px] text-ink-3 group-hover:text-ink-2">{k.label}<ArrowRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden /></dt>
          </Link>
        ))}
      </dl>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Section title="Needs your attention"
          actions={items && items.length > VISIBLE ? <Link to="/officer/queue" className="inline-flex items-center gap-1 text-[13px] font-medium text-navy-600 hover:underline">View all {items.length}<ArrowRight className="size-3.5" aria-hidden /></Link> : undefined}>
          {index.error ? <div className="p-5"><ErrorState error={index.error} onRetry={index.reload} what="the attention list" compact /></div>
            : !items ? <div className="space-y-3 p-5">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}</div>
              : items.length === 0 ? <EmptyState title="Nothing needs your attention" body="Every screened bid has a ruling on its findings." />
                : (
                  <ul className="divide-y divide-line">
                    {items.slice(0, VISIBLE).map(item => (
                      <li key={item.caseId}>
                        <button onClick={() => setDrawer(index.data!.find(r => r.queue.case_id === item.caseId) ?? null)}
                          className="group grid w-full grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-subtle">
                          <SeverityTag severity={item.severity === 'INFO' ? 'LOW' : item.severity} className="justify-self-start" />
                          <span className="min-w-0">
                            <span className="block truncate text-[15px] font-semibold text-ink">{item.bidder}</span>
                            <span className="mt-0.5 block truncate text-[14px] text-ink-2">{item.title}</span>
                            <span className="mt-1 block truncate text-[12.5px] text-ink-3">{item.context} <span aria-hidden className="text-ink-4">·</span> <Mono className="text-[12px]">{item.tenderNumber}</Mono></span>
                          </span>
                          <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink-2 transition-colors group-hover:border-navy-600 group-hover:text-navy">
                            {item.action}<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
        </Section>

        <div className="space-y-4">
          <Section title="Active tenders">
            {tenderList.error ? <div className="p-4"><ErrorState error={tenderList.error} onRetry={tenderList.reload} what="tenders" compact /></div>
              : !tenderList.data ? <div className="p-4"><SkeletonRows rows={2} /></div>
                : active.length === 0 ? <EmptyState title="No active tenders" />
                  : (
                    <ul className="divide-y divide-line">
                      {active.map(t => {
                        const rows = (data.queue ?? []).filter(q => q.tender_id === t.id && q.stage !== 'DRAFT')
                        const review = rows.filter(q => q.stage !== 'DECIDED' && (q.counts.HIGH > 0 || q.counts.MEDIUM > 0)).length
                        return (
                          <li key={t.id}>
                            <Link to={`/officer/tenders/${t.id}`} className="block px-5 py-4 transition-colors hover:bg-subtle">
                              <p className="text-[14px] font-semibold leading-snug">{t.title}</p>
                              <Mono className="mt-0.5 block text-[12px] text-ink-3">{t.tender_number}</Mono>
                              <p className="mt-2.5 flex items-center justify-between gap-3 text-[13px]">
                                <span className="text-ink-2">{rows.length} bidders{review > 0 && <span className="text-review"> · {review} require{review === 1 ? 's' : ''} review</span>}</span>
                                <span className="text-ink-3">Closes {formatDate(t.deadline).replace(/ \d{4}$/, '')}</span>
                              </p>
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                  )}
          </Section>
          <button onClick={() => setAbout(true)} className="inline-flex items-center gap-1.5 px-1 text-[13px] text-ink-3 transition-colors hover:text-ink">
            <Info className="size-3.5" aria-hidden /> About prioritisation
          </button>
        </div>
      </div>

      {drawer && <AttentionDrawer row={drawer} onClose={() => setDrawer(null)} />}
      <Drawer open={about} onClose={() => setAbout(false)} title="How the queue is ordered">
        <ul className="space-y-3 text-[14px] text-ink-2">
          {(['ESCALATED', 'STANDARD', 'FAST_TRACK'] as Lane[]).map(l => (
            <li key={l} className="flex items-start gap-2.5"><StatusPill size="sm" kind={laneKind(l)} label={LANE_LABEL[l]} className="shrink-0" /><span>{LANE_NOTE[l]}</span></li>
          ))}
        </ul>
        <p className="mt-4 text-[13.5px] text-ink-3">Within a lane, bids are weighted by how often officers uphold the rules involved and by tender value.</p>
      </Drawer>
    </div>
  )
}

export function QueuePage() {
  const navigate = useNavigate()
  const params = new URLSearchParams(window.location.search)
  const [lane, setLane] = useState(params.get('lane') ?? '')
  const [stage, setStage] = useState('open')
  const res = useResource('queue:all', () => cases.queue())
  return (
    <div>
      <PageHeader eyebrow="Bidmark" title="Verification queue" description="Every screened bid, ordered by risk and review deadline." />
      <div className="mb-3 flex flex-wrap gap-2">
        <Select value={lane} onChange={e => setLane(e.target.value)} className="h-9 w-auto" aria-label="Filter by lane">
          <option value="">All lanes</option><option value="ESCALATED">Escalated</option><option value="STANDARD">Standard</option><option value="FAST_TRACK">Fast track</option>
        </Select>
        <Select value={stage} onChange={e => setStage(e.target.value)} className="h-9 w-auto" aria-label="Filter by stage">
          <option value="open">In evaluation</option><option value="decided">Decided</option><option value="">All stages</option>
        </Select>
      </div>
      <Loadable resource={res} what="the verification queue">
        {rows => {
          const list = rows.filter(r => (!lane || r.lane === lane) && (stage === '' || (stage === 'open' ? r.stage !== 'DECIDED' : r.stage === 'DECIDED')))
          if (!list.length) return <div className="card"><EmptyState title="No bids match these filters" /></div>
          return (
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[960px] text-[13px]">
                <thead className="bg-subtle text-left text-[12px] uppercase tracking-[0.05em] text-ink-3">
                  <tr><th className="px-5 py-2.5 font-medium">Bidder</th><th className="px-3 py-2.5 font-medium">Lane</th><th className="px-3 py-2.5 font-medium">Findings</th><th className="px-3 py-2.5 font-medium">Bidmark</th><th className="px-3 py-2.5 font-medium">System assessment</th><th className="px-3 py-2.5 font-medium">Stage</th><th className="px-3 py-2.5 font-medium">Review due</th><th className="px-5 py-2.5" /></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {list.map(r => {
                    const s = bidStatus(r)
                    const d = decisionStatus(r.decision)
                    return (
                      <tr key={r.case_id} className="cursor-pointer hover:bg-subtle" onClick={() => navigate(`/officer/cases/${r.case_id}`)}>
                        <td className="px-5 py-3"><p className="font-semibold">{r.bidder_name}</p><p className="text-[12px] text-ink-3">{r.tender_number}</p></td>
                        <td className="px-3 py-3">{r.lane && <StatusPill size="sm" kind={laneKind(r.lane)} label={LANE_LABEL[r.lane]} />}</td>
                        <td className="px-3 py-3"><SeverityCounts counts={r.counts} compact /></td>
                        <td className="px-3 py-3"><StatusPill size="sm" kind={s.kind} label={s.label} />{r.in_ring && <StatusPill size="sm" kind="finding" label="Linked" className="ml-1" />}</td>
                        <td className="px-3 py-3 text-ink-2">{r.ai_recommendation ? RECOMMENDATION_LABEL[r.ai_recommendation] : 'Not assessed'}</td>
                        <td className="px-3 py-3">{d ? <StatusText kind={d.kind} label={d.label} /> : STAGE_LABEL[r.stage]}</td>
                        <td className={cn('px-3 py-3', r.sla_breached && 'font-semibold text-finding')}>{r.stage === 'DECIDED' ? 'Closed' : r.sla_breached ? 'Overdue' : relativeDays(r.sla_due_at)}</td>
                        <td className="px-5 py-3 text-right"><ArrowRight className="ml-auto size-4 text-ink-4" aria-hidden /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        }}
      </Loadable>
    </div>
  )
}

export function DecisionDeskPage() {
  const navigate = useNavigate()
  const res = useResource('queue:all', () => cases.queue())
  const rows = res.data ?? []
  const pending = rows.filter(r => r.stage !== 'DECIDED')
  const details = useCaseDetails(pending)
  return (
    <div>
      <PageHeader eyebrow="Bidmark" title="Decision desk"
        description="A decision unlocks once every high finding has a ruling." />
      <Loadable resource={res} what="cases">
        {() => (
          <div className="space-y-6">
            <Section title={`Awaiting decision (${pending.length})`}>
              {pending.length === 0 ? <EmptyState title="No bids awaiting a decision" /> : (
                <ul className="divide-y divide-line">
                  {pending.map(r => {
                    const d = details.data?.[r.case_id]
                    const locked = d ? d.undisposed_high.length : null
                    const waiting = r.stage === 'CLARIFICATION_REQUESTED'
                    return (
                      <li key={r.case_id} className="grid items-center gap-3 px-5 py-3.5 md:grid-cols-[minmax(0,1fr)_240px_200px_auto]">
                        <div className="min-w-0"><p className="truncate text-[13.5px] font-semibold">{r.bidder_name}</p><p className="text-[12px] text-ink-3">{r.tender_number}</p></div>
                        <div>
                          {locked == null ? (details.error ? <StatusText kind="unavailable" /> : <Skeleton className="h-4 w-32" />)
                            : waiting ? <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-2"><Clock className="size-3.5" aria-hidden />Waiting for bidder reply</span>
                              : locked ? <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-finding"><Lock className="size-3.5" aria-hidden />Locked: {locked} high to rule</span>
                                : <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-pass"><LockOpen className="size-3.5" aria-hidden />Ready for decision</span>}
                        </div>
                        <p className="text-[12.5px] text-ink-3">{r.ai_recommendation ? RECOMMENDATION_LABEL[r.ai_recommendation] : 'Not assessed'}</p>
                        <Button size="sm" variant={locked === 0 && !waiting ? 'primary' : 'secondary'} onClick={() => navigate(`/officer/cases/${r.case_id}?tab=decision`)}>
                          {locked ? 'Rule on findings' : 'Open decision'}
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Section>
            <Section title={`Decided (${rows.length - pending.length})`}>
              {rows.length === pending.length ? <EmptyState title="No decisions recorded yet" /> : (
                <ul className="divide-y divide-line">
                  {rows.filter(r => r.stage === 'DECIDED').map(r => {
                    const d = decisionStatus(r.decision)
                    return (
                      <li key={r.case_id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                        <div><p className="text-[13.5px] font-semibold">{r.bidder_name}</p><p className="text-[12px] text-ink-3">{r.tender_number}</p></div>
                        <div className="flex items-center gap-3">{d && <StatusText kind={d.kind} label={d.label} />}<Button size="sm" onClick={() => navigate(`/officer/cases/${r.case_id}?tab=decision`)}>View record</Button></div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Section>
          </div>
        )}
      </Loadable>
    </div>
  )
}
