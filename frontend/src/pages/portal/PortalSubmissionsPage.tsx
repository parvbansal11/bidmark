import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, FullPageSpinner, EmptyState } from '@/components/ui/Misc'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/RiskBadge'
import * as portalApi from '@/api/portal'
import * as tendersApi from '@/api/tenders'
import { apiErrorMessage } from '@/api/client'
import type { PortalSubmission } from '@/types'
import { formatDate } from '@/lib/utils'
import { Download, Lock } from 'lucide-react'

export function PortalSubmissionsPage() {
  const [submissions, setSubmissions] = useState<PortalSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [bidderId, setBidderId] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([portalApi.getSubmissions(), portalApi.getProfile()])
      .then(([subs, profile]) => {
        setSubmissions(subs)
        setBidderId(profile.id)
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleDownloadReceipt(tenderId: string) {
    if (!bidderId) return
    setDownloadingId(tenderId)
    setError(null)
    try {
      await tendersApi.openBidReceiptPdf(tenderId, bidderId)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setDownloadingId(null)
    }
  }

  if (loading) return <FullPageSpinner label="Loading submissions…" />

  return (
    <div className="space-y-4">
      <PageHeader title="Submissions" description="A complete record of what you've submitted for each tender." />

      {error && <p className="text-xs text-red-600">{error}</p>}

      {!submissions.length ? (
        <EmptyState title="No bids submitted yet" description="Once you submit a bid from a tender's page, it will appear here." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Tender</th>
                <th className="px-3 py-2">Technical bid</th>
                <th className="px-3 py-2">Financial bid</th>
                <th className="px-3 py-2">Documents</th>
                <th className="px-3 py-2">Submitted</th>
                <th className="px-3 py-2">Compliance at submission</th>
                <th className="px-3 py-2">Evaluation status</th>
                <th className="px-3 py-2 text-right">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {submissions.map((s) => (
                <tr key={s.tender_id}>
                  <td className="px-3 py-2 font-medium text-slate-800">
                    <Link to={`/my-tenders/${s.tender_id}`} className="hover:underline">
                      {s.tender_title}
                    </Link>
                    {s.read_only && (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] text-slate-400">
                        <Lock className="h-3 w-3" /> read-only
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2"><StatusBadge status={s.technical_bid_status} /></td>
                  <td className="px-3 py-2">{s.financial_bid_status === 'NOT_APPLICABLE' ? <span className="text-xs text-slate-400">—</span> : <StatusBadge status={s.financial_bid_status} />}</td>
                  <td className="px-3 py-2">{s.documents_submitted}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">{formatDate(s.submitted_at)}</td>
                  <td className="px-3 py-2">{s.compliance_at_submission !== null ? `${s.compliance_at_submission}%` : '—'}</td>
                  <td className="px-3 py-2">
                    <Badge tone={s.evaluation_status === 'QUALIFIED' ? 'success' : s.evaluation_status === 'DISQUALIFIED' ? 'danger' : 'muted'}>
                      {s.evaluation_status.replace(/_/g, ' ')}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!bidderId || downloadingId === s.tender_id}
                      onClick={() => handleDownloadReceipt(s.tender_id)}
                    >
                      <Download className="h-3.5 w-3.5" /> {downloadingId === s.tender_id ? 'Preparing…' : 'PDF'}
                    </Button>
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
