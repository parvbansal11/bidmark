import { useEffect, useState } from 'react'
import { PageHeader, FullPageSpinner, EmptyState } from '@/components/ui/Misc'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import * as portalApi from '@/api/portal'
import type { PortalActionItems } from '@/types'
import { ActionItemRow } from '@/components/portal/ActionItemRow'
import { CheckCircle2 } from 'lucide-react'

export function PortalActionRequiredPage() {
  const [data, setData] = useState<PortalActionItems | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    portalApi.getActionItems().then(setData).finally(() => setLoading(false))
  }, [])

  if (loading || !data) return <FullPageSpinner label="Loading action items…" />

  return (
    <div className="space-y-6">
      <PageHeader title="Action Required" description="Only the issues that need your attention right now — organized by priority." />

      <Card>
        <CardHeader>
          <CardTitle className="text-red-700">Critical</CardTitle>
        </CardHeader>
        <CardContent>
          {!data.critical.length ? (
            <EmptyState title="No critical issues" description="Nothing here is blocking your bid." />
          ) : (
            <div className="divide-y divide-slate-100">
              {data.critical.map((item, i) => (
                <ActionItemRow key={i} item={item} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-amber-700">Needs attention</CardTitle>
        </CardHeader>
        <CardContent>
          {!data.needs_attention.length ? (
            <EmptyState title="Nothing needs attention" />
          ) : (
            <div className="divide-y divide-slate-100">
              {data.needs_attention.map((item, i) => (
                <ActionItemRow key={i} item={item} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5 text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Completed</CardTitle>
        </CardHeader>
        <CardContent>
          {!data.completed.length ? (
            <EmptyState title="Nothing completed yet" />
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {data.completed.map((item, i) => (
                <div key={i} className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                  <div>
                    <p className="font-medium">{item.title}</p>
                    <p className="text-xs opacity-80">{item.tender_title}</p>
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
