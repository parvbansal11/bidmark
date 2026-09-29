import { useEffect, useState } from 'react'
import { PageHeader, FullPageSpinner, EmptyState, ProgressBar } from '@/components/ui/Misc'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/RiskBadge'
import * as portalApi from '@/api/portal'
import * as complianceApi from '@/api/compliance'
import { apiErrorMessage } from '@/api/client'
import type { PortalComplianceDetail, PortalComplianceStatus } from '@/types'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronUp, Download } from 'lucide-react'

const CATEGORY_STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'muted'> = {
  COMPLIANT: 'success',
  PARTIALLY_COMPLIANT: 'warning',
  MISSING: 'danger',
  PENDING_VERIFICATION: 'muted',
}

export function PortalComplianceStatusPage() {
  const [data, setData] = useState<PortalComplianceStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [details, setDetails] = useState<Record<string, PortalComplianceDetail>>({})
  const [bidderId, setBidderId] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([portalApi.getComplianceStatus(), portalApi.getProfile()])
      .then(([status, profile]) => {
        setData(status)
        setBidderId(profile.id)
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleDownload(tenderId: string) {
    if (!bidderId) return
    setDownloadingId(tenderId)
    setError(null)
    try {
      await complianceApi.openComplianceReportPdf(bidderId, tenderId)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setDownloadingId(null)
    }
  }

  async function toggleExpand(tenderId: string) {
    if (expanded === tenderId) {
      setExpanded(null)
      return
    }
    setExpanded(tenderId)
    if (!details[tenderId]) {
      const detail = await portalApi.getComplianceDetail(tenderId)
      setDetails((prev) => ({ ...prev, [tenderId]: detail }))
    }
  }

  if (loading || !data) return <FullPageSpinner label="Loading compliance status…" />

  const overallColor = (data.overall_compliance_percent ?? 0) >= 90 ? 'bg-emerald-500' : (data.overall_compliance_percent ?? 0) >= 50 ? 'bg-amber-500' : 'bg-red-500'

  return (
    <div className="space-y-6">
      <PageHeader title="Compliance Status" description="Your overall compliance posture across every tender you're participating in." />

      {error && <p className="text-xs text-red-600">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Overall Compliance Score</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-2">
            <span className="text-4xl font-bold text-slate-900">{data.overall_compliance_percent ?? '—'}</span>
            {data.overall_compliance_percent !== null && <span className="mb-1 text-sm text-slate-400">%</span>}
          </div>
          <ProgressBar value={data.overall_compliance_percent ?? 0} className="mt-2" colorClass={overallColor} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Compliance by category</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.categories.map((c) => (
            <div key={c.category}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-800">{c.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">{c.percent !== null ? `${c.percent}%` : 'N/A'}</span>
                  <Badge tone={CATEGORY_STATUS_TONE[c.status]}>{c.status.replace(/_/g, ' ')}</Badge>
                </div>
              </div>
              <ProgressBar
                value={c.percent ?? 0}
                className="mt-1.5"
                colorClass={c.status === 'COMPLIANT' ? 'bg-emerald-500' : c.status === 'PARTIALLY_COMPLIANT' ? 'bg-amber-500' : c.status === 'MISSING' ? 'bg-red-500' : 'bg-slate-300'}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tender-specific compliance scores</CardTitle>
        </CardHeader>
        <CardContent>
          {!data.tenders.length ? (
            <EmptyState title="Not participating in any tenders yet" />
          ) : (
            <div className="divide-y divide-slate-100">
              {data.tenders.map((t) => (
                <div key={t.tender_id}>
                  <div className="flex w-full items-center justify-between gap-3 py-3 hover:bg-slate-50">
                    <button onClick={() => toggleExpand(t.tender_id)} className="flex flex-1 items-center justify-between gap-3 text-left">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{t.title}</p>
                        <p className="text-xs text-slate-500">{t.overall_score !== null ? `${t.overall_score}%` : 'Not yet evaluated'}</p>
                      </div>
                      {expanded === t.tender_id ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                    </button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={downloadingId === t.tender_id || !bidderId}
                      onClick={() => handleDownload(t.tender_id)}
                    >
                      <Download className="h-3.5 w-3.5" /> {downloadingId === t.tender_id ? 'Preparing…' : 'PDF'}
                    </Button>
                  </div>
                  {expanded === t.tender_id && details[t.tender_id] && (
                    <div className={cn('space-y-2 pb-4 pl-1 pr-1')}>
                      {!details[t.tender_id].requirements.length ? (
                        <p className="text-xs text-slate-500">No evaluation available yet for this tender.</p>
                      ) : (
                        details[t.tender_id].requirements.map((r) => (
                          <div key={r.requirement_type} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-xs">
                            <div>
                              <p className="font-medium text-slate-800">{r.label}</p>
                              <p className="text-slate-500">{r.explanation}</p>
                            </div>
                            <StatusBadge status={r.status} />
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
