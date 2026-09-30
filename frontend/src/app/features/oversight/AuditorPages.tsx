import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useUser } from '@/app/auth/AuthContext'
import { cn } from '@/app/lib/cn'
import { firstName, formatDateTime, greeting, shortHash } from '@/app/lib/format'
import { findingTitle, readableRationale, RECOMMENDATION_LABEL } from '@/app/lib/labels'
import { useResource } from '@/app/lib/useResource'
import { audit, cases, home, type AuditorHome } from '@/app/services/bidmark'
import { PageHeader, Section } from '@/app/features/shell/AppShell'
import { StatusPill, StatusText } from '@/app/components/bidmark/Status'
import { Mono, Skeleton, SkeletonRows } from '@/app/components/ui/primitives'
import { EmptyState, ErrorState, Loadable } from '@/app/components/ui/states'
import { ChainBanner, ChainExplainer } from '@/app/features/audit/ChainStatus'

export function AuditorOverview() {
  const user = useUser()
  const res = useResource('home', () => home())
  const data = res.data as AuditorHome | undefined
  if (res.error) return <ErrorState error={res.error} onRetry={res.reload} what="the audit overview" />
  if (!data) return <div className="space-y-4"><Skeleton className="h-8 w-72" /><Skeleton className="h-20" /><SkeletonRows /></div>
  const s = data.stats
  return (
    <div>
      <PageHeader eyebrow="Oversight, read only" title={`${greeting()}, ${firstName(user.full_name)}`}
        description="Trace every decision back to its findings, the officer's rulings and the audit chain." />
      <ChainBanner chain={data.audit_chain} className="mb-6" />
      <dl className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-4">
        {[
          ['Decisions recorded', s.decisions, false],
          ['Decisions against the system assessment', s.against_ai, s.against_ai > 0],
          ['High findings dismissed', s.high_findings_dismissed, s.high_findings_dismissed > 0],
          ['Finding rulings', s.dispositions, false],
        ].map(([k, v, warn]) => (
          <div key={k as string} className="bg-surface px-4 py-3.5">
            <dt className="text-[12px] text-ink-3">{k}</dt>
            <dd className={cn('tnum mt-1 text-[24px] font-semibold', warn && 'text-review')}>{v as number}</dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Section title="Needs scrutiny" description="Decisions that differ from the system assessment, and high findings an officer dismissed.">
            {data.tasks.length === 0 ? <EmptyState title="Nothing flagged for scrutiny" body="No decision went against the system assessment and no high finding was dismissed." /> : (
              <ul className="divide-y divide-line">
                {data.tasks.map((t, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 px-5 py-3 text-[13px]">
                    <span>{readableRationale(t.label)}</span>
                    {t.case_id && <Link to={`/auditor/cases/${t.case_id}?tab=decision`} className="text-[12.5px] font-medium text-navy-600 hover:underline">Trace</Link>}
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <DecisionsList decisions={data.recent_decisions} />
        </div>
        <ChainExplainer className="h-fit" />
      </div>
    </div>
  )
}

function DecisionsList({ decisions }: { decisions: AuditorHome['recent_decisions'] }) {
  return (
    <Section title="Recent decisions">
      {decisions.length === 0 ? <EmptyState title="No decisions recorded yet" /> : (
        <ul className="divide-y divide-line">
          {decisions.map(d => (
            <li key={d.seq} className="grid gap-2 px-5 py-3.5 md:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <StatusPill size="sm" kind={d.decision === 'QUALIFIED' ? 'met' : 'not_met'} label={d.decision === 'QUALIFIED' ? 'Qualified' : 'Disqualified'} />
                  {d.against_ai && <StatusPill size="sm" kind="review" label="Against system assessment" />}
                </p>
                <p className="mt-1 text-[13px] text-ink-2">{d.description.replace(/^(QUALIFIED|DISQUALIFIED):\s*/, '')}</p>
                <p className="mt-1 text-[12px] text-ink-3">
                  {formatDateTime(d.at)}, system assessment: {d.ai_recommendation ? RECOMMENDATION_LABEL[d.ai_recommendation] : 'none'}
                  {d.upheld_high.length > 0 && `, upheld: ${d.upheld_high.map(c => findingTitle(c, c)).join(', ')}`}
                </p>
                <p className="mt-0.5 text-[12px] text-ink-4">Entry {d.seq}, hash <Mono className="text-[12px]">{shortHash(d.row_hash, 16)}</Mono></p>
              </div>
              <Link to={`/auditor/cases/${d.case_id}?tab=decision`} className="inline-flex items-center gap-1 self-start text-[12.5px] font-medium text-navy-600 hover:underline">Trace <ArrowRight className="size-3.5" aria-hidden /></Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

export function AuditorDecisionsPage() {
  const res = useResource('home', () => home())
  return (
    <div>
      <PageHeader eyebrow="Oversight" title="Decisions" description="Every qualification decision with its reason, the system assessment it agreed or disagreed with, and its audit anchor." />
      <Loadable resource={res} what="decisions">{d => <DecisionsList decisions={(d as AuditorHome).recent_decisions} />}</Loadable>
    </div>
  )
}

export function FindingRulingsPage() {
  const feed = useResource('audit:feed:FINDING_DISPOSITION', () => audit.feed({ action: 'FINDING_DISPOSITION', limit: 300 }))
  const queue = useResource('queue:all', () => cases.queue())
  const caseName = useMemo(() => Object.fromEntries((queue.data ?? []).map(q => [q.case_id, q.bidder_name])), [queue.data])
  return (
    <div>
      <PageHeader eyebrow="Oversight" title="Finding rulings" description="Each time an officer upheld or dismissed a finding. Dismissals carry the officer's written reason." />
      <Loadable resource={feed} what="finding rulings">
        {rows => rows.length === 0 ? <div className="card"><EmptyState title="No rulings recorded yet" body="Rulings appear here as officers review high findings." /></div> : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[820px] text-[13px]">
              <thead className="bg-subtle text-left text-[12px] uppercase tracking-[0.05em] text-ink-3">
                <tr><th className="px-5 py-2.5 font-medium">When</th><th className="px-3 py-2.5 font-medium">Bidder</th><th className="px-3 py-2.5 font-medium">Finding</th><th className="px-3 py-2.5 font-medium">Ruling</th><th className="px-3 py-2.5 font-medium">Reason</th><th className="px-5 py-2.5" /></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map(e => {
                  const outcome = String(e.metadata.outcome ?? '')
                  const code = String(e.metadata.code ?? '')
                  return (
                    <tr key={e.id} className="align-top">
                      <td className="whitespace-nowrap px-5 py-3 text-ink-2">{formatDateTime(e.created_at)}</td>
                      <td className="px-3 py-3">{(e.entity_id && caseName[e.entity_id]) ?? 'Case'}</td>
                      <td className="px-3 py-3"><span className="font-medium">{findingTitle(code, code)}</span> <span className="text-[12px] text-ink-3">{String(e.metadata.severity ?? '')}</span></td>
                      <td className="px-3 py-3"><StatusText kind={outcome === 'UPHELD' ? 'finding' : 'not_required'} label={outcome === 'UPHELD' ? 'Upheld' : 'Dismissed'} /></td>
                      <td className="max-w-sm px-3 py-3 text-ink-2">{e.description.replace(/^(UPHELD|DISMISSED)\s+\S+:\s*/, '') || <span className="text-ink-4">No note</span>}</td>
                      <td className="px-5 py-3 text-right">{e.entity_id && <Link to={`/auditor/cases/${e.entity_id}?tab=findings`} className="text-[12.5px] font-medium text-navy-600 hover:underline">Trace</Link>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Loadable>
    </div>
  )
}

