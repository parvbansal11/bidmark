import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, FullPageSpinner, EmptyState } from '@/components/ui/Misc'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { RiskBadge } from '@/components/RiskBadge'
import * as dashboardApi from '@/api/dashboard'
import type { DashboardOverview, ReviewQueueItem, RiskSummary } from '@/api/dashboard'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { AlertTriangle, CheckCircle2, FileStack, Users } from 'lucide-react'

const PIE_COLORS: Record<string, string> = { LOW: '#10b981', MEDIUM: '#f59e0b', HIGH: '#ef4444' }

export function DashboardPage() {
  const [overview, setOverview] = useState<DashboardOverview | null>(null)
  const [queue, setQueue] = useState<ReviewQueueItem[]>([])
  const [risk, setRisk] = useState<RiskSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([dashboardApi.getOverview(), dashboardApi.getReviewQueue(), dashboardApi.getRiskSummary()])
      .then(([o, q, r]) => {
        setOverview(o)
        setQueue(q)
        setRisk(r)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <FullPageSpinner label="Loading dashboard…" />

  const riskPieData = risk ? Object.entries(risk.risk_distribution).map(([name, value]) => ({ name, value })) : []
  const failureData = risk
    ? Object.entries(risk.requirement_failure_frequency).map(([name, value]) => ({ name, value }))
    : []

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Platform-wide compliance and risk overview across all tenders." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={FileStack} label="Active tenders" value={overview?.active_tenders ?? 0} />
        <StatCard icon={Users} label="Total bidders" value={overview?.total_bidders ?? 0} />
        <StatCard icon={CheckCircle2} label="Verified (LOW risk)" value={overview?.verified_bidders ?? 0} tone="text-emerald-600" />
        <StatCard icon={AlertTriangle} label="High risk" value={overview?.high_risk ?? 0} tone="text-red-600" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Risk distribution across bidder evaluations</CardTitle>
          </CardHeader>
          <CardContent>
            {riskPieData.some((d) => d.value > 0) ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={riskPieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {riskPieData.map((d) => (
                      <Cell key={d.name} fill={PIE_COLORS[d.name] ?? '#94a3b8'} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="No compliance reports yet" description="Run an evaluation on a bidder to see the risk distribution." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Most frequently failed requirements</CardTitle>
          </CardHeader>
          <CardContent>
            {failureData.length ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={failureData} layout="vertical" margin={{ left: 24 }}>
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#2563eb" radius={4} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="No failures recorded yet" />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Review queue (top priority)</CardTitle>
        </CardHeader>
        <CardContent>
          {!queue.length && <EmptyState title="Nothing awaiting review" description="All evaluated bidders are currently LOW risk." />}
          <div className="divide-y divide-slate-100">
            {queue.slice(0, 8).map((item) => (
              <Link
                key={`${item.bidder_id}-${item.tender_id}`}
                to={`/bidders/${item.bidder_id}/tenders/${item.tender_id}`}
                className="flex items-center justify-between gap-3 py-2.5 text-sm hover:bg-slate-50"
              >
                <div>
                  <p className="font-medium text-slate-800">{item.bidder_name}</p>
                  <p className="text-xs text-slate-500">{item.tender_title} — {item.reason}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">{item.overall_score}/100</span>
                  <RiskBadge level={item.risk_level} />
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, tone }: { icon: typeof FileStack; label: string; value: number; tone?: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <div className="rounded-md bg-blue-50 p-2">
          <Icon className={`h-5 w-5 ${tone ?? 'text-blue-600'}`} />
        </div>
        <div>
          <p className={`text-xl font-semibold ${tone ?? 'text-slate-900'}`}>{value}</p>
          <p className="text-xs text-slate-500">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}
