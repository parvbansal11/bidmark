import { useEffect, useState } from 'react'
import { PageHeader, FullPageSpinner, Section, DataRow, Alert } from '@/components/ui/Misc'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input, Label, Select, Textarea } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import * as portalApi from '@/api/portal'
import * as bidderApi from '@/api/bidders'
import type { Bidder } from '@/types'
import { formatDateOnly } from '@/lib/utils'
import { apiErrorMessage } from '@/api/client'
import { Lock, PenLine, ShieldCheck } from 'lucide-react'

const VERIFIED_FIELDS: { key: keyof Bidder; label: string }[] = [
  { key: 'company_name', label: 'Company / Organization Name' },
  { key: 'pan_number', label: 'PAN' },
  { key: 'gstin', label: 'GSTIN' },
  { key: 'cin', label: 'CIN' },
  { key: 'udyam_number', label: 'Udyam Registration' },
]

export function PortalProfilePage() {
  const [bidder, setBidder] = useState<Bidder | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editableForm, setEditableForm] = useState({ contact_email: '', contact_phone: '', website: '', registered_address: '' })
  const [savingProfile, setSavingProfile] = useState(false)
  const [correctionOpen, setCorrectionOpen] = useState(false)
  const [correctionForm, setCorrectionForm] = useState({ field: 'pan_number', requested_value: '', reason: '' })
  const [correctionStatus, setCorrectionStatus] = useState<string | null>(null)
  const [savingCorrection, setSavingCorrection] = useState(false)

  function refresh() {
    setLoading(true)
    portalApi
      .getProfile()
      .then((b) => {
        setBidder(b)
        setEditableForm({
          contact_email: b.contact_email ?? '',
          contact_phone: b.contact_phone ?? '',
          website: b.website ?? '',
          registered_address: b.registered_address ?? '',
        })
      })
      .finally(() => setLoading(false))
  }

  useEffect(refresh, [])

  async function handleSaveEditable() {
    if (!bidder) return
    setSavingProfile(true)
    setError(null)
    try {
      const updated = await bidderApi.updateBidder(bidder.id, editableForm)
      setBidder(updated)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleRequestCorrection() {
    if (!bidder) return
    setSavingCorrection(true)
    setCorrectionStatus(null)
    try {
      await portalApi.requestProfileCorrection({
        field: correctionForm.field,
        current_value: (bidder[correctionForm.field as keyof Bidder] as string) ?? null,
        requested_value: correctionForm.requested_value,
        reason: correctionForm.reason,
      })
      setCorrectionStatus('Your correction request has been submitted to the procurement team for review.')
      setCorrectionForm({ field: 'pan_number', requested_value: '', reason: '' })
    } catch (err) {
      setCorrectionStatus(apiErrorMessage(err))
    } finally {
      setSavingCorrection(false)
    }
  }

  if (loading || !bidder) return <FullPageSpinner label="Loading your profile…" />

  return (
    <div className="space-y-6">
      <PageHeader title="Profile" description="Your bidder organization profile." />

      {error && <p className="text-xs text-red-600">{error}</p>}

      <Section
        title="Verified official information"
        description="These identifiers are verified against government records and cannot be edited directly."
        actions={
          <Button size="sm" variant="outline" onClick={() => setCorrectionOpen(true)}>
            <PenLine className="h-3.5 w-3.5" /> Request Correction
          </Button>
        }
      >
        <Card>
          <CardContent className="py-4">
            {VERIFIED_FIELDS.map((f) => (
              <DataRow
                key={f.key}
                label={f.label}
                value={
                  <span className="inline-flex items-center gap-1.5">
                    {(bidder[f.key] as string) ?? '—'}
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                  </span>
                }
              />
            ))}
            <DataRow label="Business type" value={<Badge tone="info">Private Limited</Badge>} />
            <DataRow label="Registration date" value={formatDateOnly(bidder.incorporation_date)} />
          </CardContent>
        </Card>
      </Section>

      <Section title="Editable contact information" description="You can update these details at any time.">
        <Card>
          <CardContent className="grid grid-cols-1 gap-3 py-4 sm:grid-cols-2">
            <div>
              <Label>Contact email</Label>
              <Input value={editableForm.contact_email} onChange={(e) => setEditableForm({ ...editableForm, contact_email: e.target.value })} />
            </div>
            <div>
              <Label>Contact phone</Label>
              <Input value={editableForm.contact_phone} onChange={(e) => setEditableForm({ ...editableForm, contact_phone: e.target.value })} />
            </div>
            <div>
              <Label>Website</Label>
              <Input value={editableForm.website} onChange={(e) => setEditableForm({ ...editableForm, website: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>Registered address</Label>
              <Textarea value={editableForm.registered_address} onChange={(e) => setEditableForm({ ...editableForm, registered_address: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Button onClick={handleSaveEditable} disabled={savingProfile}>
                {savingProfile ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </Section>

      <Dialog open={correctionOpen} onClose={() => setCorrectionOpen(false)} title="Request a correction">
        <div className="space-y-3">
          <div>
            <Label>Field</Label>
            <Select value={correctionForm.field} onChange={(e) => setCorrectionForm({ ...correctionForm, field: e.target.value })}>
              {VERIFIED_FIELDS.map((f) => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Requested value</Label>
            <Input value={correctionForm.requested_value} onChange={(e) => setCorrectionForm({ ...correctionForm, requested_value: e.target.value })} />
          </div>
          <div>
            <Label>Reason (optional)</Label>
            <Textarea value={correctionForm.reason} onChange={(e) => setCorrectionForm({ ...correctionForm, reason: e.target.value })} />
          </div>
          <Alert tone="info">
            <Lock className="mr-1 inline h-3 w-3" /> This does not change your record immediately — it is sent to the procurement team for review.
          </Alert>
          {correctionStatus && <p className="text-xs text-slate-600">{correctionStatus}</p>}
          <Button className="w-full" disabled={savingCorrection || !correctionForm.requested_value} onClick={handleRequestCorrection}>
            {savingCorrection ? 'Submitting…' : 'Submit request'}
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
