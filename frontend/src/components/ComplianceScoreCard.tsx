import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/Misc'
import { RiskBadge } from '@/components/RiskBadge'
import type { ComplianceReport } from '@/types'
import { cn } from '@/lib/utils'

export function ComplianceScoreCard({ report }: { report: ComplianceReport | null | undefined }) {
  if (!report) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Compliance Score</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-500">No evaluation has been run yet.</CardContent>
      </Card>
    )
  }
  const colorClass = report.risk_level === 'LOW' ? 'bg-emerald-500' : report.risk_level === 'MEDIUM' ? 'bg-amber-500' : 'bg-red-500'
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Compliance Score</CardTitle>
        <RiskBadge level={report.risk_level} />
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-2">
          <span className={cn('text-4xl font-bold', report.risk_level === 'LOW' ? 'text-emerald-600' : report.risk_level === 'MEDIUM' ? 'text-amber-600' : 'text-red-600')}>
            {report.overall_score}
          </span>
          <span className="mb-1 text-sm text-slate-400">/ 100</span>
        </div>
        <ProgressBar value={report.overall_score} className="mt-2" colorClass={colorClass} />
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <Stat label="Verified" value={report.verified_count} tone="text-emerald-600" />
          <Stat label="Failed" value={report.failed_count} tone="text-red-600" />
          <Stat label="Pending" value={report.pending_count} tone="text-slate-500" />
          <Stat label="Review" value={report.requires_review_count} tone="text-amber-600" />
        </div>
        {report.critical_issues.length > 0 && (
          <ul className="mt-4 space-y-1 rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">
            {report.critical_issues.map((issue, i) => (
              <li key={i}>• {issue}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-md bg-slate-50 px-2 py-1.5 text-center">
      <div className={cn('text-lg font-semibold', tone)}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  )
}
