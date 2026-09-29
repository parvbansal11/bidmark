import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, FullPageSpinner, EmptyState, ProgressBar } from '@/components/ui/Misc'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import * as portalApi from '@/api/portal'
import type { PortalDashboard } from '@/types'
import { formatDate, formatDateOnly } from '@/lib/utils'
import { ActionItemRow } from '@/components/portal/ActionItemRow'
import { FileStack, FolderCheck, ShieldCheck, AlertCircle, ArrowRight, Bell } from 'lucide-react'

export function PortalDashboardPage() {
  const [data, setData] = useState<PortalDashboard | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    portalApi.getDashboard().then(setData).finally(() => setLoading(false))
  }, [])

  if (loading || !data) return <FullPageSpinner label="Loading your dashboard…" />

  return (
    <div className="space-y-6">
      <PageHeader title={`Welcome, ${data.welcome_name}`} description="Your bid compliance overview across all tenders you're participating in." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={FileStack} label="Active tenders" value={data.summary.active_tenders} />
        <StatCard icon={FolderCheck} label="Documents submitted" value={data.summary.documents_submitted} />
        <StatCard
          icon={ShieldCheck}
          label="Overall compliance"
          value={data.summary.overall_compliance_percent !== null ? `${data.summary.overall_compliance_percent}%` : '—'}
          tone="text-blue-600"
        />
        <StatCard icon={AlertCircle} label="Actions required" value={data.summary.actions_required} tone={data.summary.actions_required > 0 ? 'text-red-600' : 'text-emerald-600'} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Action required</CardTitle>
            <Link to="/action-required" className="text-xs font-medium text-blue-600 hover:underline">
              View all <ArrowRight className="inline h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {!data.action_required.length ? (
              <EmptyState title="Nothing needs your attention" description="All your submitted documents and information are in good standing." />
            ) : (
              <div className="divide-y divide-slate-100">
                {data.action_required.map((item, i) => (
                  <ActionItemRow key={i} item={item} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-1.5"><Bell className="h-4 w-4" /> Recent notifications</CardTitle>
            <Link to="/notifications" className="text-xs font-medium text-blue-600 hover:underline">
              All
            </Link>
          </CardHeader>
          <CardContent>
            {!data.recent_notifications.length ? (
              <EmptyState title="No notifications yet" />
            ) : (
              <div className="space-y-3">
                {data.recent_notifications.map((n) => (
                  <div key={n.id} className="text-sm">
                    <div className="flex items-center gap-1.5">
                      {!n.is_read && <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />}
                      <p className="font-medium text-slate-800">{n.title}</p>
                    </div>
                    <p className="text-xs text-slate-500">{n.message}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">{formatDate(n.created_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>My tenders</CardTitle>
          <Link to="/my-tenders" className="text-xs font-medium text-blue-600 hover:underline">
            View all <ArrowRight className="inline h-3 w-3" />
          </Link>
        </CardHeader>
        <CardContent>
          {!data.my_tenders.length ? (
            <EmptyState title="You're not participating in any active tenders yet" />
          ) : (
            <div className="space-y-3">
              {data.my_tenders.map((t) => (
                <div key={t.tender_id} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{t.title}</p>
                    <p className="text-xs text-slate-500">{t.tender_number} · Deadline {formatDateOnly(t.deadline)}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <ProgressBar value={t.compliance_percent ?? 0} className="w-32" />
                      <span className="text-xs text-slate-500">{t.compliance_percent !== null ? `${t.compliance_percent}% compliant` : 'Not yet evaluated'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={t.bid_status === 'SUBMITTED' ? 'success' : t.bid_status === 'CLOSED' ? 'muted' : 'info'}>{t.bid_status.replace(/_/g, ' ')}</Badge>
                    <Link to={`/my-tenders/${t.tender_id}`}>
                      <Button size="sm" variant="outline">View Details</Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, tone }: { icon: typeof FileStack; label: string; value: number | string; tone?: string }) {
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
