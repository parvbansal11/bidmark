/**
 * Bidder Portal — BIDMARK Verification Status page.
 *
 * Shows a simplified, bidder-friendly view of the BIDMARK analysis.
 * No internal module names or technical jargon are exposed.
 * Action items are phrased in plain language.
 */
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  CheckCircle2, AlertCircle, XCircle, Clock,
  FileText, Building2, ShieldCheck, AlertTriangle,
} from 'lucide-react'
import * as bidmarkApi from '@/api/bidmark'
import * as portalApi from '@/api/portal'
import { Alert } from '@/components/ui/Misc'
import { apiErrorMessage } from '@/api/client'
import type { BidmarkSummary } from '@/types/bidmark'
import { useAuth } from '@/context/AuthContext'

// ── status helpers ────────────────────────────────────────────────────────────

const OVERALL_CONFIG: Record<string, { icon: typeof CheckCircle2; bg: string; text: string; border: string; label: string }> = {
  'Looking Good': {
    icon: CheckCircle2,
    bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200',
    label: 'Looking Good',
  },
  'Some Items Need Attention': {
    icon: AlertCircle,
    bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200',
    label: 'Some Items Need Attention',
  },
  'Action Required': {
    icon: XCircle,
    bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200',
    label: 'Action Required',
  },
}

const CATEGORY_ICON: Record<string, typeof CheckCircle2> = {
  entity_status: Building2,
  compliance_status: ShieldCheck,
  document_status: FileText,
}

const CATEGORY_LABEL: Record<string, string> = {
  entity_status: 'Business Registration',
  compliance_status: 'Compliance Status',
  document_status: 'Documents',
}

function categoryStatusIcon(status: string) {
  if (status.toLowerCase().includes('confirm') || status.toLowerCase().includes('clear') || status.toLowerCase().includes('compliant')) {
    return { icon: CheckCircle2, color: 'text-emerald-600' }
  }
  if (status.toLowerCase().includes('issue') || status.toLowerCase().includes('risk')) {
    return { icon: XCircle, color: 'text-red-600' }
  }
  return { icon: AlertCircle, color: 'text-amber-600' }
}

// ── main component ────────────────────────────────────────────────────────────

export function PortalBidmarkStatusPage() {
  const { tenderId } = useParams<{ tenderId: string }>()
  const { user } = useAuth()

  const [summary, setSummary] = useState<BidmarkSummary | null>(null)
  const [bidderId, setBidderId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!tenderId || !user) return

    async function load() {
      try {
        const profile = await portalApi.getProfile()
        const bid = (profile as unknown as Record<string, string>)['id'] || ''
        if (!bid) throw new Error('Could not determine your bidder profile.')
        setBidderId(bid)
        const res = await bidmarkApi.getBidderSummary(bid, tenderId!)
        setSummary(res)
      } catch (err) {
        setError(apiErrorMessage(err))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [tenderId, user])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto p-4">
        <Alert tone="danger">{error}</Alert>
      </div>
    )
  }

  if (!summary) {
    return (
      <div className="max-w-xl mx-auto p-4 text-center">
        <Clock className="h-12 w-12 text-slate-300 mx-auto mb-3" />
        <p className="font-medium text-slate-700 mb-1">Verification in Progress</p>
        <p className="text-sm text-slate-500">
          Your documents are being reviewed. The Procurement Officer will notify you once
          the verification is complete. No action is required from you at this time.
        </p>
      </div>
    )
  }

  const overallCfg = OVERALL_CONFIG[summary.overall_status] ?? OVERALL_CONFIG['Some Items Need Attention']
  const OverallIcon = overallCfg.icon

  const categories = [
    { key: 'entity_status', value: summary.entity_status },
    { key: 'compliance_status', value: summary.compliance_status },
    { key: 'document_status', value: summary.document_status },
  ]

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-5">
      <div>
        <h1 className="text-lg font-bold text-slate-900">My Verification Status</h1>
        <p className="text-sm text-slate-500">
          Your submission is being reviewed by the Procurement Officer.
        </p>
      </div>

      {/* Overall status */}
      <div className={`rounded-xl border-2 p-5 ${overallCfg.bg} ${overallCfg.border}`}>
        <div className="flex items-start gap-3">
          <OverallIcon className={`h-8 w-8 mt-0.5 ${overallCfg.text}`} />
          <div>
            <p className={`text-lg font-bold ${overallCfg.text}`}>{overallCfg.label}</p>
            <p className="text-sm text-slate-700 mt-1">{summary.overall_message}</p>
          </div>
        </div>
      </div>

      {/* Category breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {categories.map(({ key, value }) => {
          const CatIcon = CATEGORY_ICON[key] ?? ShieldCheck
          const { icon: StatusIcon, color } = categoryStatusIcon(value)
          return (
            <div key={key} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex items-center gap-2 mb-1 text-slate-500">
                <CatIcon className="h-3.5 w-3.5" />
                <span className="text-[11px] font-semibold uppercase tracking-wide">{CATEGORY_LABEL[key]}</span>
              </div>
              <div className={`flex items-center gap-1.5 ${color}`}>
                <StatusIcon className="h-4 w-4" />
                <span className="text-sm font-medium text-slate-800">{value}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Action items */}
      {summary.action_items.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Action Items
          </h2>
          <div className="space-y-3">
            {summary.action_items.map((item, i) => (
              <div
                key={i}
                className={`rounded-lg border p-3 ${item.priority === 'URGENT' ? 'border-red-200 bg-red-50' : 'border-amber-100 bg-amber-50'}`}
              >
                <div className="flex items-start gap-2">
                  <span className={`mt-0.5 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full shrink-0 ${item.priority === 'URGENT' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                    {item.priority}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                    <p className="text-xs text-slate-600 mt-0.5">{item.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
          <p className="text-sm font-semibold text-emerald-700">No action items</p>
          <p className="text-xs text-emerald-600 mt-1">
            All checks passed. Wait for the Procurement Officer's decision.
          </p>
        </div>
      )}

      {/* Footer note */}
      <p className="text-xs text-center text-slate-400">
        Verification uses only authorised government APIs and platform documents.
        {summary.completed_at && ` Last updated: ${new Date(summary.completed_at).toLocaleString()}.`}
      </p>
    </div>
  )
}
