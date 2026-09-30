import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronRight, FileSearch, Gavel, Lock, LockOpen } from 'lucide-react'
import { useUser } from '@/app/auth/AuthContext'
import { cn } from '@/app/lib/cn'
import { formatDateTime, formatINR, hoursUntil, relativeDays } from '@/app/lib/format'
import { LANE_LABEL, LANE_NOTE, RECOMMENDATION_LABEL, STAGE_LABEL } from '@/app/lib/labels'
import { findingDocumentId, findingPins, sortFindings } from '@/app/lib/bidmarkStatus'
import { useResource } from '@/app/lib/useResource'
import { cases, tenders, type CaseDetail, type Finding, type Severity } from '@/app/services/bidmark'
import { PageHeader } from '@/app/features/shell/AppShell'
import { ROLE_BASE } from '@/app/features/shell/nav'
import { FindingCard, type FindingContext } from '@/app/components/bidmark/FindingCard'
import { StatusPill } from '@/app/components/bidmark/Status'
import { Button, Drawer, Mono, Skeleton, Tabs } from '@/app/components/ui/primitives'
import { EmptyState, ErrorState } from '@/app/components/ui/states'
import { Connections } from '@/app/features/intelligence/Connections'
import { useCopilotSubject } from '@/app/features/copilot/AskBidmark'
import { riskKind, riskLevel } from '@/app/features/officer/data'
import { CompliancePassport, WhyDetails } from './CompliancePassport'
import { useCase, useCaseContext } from './data'
import { ForensicsTab } from './ForensicsTab'
import { RegistryTab } from './RegistryTab'
import { DecisionTab } from './DecisionTab'
import { VerificationValue } from './VerificationValue'
import { CaseTimeline } from './CaseTimeline'

type TabId = 'passport' | 'findings' | 'documents' | 'connections' | 'decision' | 'audit'

export function CasePage() {
  const { caseId } = useParams()
  const user = useUser()
  const base = ROLE_BASE[user.role]
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const auditor = user.role === 'AUDITOR'
  const requested = params.get('tab') === 'registry' ? 'passport' : (params.get('tab') as TabId | null)
  const tab: TabId = requested && !(auditor && requested === 'passport') ? requested : auditor ? 'findings' : 'passport'
  const caseRes = useCase(caseId)
  const c = caseRes.data
  const ctxRes = useCaseContext(c, user.role)
  const intel = useResource(c ? `intel:${c.tender_id}` : null, () => tenders.intelligence(c!.tender_id))
  const tenderBidders = useResource(c ? `tender-bidders:${c.tender_id}` : null, () => tenders.bidders(c!.tender_id))
  const queue = useResource(c ? `queue:${c.tender_id}` : null, () => cases.queue(c!.tender_id))
  const [panel, setPanel] = useState<'why' | 'bid' | null>(null)

  const setTab = (t: TabId, extra: Record<string, string | null> = {}) => {
    const next = new URLSearchParams(params)
    next.set('tab', t)
    for (const [k, v] of Object.entries(extra)) {
      if (v == null) next.delete(k)
      else next.set(k, v)
    }
    setParams(next, { replace: t === tab })
  }

  const documentNames = useMemo(() => Object.fromEntries((ctxRes.documents.data ?? []).map(d => [d.id, d.original_filename])), [ctxRes.documents.data])
  const names = useMemo(() => Object.fromEntries((tenderBidders.data ?? []).map(b => [b.id, b.company_name])), [tenderBidders.data])
  useCopilotSubject(c ? { caseId: c.id, bidderId: c.bidder_id, tenderId: c.tender_id, bidderName: ctxRes.bidder.data?.company_name ?? 'this bidder', tenderNumber: ctxRes.tender.data?.tender_number, findings: c.findings } : null)

  if (caseRes.error) return <ErrorState error={caseRes.error} onRetry={caseRes.reload} what="this case" />
  if (!c) return <CaseSkeleton />

  const bidder = ctxRes.bidder.data
  const tender = ctxRes.tender.data
  const bid = ctxRes.bid.data
  const ctx: FindingContext = { bidder, bid, requirements: ctxRes.requirements.data, documentNames, bidderNames: names }
  const canRule = user.role === 'PROCUREMENT_OFFICER' && c.stage !== 'DECIDED'
  const openHigh = c.undisposed_high.length
  const caseIdForOther = (bidderId: string) => queue.data?.find(q => q.bidder_id === bidderId)?.case_id

  function openEvidence(f: Finding) {
    setTab('documents', { finding: f.id, doc: findingDocumentId(f) ?? findingPins(f)[0]?.document_id ?? null })
  }
  const grouped = (['HIGH', 'MEDIUM', 'LOW', 'INFO'] as Severity[]).map(s => ({ s, items: c.findings.filter(f => f.severity === s) })).filter(g => g.items.length)
  const counts = c.summary.counts ?? { HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 }
  const risk = riskLevel(c.lane, c.summary.compliance_risk)
  const slaHours = hoursUntil(c.sla_due_at)

  return (
    <div>
      <PageHeader
        crumbs={[
          { label: user.role === 'AUDITOR' ? 'Tender records' : 'Tenders', to: `${base}/tenders` },
          { label: tender?.tender_number ?? 'Tender', to: `${base}/tenders/${c.tender_id}?tab=evaluation` },
          { label: bidder?.company_name ?? 'Bid' },
        ]}
        eyebrow={<span className="flex items-center gap-2">Bid evaluation case {c.lane && <StatusPill size="sm" kind={c.lane === 'ESCALATED' ? 'finding' : c.lane === 'STANDARD' ? 'review' : 'pass'} label={`${LANE_LABEL[c.lane]} lane`} title={LANE_NOTE[c.lane]} />}</span>}
        title={bidder?.company_name ?? <Skeleton className="h-7 w-72" />}
        meta={
          <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-2 text-[13.5px]">
            <Meta label="GSTIN" value={bidder?.gstin ? <Mono>{bidder.gstin}</Mono> : 'Not recorded'} />
            <Meta label="Tender" value={tender ? <span>{tender.tender_number}</span> : '...'} />
            <Meta label="Stage" value={STAGE_LABEL[c.stage]} />
            {c.sla_due_at && c.stage !== 'DECIDED' && (
              <Meta label="Review due" value={<span className={cn(c.sla_breached && 'font-semibold text-finding')}>{c.sla_breached ? 'Overdue' : relativeDays(c.sla_due_at)}{slaHours != null && slaHours > 0 && slaHours < 24 ? ` (${Math.round(slaHours)} h)` : ''}</span>} />
            )}
            <button onClick={() => setPanel('bid')} className="inline-flex items-center gap-0.5 text-navy-600 hover:underline">Bid details<ChevronRight className="size-3.5" aria-hidden /></button>
          </dl>
        }
        actions={
          <>
            <Button icon={<FileSearch className="size-4" aria-hidden />} onClick={() => setTab('documents', { finding: null })}>Open documents</Button>
            {user.role !== 'BIDDER' && (
              <Button variant="primary" icon={<Gavel className="size-4" aria-hidden />} onClick={() => setTab('decision')}>
                {c.stage === 'DECIDED' ? 'View decision' : user.role === 'PROCUREMENT_OFFICER' ? 'Officer decision' : 'Decision status'}
              </Button>
            )}
          </>
        }
      />

      <div className="mb-7 grid gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-2 xl:grid-cols-4">
        <SummaryCell label="Verification">
          <VerificationValue v={c.verification} />
        </SummaryCell>
        <SummaryCell label="Risk">
          <StatusPill kind={riskKind(risk)} label={risk} />
        </SummaryCell>
        <SummaryCell label="Recommendation">
          <p className="text-[15px] font-semibold text-ink">{c.ai_recommendation ? RECOMMENDATION_LABEL[c.ai_recommendation] : 'Not assessed'}</p>
          <button onClick={() => setPanel('why')} className="mt-1 inline-flex items-center gap-0.5 text-[13px] text-navy-600 hover:underline">Why?<ChevronRight className="size-3.5" aria-hidden /></button>
        </SummaryCell>
        <SummaryCell label={c.decision ? 'Final decision' : 'Decision gate'}>
          {c.decision ? (
            <StatusPill kind={c.decision === 'QUALIFIED' ? 'met' : 'not_met'} label={c.decision === 'QUALIFIED' ? 'Qualified' : 'Disqualified'} />
          ) : c.stage === 'CLARIFICATION_REQUESTED' ? (
            <p className="text-[15px] font-semibold text-ink">Waiting for bidder</p>
          ) : openHigh ? (
            <button onClick={() => setTab('decision')} className="text-left">
              <p className="flex items-center gap-1.5 text-[15px] font-semibold text-finding"><Lock className="size-4" aria-hidden />{openHigh} finding{openHigh > 1 ? 's' : ''} to rule on</p>
            </button>
          ) : (
            <p className="flex items-center gap-1.5 text-[15px] font-semibold text-pass"><LockOpen className="size-4" aria-hidden />Ready for decision</p>
          )}
        </SummaryCell>
      </div>

      <Tabs<TabId> label="Case sections" value={tab} onChange={t => setTab(t)} className="mb-5"
        tabs={[
          ...(auditor ? [] : [{ id: 'passport' as TabId, label: 'Compliance passport' }]),
          { id: 'findings', label: 'Findings', count: c.findings.length, tone: counts.HIGH ? 'finding' : counts.MEDIUM ? 'review' : undefined },
          { id: 'documents', label: 'Evidence', count: ctxRes.documents.data?.length },
          { id: 'connections', label: 'Connections', count: c.summary.in_ring ? 1 : null, tone: 'finding' },
          { id: 'decision', label: 'Decision', count: c.stage === 'DECIDED' ? null : openHigh, tone: 'finding' },
          { id: 'audit', label: 'Audit' },
        ]} />

      {tab === 'passport' && (
        <CompliancePassport c={c} evaluation={ctxRes.evaluation} documents={ctxRes.documents.data ?? []} requirements={ctxRes.requirements.data ?? []}
          bidder={bidder ?? null} onOpenFinding={openEvidence}
          sourceRecords={<RegistryTab role={user.role} c={c} ctx={ctxRes} />} />
      )}

      {tab === 'findings' && (
        <div className={cn('grid gap-6', c.clarifications.length > 0 && 'xl:grid-cols-[minmax(0,1fr)_300px]')}>
          <div className="space-y-6">
            {grouped.length === 0 && (
              <div className="card"><EmptyState title="No findings raised" body="Screening raised no findings for this bid. Checks that could not run are listed per document under Documents and forensics." /></div>
            )}
            {grouped.map(g => (
              <section key={g.s} aria-label={`${g.s} findings`}>
                <h2 className="eyebrow mb-2">{g.s === 'HIGH' ? 'High: officer ruling required' : g.s === 'MEDIUM' ? 'Medium' : g.s === 'LOW' ? 'Low' : 'Information'} ({g.items.length})</h2>
                <div className="space-y-2.5">
                  {sortFindings(g.items).map(f => (
                    <FindingCard key={f.id} finding={f} caseId={c.id} ctx={ctx} canRule={canRule}
                      defaultOpen={params.get('finding') === f.id}
                      highlighted={params.get('finding') === f.id}
                      onOpenEvidence={openEvidence} onOpenConnections={() => setTab('connections')} />
                  ))}
                </div>
              </section>
            ))}
          </div>
          {c.clarifications.length > 0 && <CaseSideNotes c={c} />}
        </div>
      )}

      {tab === 'documents' && (
        ctxRes.documents.error ? <ErrorState error={ctxRes.documents.error} onRetry={ctxRes.documents.reload} what="the bidder's documents" />
          : !ctxRes.documents.data ? <Skeleton className="h-[60vh]" />
            : <ForensicsTab caseDetail={c} documents={ctxRes.documents.data} ctx={ctx} canRule={canRule}
                selectedFindingId={params.get('finding')} selectedDocId={params.get('doc')}
                onSelect={({ finding, doc }) => setTab('documents', { finding: finding ?? null, doc: doc ?? null })} />
      )}

      {tab === 'connections' && (
        intel.error ? <ErrorState error={intel.error} onRetry={intel.reload} what="bidder link analysis" />
          : !intel.data ? <Skeleton className="h-96" />
            : <Connections intel={intel.data} names={names} focus={c.bidder_id}
                onOpenBidder={id => { const other = caseIdForOther(id); if (other && other !== c.id) navigate(`${base}/cases/${other}?tab=connections`) }} />
      )}

      {tab === 'decision' && <DecisionTab c={c} role={user.role} onOpenFinding={f => openEvidence(f)} onReload={caseRes.reload} />}

      {tab === 'audit' && <CaseTimeline caseId={c.id} anchor={c.audit_anchor} />}

      <Drawer open={panel === 'why'} onClose={() => setPanel(null)} title="Why this assessment" subtitle={bidder?.company_name}>
        <WhyDetails c={c} />
      </Drawer>
      <Drawer open={panel === 'bid'} onClose={() => setPanel(null)} title="Bid details" subtitle={bidder?.company_name}>
        <dl className="divide-y divide-line text-[14px]">
          {([
            ['Bid reference', bid ? <Mono>{`BID-${bid.id.slice(0, 8).toUpperCase()}`}</Mono> : 'Not recorded'],
            ['Submitted', bid?.submitted_at ? formatDateTime(bid.submitted_at) : 'Not recorded'],
            ['Quoted price', bid ? formatINR(bid.quoted_price) : 'Not recorded'],
            ['Declared turnover', bid?.declared_turnover_crore != null ? `₹${bid.declared_turnover_crore} crore` : 'Not declared'],
            ['Local content', bid?.local_content_percent != null ? `${bid.local_content_percent}%` : 'Not declared'],
            ['Screening lane', c.lane ? `${LANE_LABEL[c.lane]}. ${LANE_NOTE[c.lane]}` : 'Not screened'],
            ['Screened', formatDateTime(c.screened_at)],
          ] as [string, React.ReactNode][]).map(([k, v]) => (
            <div key={k} className="grid grid-cols-[140px_minmax(0,1fr)] gap-3 py-2.5"><dt className="text-ink-3">{k}</dt><dd className="text-ink">{v}</dd></div>
          ))}
        </dl>
      </Drawer>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-ink-3">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  )
}

function SummaryCell({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface px-5 py-4">
      <p className="mb-2 flex items-center justify-between gap-2 text-[12px] font-medium text-ink-3">
        <span className="uppercase tracking-[0.06em]">{label}</span>
        {note && <span className="normal-case tracking-normal text-ink-4">{note}</span>}
      </p>
      {children}
    </div>
  )
}

function CaseSideNotes({ c }: { c: CaseDetail }) {
  return (
    <aside className="space-y-3">
      {c.clarifications.length > 0 && (
        <section className="card p-4">
          <h3 className="text-[13px] font-semibold">Clarifications</h3>
          <ul className="mt-2 space-y-3">
            {c.clarifications.map(q => (
              <li key={q.id} className="text-[12.5px]">
                <StatusPill size="sm" kind={q.status === 'OPEN' ? 'pending' : 'met'} label={q.status === 'OPEN' ? `Open, due ${relativeDays(q.due_at)}` : 'Answered'} />
                <p className="mt-1.5 text-ink-2">{q.question}</p>
                {q.response_text && <p className="mt-1 border-l-2 border-line-strong pl-2 text-ink-3">{q.response_text}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  )
}

function CaseSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading case">
      <Skeleton className="h-4 w-64" />
      <Skeleton className="h-8 w-96" />
      <Skeleton className="h-4 w-[36rem]" />
      <div className="grid gap-3 md:grid-cols-4">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}</div>
      <Skeleton className="h-10" />
      <div className="space-y-2.5">{[0, 1, 2].map(i => <Skeleton key={i} className="h-24" />)}</div>
    </div>
  )
}

