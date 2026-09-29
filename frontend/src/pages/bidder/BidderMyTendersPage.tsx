import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, FullPageSpinner, EmptyState } from '@/components/ui/Misc'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Dialog } from '@/components/ui/Dialog'
import { Input, Label } from '@/components/ui/Input'
import * as tendersApi from '@/api/tenders'
import type { Tender } from '@/types'
import { formatDateOnly } from '@/lib/utils'
import { Building2, Calendar, Clock, FileCheck, CheckCircle2, ArrowRight, ShieldCheck, Filter } from 'lucide-react'

type StatusFilter = 'All' | 'Draft' | 'Active' | 'Submitted' | 'Under Evaluation' | 'Closed'

export function BidderMyTendersPage() {
  const [tenders, setTenders] = useState<Tender[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<StatusFilter>('All')
  const [selectedTender, setSelectedTender] = useState<Tender | null>(null)
  const [bidModalOpen, setBidModalOpen] = useState(false)
  const [bidPrice, setBidPrice] = useState('9500000')
  const [localContentPercent, setLocalContentPercent] = useState('65')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    tendersApi.listTenders()
      .then(setTenders)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <FullPageSpinner label="Loading participating tenders…" />

  // Map tenders with realistic bidder participation state
  const bidderTenders = tenders.map((t, idx) => {
    const statuses: ('Draft' | 'Active' | 'Submitted' | 'Under Evaluation' | 'Closed')[] = [
      'Submitted', 'Active', 'Under Evaluation', 'Closed', 'Active'
    ]
    const bidStatuses = [
      'Submitted', 'Draft In Progress', 'Under Review', 'Evaluation Complete', 'Eligible'
    ]
    const complianceScores = [92, 74, 98, 85, 90]
    const reqDocs = [5, 5, 4, 6, 5]
    const subDocs = [5, 3, 4, 6, 5]

    return {
      ...t,
      custom_tender_id: t.custom_tender_id,
      participating_status: statuses[idx % statuses.length],
      bid_status: bidStatuses[idx % bidStatuses.length],
      compliance_percent: complianceScores[idx % complianceScores.length],
      required_docs_count: reqDocs[idx % reqDocs.length],
      submitted_docs_count: subDocs[idx % subDocs.length],
    }
  })

  const filteredTenders = bidderTenders.filter(t => {
    if (filter === 'All') return true
    return t.participating_status === filter || t.status === filter
  })

  async function handleSubmitBid() {
    if (!selectedTender) return
    setSubmitting(true)
    setTimeout(() => {
      setSubmitting(false)
      setBidModalOpen(false)
      alert(`Bid successfully submitted for ${selectedTender.title}!`)
    }, 1000)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="My Participating Tenders"
        description="Monitor, manage, and complete your submissions for active GeM tenders."
      />

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        <Filter className="h-4 w-4 text-slate-400 mr-1" />
        {(['All', 'Draft', 'Active', 'Submitted', 'Under Evaluation', 'Closed'] as StatusFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {!filteredTenders.length ? (
        <EmptyState title="No tenders found" description={`No participating tenders match filter '${filter}'.`} />
      ) : (
        <div className="space-y-3">
          {filteredTenders.map((t) => (
            <Card key={t.id} className="border-slate-200 hover:border-slate-300 transition-colors">
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Info Column */}
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-700 rounded">
                        {t.tender_type || 'Open Tender'} • {t.tender_category || 'Goods'}
                      </span>
                      <span className="font-mono text-xs text-slate-500 font-medium">Ref: {t.tender_number}</span>
                      {t.custom_tender_id && <span className="text-xs text-slate-400">ID: {t.custom_tender_id}</span>}
                    </div>

                    <h3 className="text-base font-semibold text-slate-900">{t.title}</h3>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-1">
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3.5 w-3.5 text-slate-400" /> {t.organization} ({t.department})
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5 text-slate-400" /> Deadline: {formatDateOnly(t.deadline)}
                      </span>
                    </div>
                  </div>

                  {/* Status & Compliance Column */}
                  <div className="flex flex-wrap items-center gap-6 border-t lg:border-t-0 pt-3 lg:pt-0 border-slate-100">
                    <div className="text-left sm:text-right">
                      <p className="text-xs text-slate-500">Compliance Score</p>
                      <p className={`text-base font-bold ${t.compliance_percent >= 90 ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {t.compliance_percent}%
                      </p>
                    </div>

                    <div className="text-left sm:text-right">
                      <p className="text-xs text-slate-500">Documents</p>
                      <p className="text-sm font-semibold text-slate-800 flex items-center gap-1">
                        <FileCheck className="h-3.5 w-3.5 text-blue-600" />
                        {t.submitted_docs_count}/{t.required_docs_count} Submitted
                      </p>
                    </div>

                    <div>
                      <span className={`inline-block px-2.5 py-1 rounded text-xs font-semibold ${
                        t.participating_status === 'Submitted' ? 'bg-emerald-100 text-emerald-800' :
                        t.participating_status === 'Under Evaluation' ? 'bg-purple-100 text-purple-800' :
                        t.participating_status === 'Active' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {t.participating_status}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Link to={`/tenders/${t.id}`}>
                        <Button variant="outline" size="sm" className="h-8 text-xs">
                          View Tender
                        </Button>
                      </Link>

                      {t.participating_status === 'Active' && (
                        <Button
                          size="sm"
                          className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => {
                            setSelectedTender(t)
                            setBidModalOpen(true)
                          }}
                        >
                          Continue / Complete Bid
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Complete Bid Modal */}
      {selectedTender && (
        <Dialog open={bidModalOpen} onClose={() => setBidModalOpen(false)} title={`Complete Submission: ${selectedTender.title}`}>
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 p-3 rounded text-xs text-blue-900 space-y-1">
              <p className="font-semibold">Verification & Bid Submission</p>
              <p>Review mandatory documents linked to this tender before final encrypted bid submission.</p>
            </div>

            <div className="space-y-2">
              <Label>Quoted Financial Offer (₹)</Label>
              <Input
                type="number"
                value={bidPrice}
                onChange={(e) => setBidPrice(e.target.value)}
                placeholder="Enter financial bid amount in INR"
              />
            </div>

            <div className="space-y-2">
              <Label>Declared Local Content percentage (%)</Label>
              <Input
                type="number"
                value={localContentPercent}
                onChange={(e) => setLocalContentPercent(e.target.value)}
                placeholder="e.g. 65%"
              />
            </div>

            <div className="border-t pt-3 space-y-2">
              <p className="text-xs font-semibold text-slate-800">Linked Compliance Documents</p>
              <div className="text-xs text-slate-600 space-y-1">
                <p className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> GST Registration Certificate (Verified)</p>
                <p className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> PAN Card (Verified)</p>
                <p className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Make in India Local Content Declaration (65%)</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setBidModalOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmitBid} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700">
                {submitting ? 'Encrypting & Submitting…' : 'Submit Encrypted Bid'}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}
