import { useState } from 'react'
import { PageHeader } from '@/components/ui/Misc'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Badge } from '@/components/ui/Badge'
import {
  FileCheck,
  Lock,
  Eye,
  Calendar,
  CheckCircle2,
  Building2,
  ShieldCheck,
  Award,
} from 'lucide-react'

interface SubmissionRecord {
  id: string
  tender_title: string
  tender_number: string
  organization: string
  submission_date: string
  technical_status: 'Submitted & Verified' | 'Pending Verification'
  financial_status: 'Submitted (Encrypted)' | 'Under Sealed Envelope'
  documents_count: number
  compliance_at_submission: number
  evaluation_status: 'Under Technical Evaluation' | 'Qualified (L1 Bidder)' | 'Evaluation Pending'
  deadline_passed: boolean
  quoted_price: string
  submitted_files: string[]
}

const SAMPLE_SUBMISSIONS: SubmissionRecord[] = [
  {
    id: 'sub-1',
    tender_title: 'Supply and Installation of Process Control Valves',
    tender_number: 'CPCL/GEM/2026/105',
    organization: 'Chennai Petroleum Corporation Limited (CPCL)',
    submission_date: '10 Sep 2026, 14:30 IST',
    technical_status: 'Submitted & Verified',
    financial_status: 'Submitted (Encrypted)',
    documents_count: 5,
    compliance_at_submission: 92,
    evaluation_status: 'Under Technical Evaluation',
    deadline_passed: true,
    quoted_price: '₹ 95,00,000',
    submitted_files: [
      'GST_Registration_Certificate_2026.pdf',
      'Company_PAN_Card_Apex.pdf',
      'Udyam_Registration_MSME_Medium.pdf',
      'Make_In_India_Class_1_Local_Content.pdf',
      'Technical_Specification_Datasheet_V1.pdf',
    ],
  },
  {
    id: 'sub-2',
    tender_title: 'Petroleum Equipment & Refinery Maintenance Goods',
    tender_number: 'GEM/2026/B/891230',
    organization: 'Ministry of Petroleum & Natural Gas',
    submission_date: '28 Aug 2026, 11:15 IST',
    technical_status: 'Submitted & Verified',
    financial_status: 'Submitted (Encrypted)',
    documents_count: 6,
    compliance_at_submission: 98,
    evaluation_status: 'Qualified (L1 Bidder)',
    deadline_passed: true,
    quoted_price: '₹ 1,45,00,000',
    submitted_files: [
      'GST_Registration_Certificate_2026.pdf',
      'Company_PAN_Card_Apex.pdf',
      'ITR_Acknowledgement_AY2025-26.pdf',
      'EPFO_ESIC_Challan_Receipt.pdf',
      'OEM_Authorization_Refinery_Pumps.pdf',
      'Past_Supply_Experience_Cert_2025.pdf',
    ],
  },
]

export function BidderSubmissionsPage() {
  const [submissions] = useState<SubmissionRecord[]>(SAMPLE_SUBMISSIONS)
  const [selectedSub, setSelectedSub] = useState<SubmissionRecord | null>(null)
  const [viewOpen, setViewOpen] = useState(false)

  return (
    <div className="space-y-4">
      <PageHeader
        title="My Tender Submissions & Records"
        description="Complete read-only historical record of all technical and financial bids submitted across GeM tenders."
      />

      <div className="space-y-4">
        {submissions.map((sub) => (
          <Card key={sub.id} className="border-slate-200">
            <CardContent className="p-5 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-slate-500 font-medium">Ref: {sub.tender_number}</span>
                    <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Submitted
                    </span>
                    {sub.deadline_passed && (
                      <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded flex items-center gap-1">
                        <Lock className="h-3 w-3" /> Read-Only (Post Deadline)
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-semibold text-slate-900">{sub.tender_title}</h3>
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5 text-slate-400" /> {sub.organization}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => {
                      setSelectedSub(sub)
                      setViewOpen(true)
                    }}
                  >
                    <Eye className="h-3.5 w-3.5 mr-1" /> View Submission Receipt
                  </Button>
                </div>
              </div>

              {/* Submissions Details Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-lg text-xs border border-slate-200">
                <div>
                  <p className="text-slate-500">Technical Bid</p>
                  <p className="font-semibold text-slate-800 pt-0.5">{sub.technical_status}</p>
                </div>

                <div>
                  <p className="text-slate-500">Financial Bid</p>
                  <p className="font-semibold text-slate-800 pt-0.5">{sub.financial_status}</p>
                </div>

                <div>
                  <p className="text-slate-500">Submission Timestamp</p>
                  <p className="font-medium text-slate-800 pt-0.5">{sub.submission_date}</p>
                </div>

                <div>
                  <p className="text-slate-500">Evaluation Status</p>
                  <span className="inline-block mt-0.5 text-[11px] font-semibold bg-purple-100 text-purple-800 px-2 py-0.5 rounded">
                    {sub.evaluation_status}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* View Submission Receipt Modal */}
      {selectedSub && (
        <Dialog open={viewOpen} onClose={() => setViewOpen(false)} title={`Submission Receipt: ${selectedSub.tender_number}`}>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="bg-slate-900 text-white p-4 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-blue-400">Encrypted Submission ID: {selectedSub.id}</span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded font-semibold border border-emerald-400/30">
                  VERIFIED RECEIPT
                </span>
              </div>
              <h4 className="text-sm font-semibold">{selectedSub.tender_title}</h4>
              <p className="text-xs text-slate-300">Submitted on {selectedSub.submission_date}</p>
            </div>

            <div className="space-y-2 border-t pt-3 text-xs">
              <p className="font-semibold text-slate-800">Submitted Financial Figures</p>
              <div className="flex justify-between p-2.5 bg-slate-50 rounded border">
                <span className="text-slate-600">Quoted Total Offer:</span>
                <span className="font-bold text-slate-900">{selectedSub.quoted_price}</span>
              </div>
            </div>

            <div className="space-y-2 border-t pt-3 text-xs">
              <p className="font-semibold text-slate-800">Submitted Compliance Documents ({selectedSub.submitted_files.length})</p>
              <div className="space-y-1.5">
                {selectedSub.submitted_files.map((file, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 rounded border border-slate-200">
                    <span className="text-slate-700 font-mono">{file}</span>
                    <span className="text-[10px] font-semibold text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Encrypted & Stored
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t">
              <Button variant="outline" onClick={() => setViewOpen(false)}>
                Close Receipt
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}
