import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, FullPageSpinner, EmptyState, ProgressBar } from '@/components/ui/Misc'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import * as portalApi from '@/api/portal'
import type { PortalTenderSummary } from '@/types'
import { formatDateOnly } from '@/lib/utils'

const FILTERS = ['ALL', 'DRAFT', 'ACTIVE', 'SUBMITTED', 'UNDER_EVALUATION', 'CLOSED'] as const

export function PortalMyTendersPage() {
  const [tenders, setTenders] = useState<PortalTenderSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('ALL')

  useEffect(() => {
    setLoading(true)
    portalApi.getMyTenders().then(setTenders).finally(() => setLoading(false))
  }, [])

  const filtered = filter === 'ALL' ? tenders : tenders.filter((t) => t.bid_status === filter || t.status === filter)

  return (
    <div className="space-y-4">
      <PageHeader title="My Tenders" description="Tenders you are participating in." />

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === f ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {f.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {loading ? (
        <FullPageSpinner />
      ) : !filtered.length ? (
        <EmptyState title="No tenders in this category" />
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => (
            <Card key={t.tender_id}>
              <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">{t.title}</p>
                    <Badge tone={t.bid_status === 'SUBMITTED' ? 'success' : t.bid_status === 'CLOSED' ? 'muted' : 'info'}>
                      {t.bid_status.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500">
                    {t.tender_number} {t.gem_tender_id ? `· ${t.gem_tender_id}` : ''} · {t.organization}
                  </p>
                  <p className="text-xs text-slate-400">Submission deadline: {formatDateOnly(t.deadline)}</p>
                  <div className="flex items-center gap-2 pt-1">
                    <ProgressBar value={t.compliance_percent ?? 0} className="w-40" />
                    <span className="text-xs text-slate-500">
                      {t.compliance_percent !== null ? `${t.compliance_percent}% compliant` : 'Not yet evaluated'} · {t.documents_submitted}/{t.documents_required} documents
                    </span>
                  </div>
                </div>
                <Link to={`/my-tenders/${t.tender_id}`}>
                  <Button size="sm">{t.bid_submitted ? 'View Details' : 'Continue Bid'}</Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
