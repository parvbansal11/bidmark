import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, FullPageSpinner, EmptyState } from '@/components/ui/Misc'
import { RiskBadge } from '@/components/RiskBadge'
import * as dashboardApi from '@/api/dashboard'
import type { ReviewQueueItem } from '@/api/dashboard'
import { ArrowRight } from 'lucide-react'

export function ReviewQueuePage() {
  const [items, setItems] = useState<ReviewQueueItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    dashboardApi.getReviewQueue().then(setItems).finally(() => setLoading(false))
  }, [])

  if (loading) return <FullPageSpinner label="Loading review queue…" />

  return (
    <div className="space-y-4">
      <PageHeader title="Review Queue" description="Bidders whose evaluation requires human attention, ranked by risk." />

      {!items.length ? (
        <EmptyState title="Nothing to review" description="Every evaluated bidder is currently LOW risk with no open issues." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Bidder</th>
                <th className="px-3 py-2">Tender</th>
                <th className="px-3 py-2">Score</th>
                <th className="px-3 py-2">Risk</th>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={`${item.bidder_id}-${item.tender_id}`} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium text-slate-800">{item.bidder_name}</td>
                  <td className="px-3 py-2 text-slate-500">{item.tender_title}</td>
                  <td className="px-3 py-2">{item.overall_score}</td>
                  <td className="px-3 py-2"><RiskBadge level={item.risk_level} /></td>
                  <td className="px-3 py-2 text-xs text-slate-500">{item.reason}</td>
                  <td className="px-3 py-2 text-right">
                    <Link to={`/bidders/${item.bidder_id}/tenders/${item.tender_id}`} className="inline-flex items-center gap-1 text-xs font-medium text-blue-600">
                      Investigate <ArrowRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
