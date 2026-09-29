import type { ReactNode } from 'react'
import { RiskBadge } from '@/components/RiskBadge'
import { ArrowRight } from 'lucide-react'
import type { RedFlagCascadeItem } from '@/types'

export function RedFlagCascade({ items }: { items: RedFlagCascadeItem[] }) {
  if (!items.length) {
    return <p className="text-sm text-slate-500">No discrepancies have cascaded into red flags for this bidder.</p>
  }
  return (
    <div className="space-y-3">
      {items.map((item, idx) => (
        <div key={idx} className="rounded-lg border border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">{item.affected_requirement}</span>
            <RiskBadge level={item.risk_level} />
          </div>
          <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-slate-600">
            <Chip>{item.source_evidence}</Chip>
            <ArrowRight className="h-3 w-3 text-slate-300" />
            <Chip>{item.anomaly}</Chip>
            <ArrowRight className="h-3 w-3 text-slate-300" />
            <Chip tone="amber">{item.review_recommendation}</Chip>
            <ArrowRight className="h-3 w-3 text-slate-300" />
            <Chip tone="blue">{item.officer_action}</Chip>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Score impact: {item.score_impact}</p>
        </div>
      ))}
    </div>
  )
}

function Chip({ children, tone }: { children: ReactNode; tone?: 'amber' | 'blue' }) {
  const cls =
    tone === 'amber' ? 'bg-amber-50 text-amber-700 border-amber-200' : tone === 'blue' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-600 border-slate-200'
  return <span className={`rounded border px-2 py-0.5 ${cls}`}>{children}</span>
}
