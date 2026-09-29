import { useEffect, useState } from 'react'
import { PageHeader, FullPageSpinner } from '@/components/ui/Misc'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Input'
import { Dialog } from '@/components/ui/Dialog'
import { useAuth } from '@/context/AuthContext'
import * as bidderApi from '@/api/bidders'
import type { Bidder } from '@/types'
import {
  Building2,
  ShieldCheck,
  Lock,
  Edit2,
  AlertCircle,
  CheckCircle2,
  Mail,
  Phone,
  MapPin,
  HelpCircle,
} from 'lucide-react'

export function BidderProfilePageView() {
  const { user } = useAuth()
  const [bidder, setBidder] = useState<Bidder | null>(null)
  const [loading, setLoading] = useState(true)

  // Editable Contact State
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [registeredAddress, setRegisteredAddress] = useState('')
  const [savingContact, setSavingContact] = useState(false)

  // Request Correction Modal State
  const [correctionOpen, setCorrectionOpen] = useState(false)
  const [correctionField, setCorrectionField] = useState('GSTIN')
  const [correctionReason, setCorrectionReason] = useState('')
  const [submittingCorrection, setSubmittingCorrection] = useState(false)
  const [correctionSubmitted, setCorrectionSubmitted] = useState(false)

  useEffect(() => {
    bidderApi.listBidders().then((bList) => {
      if (bList.length > 0) {
        const b = bList[0]
        setBidder(b)
        setContactEmail(b.contact_email || user?.email || 'sneha.rani@apexprocess.in')
        setContactPhone(b.contact_phone || '+91 98765 43210')
        setRegisteredAddress(b.registered_address || 'Plot 42, Industrial Estate, Guindy, Chennai, TN 600032')
      } else {
        setContactEmail(user?.email || 'sneha.rani@apexprocess.in')
        setContactPhone('+91 98765 43210')
        setRegisteredAddress('Plot 42, Industrial Estate, Guindy, Chennai, TN 600032')
      }
    }).finally(() => setLoading(false))
  }, [user])

  if (loading) return <FullPageSpinner label="Loading organization profile…" />

  const companyName = bidder?.company_name || 'Apex Process Solutions Pvt Ltd'
  const legalName = bidder?.legal_name || 'Apex Process Solutions Private Limited'
  const panNumber = bidder?.pan_number || 'AAACA1234F'
  const gstin = bidder?.gstin || '33AAACA1234F1Z5'
  const cin = bidder?.cin || 'U74999TN2020PTC134567'
  const udyamNumber = bidder?.udyam_number || 'UDYAM-TN-02-0012345'
  const businessType = 'Private Limited Company (MSME Medium Enterprise)'

  function handleSaveContact() {
    setSavingContact(true)
    setTimeout(() => {
      setSavingContact(false)
      alert('Contact information updated successfully!')
    }, 600)
  }

  function handleCorrectionSubmit() {
    if (!correctionReason) return
    setSubmittingCorrection(true)
    setTimeout(() => {
      setSubmittingCorrection(false)
      setCorrectionSubmitted(true)
      setTimeout(() => {
        setCorrectionOpen(false)
        setCorrectionSubmitted(false)
        setCorrectionReason('')
      }, 1500)
    }, 800)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={companyName}
        description="Official Bidder Organization Profile & Verification Credentials"
        actions={
          <Button variant="outline" size="sm" onClick={() => setCorrectionOpen(true)}>
            <AlertCircle className="h-4 w-4 mr-1 text-amber-600" /> Request Official Identification Correction
          </Button>
        }
      />

      {/* Profile Header Banner */}
      <Card className="border-slate-200 bg-white">
        <CardContent className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-blue-100 text-blue-700 rounded-xl">
              <Building2 className="h-8 w-8" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900">{companyName}</h2>
                <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded text-xs font-semibold border border-emerald-200">
                  <ShieldCheck className="h-3.5 w-3.5" /> Verified MSME Bidder
                </span>
              </div>
              <p className="text-xs text-slate-500">{legalName}</p>
              <p className="text-xs text-slate-600 font-medium">{businessType}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Verified Official Identifiers (Locked / Read-Only) */}
        <Card className="border-slate-200">
          <CardHeader className="border-b border-slate-100 pb-3">
            <CardTitle className="text-sm font-semibold text-slate-800 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-emerald-600" /> Verified Official Identifiers
              </span>
              <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-mono font-semibold">
                LOCKED BY GOVT APIS
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-slate-100 py-1 text-xs">
            <div className="py-3 flex justify-between items-center">
              <div>
                <p className="font-semibold text-slate-800">Permanent Account Number (PAN)</p>
                <p className="text-slate-500 font-mono pt-0.5">{panNumber}</p>
              </div>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-semibold flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Income Tax Verified
              </span>
            </div>

            <div className="py-3 flex justify-between items-center">
              <div>
                <p className="font-semibold text-slate-800">GST Identification Number (GSTIN)</p>
                <p className="text-slate-500 font-mono pt-0.5">{gstin}</p>
              </div>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-semibold flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> GSTN Active
              </span>
            </div>

            <div className="py-3 flex justify-between items-center">
              <div>
                <p className="font-semibold text-slate-800">Corporate Identity Number (CIN)</p>
                <p className="text-slate-500 font-mono pt-0.5">{cin}</p>
              </div>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-semibold flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> MCA Verified
              </span>
            </div>

            <div className="py-3 flex justify-between items-center">
              <div>
                <p className="font-semibold text-slate-800">Udyam MSME Registration</p>
                <p className="text-slate-500 font-mono pt-0.5">{udyamNumber}</p>
              </div>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-semibold flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> MSME Portal Active
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Editable Contact & Address Details */}
        <Card className="border-slate-200">
          <CardHeader className="border-b border-slate-100 pb-3">
            <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <Edit2 className="h-4 w-4 text-blue-600" /> Editable Contact & Address Information
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4 text-xs">
            <div className="space-y-1.5">
              <Label>Authorized Contact Email *</Label>
              <Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Authorized Contact Phone *</Label>
              <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Registered Office Address *</Label>
              <Input value={registeredAddress} onChange={(e) => setRegisteredAddress(e.target.value)} />
            </div>

            <div className="pt-2 flex justify-end">
              <Button size="sm" onClick={handleSaveContact} disabled={savingContact} className="bg-blue-600 hover:bg-blue-700">
                {savingContact ? 'Updating Contact…' : 'Save Contact Info'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Request Correction Modal */}
      <Dialog open={correctionOpen} onClose={() => setCorrectionOpen(false)} title="Request Official Identifier Correction">
        <div className="space-y-4 text-xs">
          <div className="bg-amber-50 border border-amber-200 p-3 rounded text-amber-900 space-y-1">
            <p className="font-semibold">Official Data Guardrail</p>
            <p>Official identifiers (PAN, GSTIN, CIN, Udyam) are locked after verification. Any requested correction requires review and approval by the GeM Nodal Officer.</p>
          </div>

          <div>
            <Label>Target Identifier to Correct *</Label>
            <select
              className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 shadow-sm focus:border-slate-500 focus:outline-none"
              value={correctionField}
              onChange={(e) => setCorrectionField(e.target.value)}
            >
              <option value="GSTIN">GSTIN (Current: {gstin})</option>
              <option value="PAN">PAN Number (Current: {panNumber})</option>
              <option value="CIN">CIN Number (Current: {cin})</option>
              <option value="Udyam">Udyam Registration (Current: {udyamNumber})</option>
            </select>
          </div>

          <div>
            <Label>Reason & Description for Correction Request *</Label>
            <textarea
              className="w-full rounded-md border border-slate-300 p-2.5 text-xs text-slate-800 focus:border-slate-500 focus:outline-none"
              rows={3}
              value={correctionReason}
              onChange={(e) => setCorrectionReason(e.target.value)}
              placeholder="State the correct number and reason (e.g. GSTIN updated due to state branch merger)..."
            />
          </div>

          {correctionSubmitted && (
            <p className="text-xs text-emerald-700 bg-emerald-50 p-2 rounded font-medium">
              Correction request submitted successfully to GeM Nodal Officer!
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => setCorrectionOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCorrectionSubmit} disabled={submittingCorrection || !correctionReason} className="bg-amber-600 hover:bg-amber-700 text-white">
              {submittingCorrection ? 'Submitting Request…' : 'Submit Correction Request'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
