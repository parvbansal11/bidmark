import { Anchor } from 'lucide-react'
import { cn } from '@/app/lib/cn'
import { formatDateTime } from '@/app/lib/format'
import { auditActionLabel, ROLE_LABEL } from '@/app/lib/labels'
import { useResource } from '@/app/lib/useResource'
import { cases } from '@/app/services/bidmark'
import { SkeletonRows } from '@/app/components/ui/primitives'
import { EmptyState, Loadable } from '@/app/components/ui/states'
import { ChainBanner, ChainExplainer } from '@/app/features/audit/ChainStatus'

const IMPORTANT = new Set(['FINAL_DECISION', 'FINDING_DISPOSITION', 'CASE_SCREENED', 'CLARIFICATION_ANSWERED'])

export function CaseTimeline({ caseId, anchor }: { caseId: string; anchor: string | null }) {
  const res = useResource(`timeline:${caseId}`, () => cases.timeline(caseId))
  return (
    <Loadable resource={res} what="the case timeline" skeleton={<SkeletonRows rows={8} />}>
      {data => (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
            <ChainBanner chain={data.chain} />
            {data.events.length === 0 ? (
              <div className="card"><EmptyState title="No events recorded for this case" /></div>
            ) : (
              <ol className="card relative overflow-hidden py-2" aria-label="Case timeline">
                {data.events.map((ev, i) => {
                  const isAnchor = anchor && ev.row_hash === anchor
                  return (
                    <li key={ev.seq} className={cn('relative grid grid-cols-[92px_20px_minmax(0,1fr)] gap-x-3 px-5 py-2.5', isAnchor && 'bg-navy-50')}>
                      <div className="pt-0.5 text-right">
                        <p className="tnum text-[12.5px] text-ink-3">{formatDateTime(ev.at).split(', ')[1]}</p>
                        <p className="text-[12px] text-ink-4">{formatDateTime(ev.at).split(', ')[0]}</p>
                      </div>
                      <div className="relative flex justify-center">
                        {i < data.events.length - 1 && <span className="absolute top-3 -bottom-5 w-px bg-line-strong" aria-hidden />}
                        <span className={cn('relative mt-1 size-2.5 rounded-full border-2', IMPORTANT.has(ev.action) ? 'border-navy bg-navy' : 'border-line-strong bg-surface')} aria-hidden />
                      </div>
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-x-2 text-[13px]">
                          <span className="font-medium text-ink">{auditActionLabel(ev.action)}</span>
                          <span className="text-[12px] text-ink-3">{ev.actor_role ? ROLE_LABEL[ev.actor_role] : 'System'}</span>
                          {isAnchor && <span className="inline-flex items-center gap-1 rounded-full bg-navy px-2 text-[12px] font-medium leading-5 text-white"><Anchor className="size-3" aria-hidden />Decision anchor</span>}
                        </p>
                        <p className="mt-0.5 break-words text-[12.5px] text-ink-2">{ev.description}</p>
                        <p className="mt-0.5 text-[12px] text-ink-4">Entry {ev.seq}</p>
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
          </div>
          <ChainExplainer className="h-fit" />
        </div>
      )}
    </Loadable>
  )
}
