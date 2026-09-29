import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, FullPageSpinner, EmptyState } from '@/components/ui/Misc'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input, Label, Select, Textarea } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import * as tendersApi from '@/api/tenders'
import { BID_SYSTEM_OPTIONS, TENDER_CATEGORY_OPTIONS, TENDER_MODE_OPTIONS, TENDER_TYPE_OPTIONS } from '@/types'
import type { Tender } from '@/types'
import { formatDateOnly, titleCase } from '@/lib/utils'
import { apiErrorMessage } from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import { Flag, Plus } from 'lucide-react'

const DEFAULT_REQUIREMENTS = [
  { requirement_type: 'GST', description: 'Valid GST registration', is_mandatory: true, evidence_type: 'GST', weight: 1 },
  { requirement_type: 'PAN', description: 'Valid PAN', is_mandatory: true, evidence_type: 'PAN', weight: 1 },
  { requirement_type: 'DEBARMENT', description: 'No active debarment record', is_mandatory: true, evidence_type: 'DEBARMENT', weight: 1 },
]

const EMPTY_TENDER_FORM = {
  title: '',
  tender_number: '',
  gem_tender_id: '',
  organization: 'Ministry of Petroleum & Natural Gas',
  department: 'Chennai Petroleum Corporation Limited (CPCL)',
  tender_type: TENDER_TYPE_OPTIONS[0] as string,
  tender_category: TENDER_CATEGORY_OPTIONS[0] as string,
  tender_mode: TENDER_MODE_OPTIONS[0] as string,
  bid_system: BID_SYSTEM_OPTIONS[0] as string,
  location: '',
  bid_validity_days: '90',
  published_at: '',
  deadline: '',
  description: '',
}

export function TendersPage() {
  const { user } = useAuth()
  const [tenders, setTenders] = useState<Tender[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_TENDER_FORM)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [flagModalOpen, setFlagModalOpen] = useState(false)
  const [selectedTenderForFlag, setSelectedTenderForFlag] = useState<Tender | null>(null)
  const [flagReason, setFlagReason] = useState('Suspicious bidding pattern flagged for officer audit')

  function refresh() {
    setLoading(true)
    tendersApi.listTenders().then(setTenders).finally(() => setLoading(false))
  }

  useEffect(refresh, [])

  const canSubmit =
    form.title && form.tender_number && form.gem_tender_id && form.location && form.published_at && form.deadline && form.bid_validity_days

  async function handleCreate() {
    setSaving(true)
    setError(null)
    try {
      await tendersApi.createTender({
        ...form,
        bid_validity_days: Number(form.bid_validity_days),
        published_at: new Date(form.published_at).toISOString(),
        deadline: new Date(form.deadline).toISOString(),
        requirements: DEFAULT_REQUIREMENTS,
      })
      setOpen(false)
      setForm(EMPTY_TENDER_FORM)
      refresh()
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleFlagTender() {
    if (!selectedTenderForFlag) return
    try {
      await tendersApi.flagTender(
        selectedTenderForFlag.id,
        !selectedTenderForFlag.is_flagged,
        flagReason,
      )
      setFlagModalOpen(false)
      setSelectedTenderForFlag(null)
      refresh()
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  if (loading) return <FullPageSpinner label="Loading tenders…" />

  const canManageTenders = user?.role === 'ADMIN' || user?.role === 'PROCUREMENT_OFFICER'

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tenders"
        description="GeM tenders being tracked for bid compliance verification."
        actions={
          canManageTenders && (
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> New tender
            </Button>
          )
        }
      />

      {!tenders.length && <EmptyState title="No tenders yet" description="Create a tender to start verifying bidder compliance." />}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {tenders.map((t) => (
          <div key={t.id} className="group relative flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-4 transition-shadow hover:shadow-md">
            <Link to={`/tenders/${t.id}`} className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900 group-hover:text-blue-600">{t.title}</p>
                <div className="flex items-center gap-1.5">
                  {t.is_flagged && (
                    <span className="flex items-center gap-1 rounded bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-800">
                      <Flag className="h-3 w-3 fill-red-600 text-red-600" /> FLAGGED
                    </span>
                  )}
                  <Badge tone={t.status === 'ACTIVE' ? 'success' : t.status === 'FLAGGED' ? 'danger' : 'muted'}>{t.status}</Badge>
                </div>
              </div>
              <p className="text-xs font-mono text-slate-500">{t.tender_number}</p>
              <p className="text-xs text-slate-400">{t.department}</p>
              <p className="text-xs text-slate-400">Deadline: {formatDateOnly(t.deadline)}</p>
            </Link>

            {canManageTenders && (
              <div className="mt-3 flex items-center justify-end border-t border-slate-100 pt-2">
                <Button
                  size="sm"
                  variant={t.is_flagged ? 'danger' : 'outline'}
                  className="h-7 text-xs"
                  onClick={(e) => {
                    e.preventDefault()
                    setSelectedTenderForFlag(t)
                    setFlagReason(t.is_flagged ? '' : 'Flagged for compliance and fraud risk investigation')
                    setFlagModalOpen(true)
                  }}
                >
                  <Flag className="h-3 w-3 mr-1" /> {t.is_flagged ? 'Unflag Tender' : 'Flag Tender'}
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} title="Create tender" className="max-w-2xl">
        <div className="grid max-h-[70vh] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Tender title</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Supply of industrial valves" />
          </div>
          <div>
            <Label>Tender reference no.</Label>
            <Input value={form.tender_number} onChange={(e) => setForm({ ...form, tender_number: e.target.value })} placeholder="CPCL/GEM/2026/104" />
          </div>
          <div>
            <Label>Tender ID</Label>
            <Input value={form.gem_tender_id} onChange={(e) => setForm({ ...form, gem_tender_id: e.target.value })} placeholder="GEM/2026/B/1234567" />
          </div>
          <div>
            <Label>Organisation</Label>
            <Input value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })} />
          </div>
          <div>
            <Label>Department</Label>
            <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
          </div>
          <div>
            <Label>Tender type</Label>
            <Select value={form.tender_type} onChange={(e) => setForm({ ...form, tender_type: e.target.value })}>
              {TENDER_TYPE_OPTIONS.map((o) => (
                <option key={o} value={o}>{titleCase(o)}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Tender category</Label>
            <Select value={form.tender_category} onChange={(e) => setForm({ ...form, tender_category: e.target.value })}>
              {TENDER_CATEGORY_OPTIONS.map((o) => (
                <option key={o} value={o}>{titleCase(o)}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Mode of tender</Label>
            <Select value={form.tender_mode} onChange={(e) => setForm({ ...form, tender_mode: e.target.value })}>
              {TENDER_MODE_OPTIONS.map((o) => (
                <option key={o} value={o}>{titleCase(o)}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Bid system</Label>
            <Select value={form.bid_system} onChange={(e) => setForm({ ...form, bid_system: e.target.value })}>
              {BID_SYSTEM_OPTIONS.map((o) => (
                <option key={o} value={o}>{titleCase(o)}</option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Location of work/supply</Label>
            <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Chennai, Tamil Nadu" />
          </div>
          <div>
            <Label>Bid validity (days)</Label>
            <Input type="number" min={1} value={form.bid_validity_days} onChange={(e) => setForm({ ...form, bid_validity_days: e.target.value })} />
          </div>
          <div />
          <div>
            <Label>Bid submission start</Label>
            <Input type="datetime-local" value={form.published_at} onChange={(e) => setForm({ ...form, published_at: e.target.value })} />
          </div>
          <div>
            <Label>Bid submission end</Label>
            <Input type="datetime-local" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-400">Starts with a default GST + PAN + Debarment requirement set — add more from the tender page.</p>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        <Button onClick={handleCreate} disabled={saving || !canSubmit} className="mt-3 w-full">
          {saving ? 'Creating…' : 'Create tender'}
        </Button>
      </Dialog>

      {/* Flag / Unflag Tender Dialog */}
      {selectedTenderForFlag && (
        <Dialog open={flagModalOpen} onClose={() => setFlagModalOpen(false)} title={`${selectedTenderForFlag.is_flagged ? 'Unflag' : 'Flag'} Tender: ${selectedTenderForFlag.title}`}>
          <div className="space-y-4">
            <div className={`p-3 rounded border text-xs space-y-1 ${selectedTenderForFlag.is_flagged ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-red-50 border-red-200 text-red-900'}`}>
              <p className="font-semibold">{selectedTenderForFlag.is_flagged ? 'Lift Tender Flag' : 'Flag Tender for Compliance Review'}</p>
              <p>
                {selectedTenderForFlag.is_flagged
                  ? 'Lifting the flag will restore normal tender status to ACTIVE.'
                  : 'Flagging this tender marks it as under investigation and alerts procurement officers to perform detailed forensic reviews.'}
              </p>
            </div>

            {!selectedTenderForFlag.is_flagged && (
              <div className="space-y-2">
                <Label>Flagging Reason / Officer Note</Label>
                <Textarea
                  value={flagReason}
                  onChange={(e) => setFlagReason(e.target.value)}
                  placeholder="Describe the suspicious pattern, price variance, or document discrepancy..."
                  required
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setFlagModalOpen(false)}>Cancel</Button>
              <Button
                variant={selectedTenderForFlag.is_flagged ? 'default' : 'danger'}
                onClick={handleFlagTender}
              >
                {selectedTenderForFlag.is_flagged ? 'Confirm Unflag' : 'Flag Tender'}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}
