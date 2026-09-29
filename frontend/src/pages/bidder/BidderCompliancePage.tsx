import { useState } from 'react'
import { PageHeader } from '@/components/ui/Misc'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Link } from 'react-router-dom'
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  FileText,
  Building2,
  ArrowRight,
} from 'lucide-react'

interface CategoryCompliance {
  name: string
  score: number
  status: 'Compliant' | 'Partially compliant' | 'Missing' | 'Expired' | 'Pending verification'
  details: string
}

interface TenderCompliance {
  id: string
  title: string
  tender_number: string
  score: number
  issues: { requirement: string; status: string; reason: string }[]
}

const CATEGORY_SCORES: CategoryCompliance[] = [
  { name: 'Statutory Compliance', score: 95, status: 'Compliant', details: 'GSTIN and PAN cards verified via Govt APIs.' },
  { name: 'Financial Compliance', score: 80, status: 'Compliant', details: 'ITR and Turnover declarations verified.' },
  { name: 'Eligibility', score: 100, status: 'Compliant', details: 'Udyam MSME and Startup India exemption active.' },
  { name: 'Technical Documents', score: 85, status: 'Partially compliant', details: 'Experience certificates pending seal verification.' },
  { name: 'OEM Authorization', score: 50, status: 'Missing', details: 'Mandatory OEM letter missing for valve manufacturer.' },
  { name: 'Make in India / Local Content', score: 100, status: 'Compliant', details: 'Declared local content >= 65%.' },
]

const TENDER_COMPLIANCE_DATA: TenderCompliance[] = [
  {
    id: 't-105',
    title: 'Supply and Installation of Process Control Valves',
    tender_number: 'CPCL/GEM/2026/105',
    score: 92,
    issues: [
      { requirement: 'OEM Authorization', status: 'Missing', reason: 'Official OEM Authorization letter missing for Manufacturer X.' },
      { requirement: 'GST Registration', status: 'Compliant', reason: 'GSTIN 33AAACA1234F1Z5 verified with 100% match.' },
    ],
  },
  {
    id: 't-[891230]',
    title: 'Petroleum Equipment & Refinery Maintenance Goods',
    tender_number: 'GEM/2026/B/891230',
    score: 74,
    issues: [
      { requirement: 'OEM Authorization', status: 'Missing', reason: 'Manufacturer authorization expired on 01 Mar 2026.' },
      { requirement: 'Experience Certificate', status: 'Expired', reason: 'Submitted experience certificate date exceeds 3 year limit.' },
      { requirement: 'Local Content Declaration', status: 'Compliant', reason: 'Local content declared at 65% (Threshold 50%).' },
    ],
  },
]

export function BidderCompliancePage() {
  const [expandedTenderId, setExpandedTenderId] = useState<string | null>('t-[891230]')

  function toggleTender(id: string) {
    setExpandedTenderId(expandedTenderId === id ? null : id)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compliance Status & Analytics"
        description="Visual overview of statutory, technical, and tender-specific compliance scores across all procurement categories."
      />

      {/* Overall Score Header Banner */}
      <Card className="border-slate-200 bg-gradient-to-r from-slate-900 to-blue-950 text-white">
        <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center md:text-left">
            <span className="inline-block bg-blue-500/20 text-blue-300 text-xs font-semibold px-2.5 py-1 rounded border border-blue-400/30">
              Overall Compliance Rating
            </span>
            <h2 className="text-3xl font-bold tracking-tight">86% Compliant</h2>
            <p className="text-xs text-slate-300 max-w-xl">
              Your overall compliance score is based on automated OCR verification, government registry checks, and tender-specific criteria.
            </p>
          </div>

          <div className="flex items-center justify-center h-28 w-28 rounded-full border-4 border-blue-500/40 bg-white/10 text-3xl font-extrabold text-blue-300 shadow-inner">
            86%
          </div>
        </CardContent>
      </Card>

      {/* Category Breakdowns */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-800">Compliance Breakdown by Category</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {CATEGORY_SCORES.map((cat) => (
            <Card key={cat.name} className="border-slate-200">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-slate-900">{cat.name}</h4>
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                      cat.status === 'Compliant'
                        ? 'bg-emerald-50 text-emerald-700'
                        : cat.status === 'Partially compliant'
                        ? 'bg-blue-50 text-blue-700'
                        : cat.status === 'Expired'
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-red-50 text-red-700'
                    }`}
                  >
                    {cat.status}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-slate-500">Score</span>
                    <span className="text-slate-900">{cat.score}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        cat.score >= 90 ? 'bg-emerald-500' : cat.score >= 70 ? 'bg-blue-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${cat.score}%` }}
                    ></div>
                  </div>
                </div>

                <p className="text-[11px] text-slate-500 pt-1">{cat.details}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Tender-Specific Compliance Scores */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-800">Tender-Specific Compliance Scores</h3>
        <p className="text-xs text-slate-500">
          Compliance requirements vary per tender. Click on any tender below to inspect the issues impacting your eligibility.
        </p>

        <div className="space-y-3">
          {TENDER_COMPLIANCE_DATA.map((tc) => {
            const isExpanded = expandedTenderId === tc.id
            return (
              <Card key={tc.id} className="border-slate-200">
                <CardHeader
                  className="p-4 flex flex-row items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => toggleTender(tc.id)}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-slate-500">Ref: {tc.tender_number}</span>
                      <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                        Score: {tc.score}%
                      </span>
                    </div>
                    <CardTitle className="text-sm font-semibold text-slate-900">{tc.title}</CardTitle>
                  </div>

                  <div className="flex items-center gap-2 text-slate-400">
                    <span className="text-xs text-slate-500 hidden sm:inline">
                      {isExpanded ? 'Hide Breakdown' : 'View Breakdown'}
                    </span>
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="border-t border-slate-100 p-4 space-y-3 bg-slate-50/50">
                    <p className="text-xs font-semibold text-slate-700">Requirement Breakdown for {tc.tender_number}:</p>
                    <div className="space-y-2">
                      {tc.issues.map((issue, idx) => (
                        <div
                          key={idx}
                          className="flex items-start justify-between gap-3 bg-white p-3 rounded border border-slate-200 text-xs"
                        >
                          <div className="space-y-0.5">
                            <span className="font-semibold text-slate-800">{issue.requirement}</span>
                            <p className="text-slate-600">{issue.reason}</p>
                          </div>
                          <span
                            className={`px-2 py-0.5 text-[10px] font-semibold rounded shrink-0 ${
                              issue.status === 'Compliant'
                                ? 'bg-emerald-100 text-emerald-800'
                                : issue.status === 'Expired'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {issue.status}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-end pt-2">
                      <Link to="/action-required">
                        <Button size="sm" className="h-7 text-xs bg-blue-600 hover:bg-blue-700">
                          Resolve Action Items <ArrowRight className="h-3 w-3 ml-1" />
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
