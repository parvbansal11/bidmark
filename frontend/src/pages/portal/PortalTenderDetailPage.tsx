import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { PageHeader, FullPageSpinner, Section, EmptyState, Alert, DataRow } from '@/components/ui/Misc'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Label, Select } from '@/components/ui/Input'
import { StatusBadge } from '@/components/RiskBadge'
import * as tendersApi from '@/api/tenders'
import * as portalApi from '@/api/portal'
import * as documentsApi from '@/api/documents'
import type { BidSubmission, PortalComplianceDetail, PortalDocument, Tender } from '@/types'
import { DOCUMENT_CATEGORIES } from '@/types'
import { formatDate, formatDateOnly, titleCase } from '@/lib/utils'
import { apiErrorMessage } from '@/api/client'
import { Eye, UploadCloud, Zap } from 'lucide-react'

export function PortalTenderDetailPage() {
  const { tenderId } = useParams<{ tenderId: string }>()
  const [tender, setTender] = useState<Tender | null>(null)
  const [compliance, setCompliance] = useState<PortalComplianceDetail | null>(null)
  const [documents, setDocuments] = useState<PortalDocument[]>([])
  const [bid, setBid] = useState<BidSubmission | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [category, setCategory] = useState<string>('GST')
  const [bidForm, setBidForm] = useState({ quoted_price: '', local_content_percent: '', declared_turnover_crore: '' })
  const [submittingBid, setSubmittingBid] = useState(false)
  const [viewingId, setViewingId] = useState<string | null>(null)

  async function refresh() {
    if (!tenderId) return
    const [t, c, docs] = await Promise.all([tendersApi.getTender(tenderId), portalApi.getComplianceDetail(tenderId), portalApi.getMyDocuments()])
    setTender(t)
    setCompliance(c)
    setDocuments(docs)
  }

  useEffect(() => {
    if (!tenderId) return
    setLoading(true)
    ;(async () => {
      try {
        const [t, c, docs] = await Promise.all([tendersApi.getTender(tenderId), portalApi.getComplianceDetail(tenderId), portalApi.getMyDocuments()])
        setTender(t)
        setCompliance(c)
        setDocuments(docs)
        const profile = await portalApi.getProfile()
        try {
          const existingBid = await tendersApi.getBidSubmission(tenderId, profile.id)
          setBid(existingBid)
          setBidForm({
            quoted_price: existingBid.quoted_price?.toString() ?? '',
            local_content_percent: existingBid.local_content_percent?.toString() ?? '',
            declared_turnover_crore: existingBid.declared_turnover_crore?.toString() ?? '',
          })
        } catch {
          setBid(null)
        }
      } finally {
        setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenderId])

  const deadlinePassed = tender?.deadline ? new Date(tender.deadline).getTime() < Date.now() : false
  const relevantDocuments = useMemo(() => documents.filter((d) => !d.tender_id || d.tender_id === tenderId), [documents, tenderId])

  async function handleUpload(file: File) {
    if (!tenderId) return
    setUploading(true)
    setError(null)
    try {
      const profile = await portalApi.getProfile()
      const doc = await documentsApi.uploadDocument(profile.id, category, file, tenderId)
      // Seamless Upload -> Verify workflow: run extraction + verification right away.
      await documentsApi.extractDocument(doc.id)
      await documentsApi.verifyDocument(doc.id)
      refresh()
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  async function handleView(doc: PortalDocument) {
    setViewingId(doc.id)
    setError(null)
    try {
      await documentsApi.viewDocumentFile(doc)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setViewingId(null)
    }
  }

  async function handleSubmitBid() {
    if (!tenderId) return
    setSubmittingBid(true)
    setError(null)
    try {
      const profile = await portalApi.getProfile()
      const payload = {
        quoted_price: bidForm.quoted_price ? Number(bidForm.quoted_price) : undefined,
        local_content_percent: bidForm.local_content_percent ? Number(bidForm.local_content_percent) : undefined,
        declared_turnover_crore: bidForm.declared_turnover_crore ? Number(bidForm.declared_turnover_crore) : undefined,
        status: 'SUBMITTED',
      }
      const result = await tendersApi.submitBid(tenderId, profile.id, payload)
      setBid(result)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setSubmittingBid(false)
    }
  }

  if (loading || !tender || !compliance) return <FullPageSpinner label="Loading tender…" />

  return (
    <div className="space-y-6">
      <PageHeader
        title={tender.title}
        description={`${tender.tender_number}${tender.gem_tender_id ? ` · ${tender.gem_tender_id}` : ''} · ${tender.organization}`}
        actions={
          <Link to={`/my-tenders/${tenderId}/bidmark`}>
            <Button variant="outline" size="sm" className="border-blue-300 text-blue-700 hover:bg-blue-50">
              <Zap className="h-3.5 w-3.5 mr-1.5" />
              My Verification Status
            </Button>
          </Link>
        }
      />

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="py-4">
            <DataRow label="Department" value={tender.department} />
            <DataRow label="Tender type" value={tender.tender_type ? titleCase(tender.tender_type) : '—'} />
            <DataRow label="Category" value={tender.tender_category ? titleCase(tender.tender_category) : '—'} />
            <DataRow label="Mode" value={tender.tender_mode ? titleCase(tender.tender_mode) : '—'} />
            <DataRow label="Bid system" value={tender.bid_system ? titleCase(tender.bid_system) : '—'} />
            <DataRow label="Location" value={tender.location ?? '—'} />
            <DataRow label="Bid validity" value={tender.bid_validity_days ? `${tender.bid_validity_days} days` : '—'} />
            <DataRow label="Submission start" value={formatDateOnly(tender.published_at)} />
            <DataRow label="Submission end" value={formatDateOnly(tender.deadline)} />
          </CardContent>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Section title="Your compliance for this tender" description={compliance.overall_score !== null ? `${compliance.overall_score}% compliant` : 'Not yet evaluated'}>
            {!compliance.requirements.length ? (
              <EmptyState title="Compliance has not been evaluated yet" description="Upload the required documents below to get started." />
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="min-w-full divide-y divide-slate-100 text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Requirement</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {compliance.requirements.map((r) => (
                      <tr key={r.requirement_type}>
                        <td className="px-3 py-2 font-medium text-slate-800">{r.label}</td>
                        <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                        <td className="px-3 py-2 text-xs text-slate-500">{r.explanation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title="Documents" description="Upload documents required for this tender — a verified document is reused automatically wherever eligible.">
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-slate-300 p-3">
              <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-56">
                {DOCUMENT_CATEGORIES.filter((c) => c !== 'DEBARMENT' && c !== 'DIGILOCKER').map((c) => (
                  <option key={c} value={c}>{titleCase(c)}</option>
                ))}
              </Select>
              <input
                type="file"
                className="hidden"
                id="tender-doc-upload"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleUpload(file)
                  e.target.value = ''
                }}
              />
              <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => document.getElementById('tender-doc-upload')?.click()}>
                <UploadCloud className="h-4 w-4" /> {uploading ? 'Uploading…' : 'Upload document'}
              </Button>
            </div>
            <div className="mt-3 space-y-2">
              {!relevantDocuments.length ? (
                <EmptyState title="No documents uploaded for this tender yet" />
              ) : (
                relevantDocuments.map((d) => (
                  <div key={d.id} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-800">{d.label}</p>
                      <p className="truncate text-xs text-slate-500">{d.original_filename}</p>
                    </div>
                    <div className="ml-2 flex items-center gap-2 shrink-0">
                      <StatusBadge status={d.status} />
                      <Button size="sm" variant="outline" disabled={viewingId === d.id} onClick={() => handleView(d)}>
                        <Eye className="h-3.5 w-3.5" /> {viewingId === d.id ? 'Opening…' : 'View'}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Section>

          <Section title="Submit your bid" description="Declare your bid details for this tender.">
            {deadlinePassed && (
              <Alert tone="warning">The submission deadline has passed — this record is now read-only.</Alert>
            )}
            {bid?.status === 'SUBMITTED' && !deadlinePassed && (
              <Alert tone="info">Your bid was submitted on {formatDate(bid.submitted_at)}. You can update it until the deadline.</Alert>
            )}
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label>Quoted price (₹)</Label>
                <Input
                  type="number"
                  disabled={deadlinePassed}
                  value={bidForm.quoted_price}
                  onChange={(e) => setBidForm({ ...bidForm, quoted_price: e.target.value })}
                />
              </div>
              <div>
                <Label>Local content (%)</Label>
                <Input
                  type="number"
                  disabled={deadlinePassed}
                  value={bidForm.local_content_percent}
                  onChange={(e) => setBidForm({ ...bidForm, local_content_percent: e.target.value })}
                />
              </div>
              <div>
                <Label>Declared turnover (₹ crore)</Label>
                <Input
                  type="number"
                  disabled={deadlinePassed}
                  value={bidForm.declared_turnover_crore}
                  onChange={(e) => setBidForm({ ...bidForm, declared_turnover_crore: e.target.value })}
                />
              </div>
            </div>
            <Button className="mt-3" disabled={deadlinePassed || submittingBid} onClick={handleSubmitBid}>
              {submittingBid ? 'Submitting…' : bid ? 'Update bid' : 'Submit bid'}
            </Button>
          </Section>
        </div>
      </div>
    </div>
  )
}
