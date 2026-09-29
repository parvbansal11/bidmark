import { StatusBadge } from '@/components/RiskBadge'
import { titleCase } from '@/lib/utils'
import type { RequirementEvaluation } from '@/types'

export function RequirementStatusList({ evaluations }: { evaluations: RequirementEvaluation[] }) {
  if (!evaluations.length) {
    return <p className="text-sm text-slate-500">No requirement evaluations available yet.</p>
  }
  return (
    <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
      {evaluations.map((e, idx) => (
        <div key={e.requirement_id ?? idx} className="flex flex-col gap-2 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-900">{titleCase(e.requirement_type)}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">{e.score_contribution}/{e.max_score_contribution} pts</span>
              <StatusBadge status={e.status} />
            </div>
          </div>
          <p className="text-xs text-slate-500">{e.explanation}</p>
          {e.evidence?.length > 0 && (
            <ul className="ml-4 list-disc space-y-0.5 text-xs text-slate-600">
              {e.evidence.map((ev, i) => (
                <li key={i}>{String(ev)}</li>
              ))}
            </ul>
          )}
          {e.discrepancies?.length > 0 && (
            <ul className="ml-4 list-disc space-y-0.5 text-xs text-red-600">
              {e.discrepancies.map((d, i) => (
                <li key={i}>{String(d)}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}
