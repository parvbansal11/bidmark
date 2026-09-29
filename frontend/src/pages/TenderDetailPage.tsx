import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PageHeader, FullPageSpinner, EmptyState, Section } from '@/components/ui/Misc'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Select, Label } from '@/components/ui/Input'
import { RiskBadge } from '@/components/RiskBadge'
import * as dashboardApi from '@/api/dashboard'
import * as tendersApi from '@/api/tenders'
import * as bidderApi from '@/api/bidders'
import * as verificationApi from '@/api/verification'
import type { TenderDashboard } from '@/api/dashboard'
import type { Bidder } from '@/types'
import { formatDateOnly, titleCase } from '@/lib/utils'
import { apiErrorMessage } from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import { Flag, Play, UserPlus } from 'lucide-react'

export function TenderDetailPage() {
  const { user } = useAuth()
  const { tenderId } = useParams<{ tenderId: string }>()
  const [dashboard, setDashboard] = useState<TenderDashboard | null>(null)
  const [requirements, setRequirements] = useState<Awaited<ReturnType<typeof tendersApi.listRequirements>>>([])
  const [allBidders, setAllBidders] = useState<Bidder[]>([])
  const [loading, setLoading] = useState(true)
  const [linkOpen, setLinkOpen] = useState(false)
  const [selectedBidder, setSelectedBidder] = useState('')
  const [runningId, setRunningId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function refresh() {
    if (!tenderId) return
    setLoading(true)
    Promise.all([dashboardApi.getTenderDashboard(tenderId), tendersApi.listRequirements(tenderId), bidderApi.listBidders()])
      .then(([d, r, b]) => {
        setDashboard(d)
        setRequirements(r)
        setAllBidders(b)
      })
      .finally(() => setLoading(false))
  }

  useEffect(refresh, [tenderId])

  async function handleLinkBidder() {
    if (!tenderId || !selectedBidder) return
    try {
      await tendersApi.addBidderToTender(tenderId, selectedBidder)
      setLinkOpen(false)
      setSelectedBidder('')
      refresh()
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  async function handleRunWorkflow(bidderId: string) {
    if (!tenderId) return
    setRunningId(bidderId)
    try {
      await verificationApi.runFullWorkflow(bidderId, tenderId)
      refresh()
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setRunningId(null)
    }
  }

  if (loading || !dashboard) return <FullPageSpinner label="Loading tender…" />

  const linkedBidderIds = new Set(dashboard.bidders.map((b) => b.bidder_id))
  const availableBidders = allBidders.filter((b) => !linkedBidderIds.has(b.id))

  const canManageTenders = user?.role === 'ADMIN' || user?.role === 'PROCUREMENT_OFFICER'

  async function handleFlagToggle() {
    if (!tenderId || !dashboard) return
    try {
      await tendersApi.flagTender(
        tenderId,
        !dashboard.tender.is_flagged,
        dashboard.tender.is_flagged ? '' : 'Flagged for forensic investigation by procurement officer',
      )
      refresh()
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {dashboard.tender.title}
            {dashboard.tender.is_flagged && (
              <span className="flex items-center gap-1 rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                <Flag className="h-3.5 w-3.5 fill-red-600 text-red-600" /> FLAGGED FOR AUDIT
              </span>
            )}
          </span>
        }
        description={`${dashboard.tender.tender_number} · Deadline ${formatDateOnly(dashboard.tender.deadline)}`}
        actions={
          <div className="flex items-center gap-2">
            {canManageTenders && (
              <Button
                variant={dashboard.tender.is_flagged ? 'danger' : 'outline'}
                onClick={handleFlagToggle}
              >
                <Flag className="h-4 w-4 mr-1" />
                {dashboard.tender.is_flagged ? 'Unflag Tender' : 'Flag Tender'}
              </Button>
            )}
            {user?.role === 'ADMIN' && (
              <Button onClick={() => setLinkOpen(true)}><UserPlus className="h-4 w-4" /> Add bidder</Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Total bidders" value={dashboard.tender.total_bidders} />
        <Metric label="Avg compliance" value={dashboard.tender.average_compliance ?? '—'} />
        <Metric label="High risk" value={dashboard.tender.high_risk_bidders} tone="text-red-600" />
        <Metric label="Review queue" value={dashboard.tender.review_queue} tone="text-amber-600" />
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <Section title="Requirements" description={`${requirements.length} requirement(s) defined for this tender`}>
        <div className="flex flex-wrap gap-2">
          {requirements.map((r) => (
            <span key={r.id} className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600">
              {titleCase(r.requirement_type)} {r.is_mandatory ? '' : '(optional)'} {r.threshold ? `≥ ${r.threshold}${r.threshold_unit ?? ''}` : ''}
            </span>
          ))}
        </div>
      </Section>

      <Section title="Bidders on this tender">
        {!dashboard.bidders.length ? (
          <EmptyState title="No bidders linked yet" description="Add a bidder to begin verification." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Bidder</th>
                  <th className="px-3 py-2">Score</th>
                  <th className="px-3 py-2">Risk</th>
                  <th className="px-3 py-2">Forensic</th>
                  <th className="px-3 py-2">Behavior</th>
                  <th className="px-3 py-2">AI Recommendation</th>
                  <th className="px-3 py-2">Decision</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dashboard.bidders.map((b) => (
                  <tr key={b.bidder_id}>
                    <td className="px-3 py-2 font-medium text-slate-800">{b.company_name}</td>
                    <td className="px-3 py-2">{b.compliance_score ?? '—'}</td>
                    <td className="px-3 py-2"><RiskBadge level={b.risk_level} /></td>
                    <td className="px-3 py-2"><RiskBadge level={b.forensic_risk} /></td>
                    <td className="px-3 py-2"><RiskBadge level={b.behavior_risk} /></td>
                    <td className="px-3 py-2 text-xs">{b.ai_recommendation ? b.ai_recommendation.replace(/_/g, ' ') : '—'}</td>
                    <td className="px-3 py-2 text-xs">{b.officer_decision ?? '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" disabled={runningId === b.bidder_id} onClick={() => handleRunWorkflow(b.bidder_id)}>
                          <Play className="h-3.5 w-3.5" /> {runningId === b.bidder_id ? 'Running…' : 'Run'}
                        </Button>
                        <Link to={`/bidders/${b.bidder_id}/tenders/${tenderId}`}>
                          <Button size="sm">View 360°</Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Dialog open={linkOpen} onClose={() => setLinkOpen(false)} title="Add bidder to tender">
        <div className="space-y-3">
          <div>
            <Label>Bidder</Label>
            <Select value={selectedBidder} onChange={(e) => setSelectedBidder(e.target.value)}>
              <option value="">Select a bidder…</option>
              {availableBidders.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.company_name}
                </option>
              ))}
            </Select>
          </div>
          {!availableBidders.length && (
            <p className="text-xs text-slate-500">
              All existing bidders are already linked to this tender. Create a new bidder from the{' '}
              <Link to="/bidders" className="text-blue-600 underline">
                Bidders page
              </Link>
              .
            </p>
          )}
          <Button onClick={handleLinkBidder} disabled={!selectedBidder} className="w-full">
            Add bidder
          </Button>
        </div>
      </Dialog>
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className={`text-xl font-semibold ${tone ?? 'text-slate-900'}`}>{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </CardContent>
    </Card>
  )
}
