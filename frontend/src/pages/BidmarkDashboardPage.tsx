/**
 * BIDMARK Verification Dashboard — Procurement Officer view.
 *
 * Shows the three-module verdicts (Entity, Compliance, Document Integrity),
 * the Data Science Fusion verdict, Detected Inconsistencies, Explainable AI
 * flags, and the Privacy / Consent Audit trail.
 *
 * The Officer is the final decision-maker.  The APPROVE / REQUEST
 * CLARIFICATION / REJECT buttons map to the existing OfficerDecision endpoint.
 */
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ShieldCheck, ShieldAlert, ShieldX, AlertTriangle,
  ChevronDown, ChevronUp, Lock, Zap, FileSearch,
  CheckCircle2, Clock, XCircle, RefreshCw, Eye, Info,
} from 'lucide-react'
import * as bidmarkApi from '@/api/bidmark'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Misc'
import { apiErrorMessage } from '@/api/client'
import type { BidmarkAnalysis, BidmarkVerdict, BidmarkFusionVerdict, BidmarkCheck, BidmarkFlag, BidmarkInconsistency } from '@/types/bidmark'
import { useAuth } from '@/context/AuthContext'

// ── colour helpers ────────────────────────────────────────────────────────────

const VERDICT_CONFIG: Record<BidmarkVerdict, { label: string; icon: typeof ShieldCheck; bg: string; text: string; border: string }> = {
  VERIFIED:     { label: 'Verified',      icon: ShieldCheck, bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  NEEDS_REVIEW: { label: 'Needs Review',  icon: ShieldAlert, bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200' },
  FLAGGED:      { label: 'Flagged',       icon: ShieldX,     bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200' },
}

const FUSION_CONFIG: Record<BidmarkFusionVerdict, { label: string; bg: string; text: string; border: string; badgeBg: string }> = {
  RECOMMEND_APPROVAL:  { label: 'AI Recommends Approval',    bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-300', badgeBg: 'bg-emerald-100' },
  RECOMMEND_REVIEW:    { label: 'AI Recommends Review',      bg: 'bg-amber-50',   text: 'text-amber-800',   border: 'border-amber-300',   badgeBg: 'bg-amber-100' },
  RECOMMEND_REJECTION: { label: 'AI Recommends Rejection',   bg: 'bg-red-50',     text: 'text-red-800',     border: 'border-red-200',     badgeBg: 'bg-red-100' },
}

const CHECK_STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  PASS:    { icon: CheckCircle2, color: 'text-emerald-600', label: 'Pass' },
  FLAG:    { icon: AlertTriangle, color: 'text-red-600',    label: 'Flag' },
  MISSING: { icon: XCircle,      color: 'text-slate-400',   label: 'Missing' },
  PENDING: { icon: Clock,        color: 'text-amber-500',   label: 'Pending' },
  REVIEW:  { icon: Eye,          color: 'text-amber-600',   label: 'Review' },
}

// ── sub-components ────────────────────────────────────────────────────────────

function VerdictCard({
  label, verdict, confidence, summary, Icon,
}: {
  label: string
  verdict: BidmarkVerdict
  confidence: number
  summary: string
  Icon: React.ElementType
}) {
  const cfg = VERDICT_CONFIG[verdict] ?? VERDICT_CONFIG.NEEDS_REVIEW
  const VIcon = cfg.icon
  return (
    <div className={`rounded-xl border p-4 ${cfg.bg} ${cfg.border}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`h-4 w-4 ${cfg.text}`} />
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <VIcon className={`h-5 w-5 ${cfg.text}`} />
        <span className={`font-bold text-base ${cfg.text}`}>{cfg.label}</span>
        <span className="ml-auto text-xs text-slate-400">{(confidence * 100).toFixed(0)}% confidence</span>
      </div>
      <p className="text-xs text-slate-600 leading-relaxed">{summary}</p>
    </div>
  )
}

function ChecksTable({ checks }: { checks: BidmarkCheck[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-100 text-slate-400 uppercase tracking-wide">
            <th className="text-left py-1.5 pr-3 font-medium">Check</th>
            <th className="text-left py-1.5 pr-3 font-medium">Status</th>
            <th className="text-left py-1.5 pr-3 font-medium">Source</th>
            <th className="text-left py-1.5 font-medium">Note</th>
          </tr>
        </thead>
        <tbody>
          {checks.map((c, i) => {
            const sc = CHECK_STATUS_CONFIG[c.status] ?? CHECK_STATUS_CONFIG.PENDING
            const SIcon = sc.icon
            return (
              <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="py-1.5 pr-3 font-medium text-slate-700 whitespace-nowrap">{c.check}</td>
                <td className="py-1.5 pr-3">
                  <span className={`flex items-center gap-1 ${sc.color}`}>
                    <SIcon className="h-3.5 w-3.5" />
                    {sc.label}
                  </span>
                </td>
                <td className="py-1.5 pr-3 text-slate-400 max-w-[180px] truncate" title={c.source}>{c.source}</td>
                <td className="py-1.5 text-slate-600">{c.note}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Collapsible({ title, count, children, defaultOpen = false }: { title: string; count?: number; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 text-sm font-medium text-slate-700"
        onClick={() => setOpen(o => !o)}
      >
        <span className="flex items-center gap-2">
          {title}
          {count !== undefined && (
            <span className="text-xs bg-slate-200 text-slate-600 rounded-full px-2 py-0.5">{count}</span>
          )}
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  )
}

function InconsistencyList({ items }: { items: BidmarkInconsistency[] }) {
  if (!items.length) return <p className="text-sm text-slate-400 italic">No inconsistencies detected.</p>
  return (
    <div className="space-y-3">
      {items.map((inc, i) => (
        <div key={i} className={`rounded-lg border p-3 ${inc.severity === 'HIGH' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${inc.severity === 'HIGH' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{inc.severity}</span>
            <span className="font-semibold text-sm text-slate-800">{inc.what}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 text-xs text-slate-600 mt-1">
            <div><span className="font-medium text-slate-500">WHERE:</span> {inc.where}</div>
            <div><span className="font-medium text-slate-500">SOURCE:</span> {inc.evidence.source}</div>
            <div className="col-span-2 mt-1"><span className="font-medium text-slate-500">WHY:</span> {inc.why}</div>
            {inc.evidence.value_found !== undefined && (
              <div className="col-span-2"><span className="font-medium text-slate-500">FOUND:</span> {String(inc.evidence.value_found)}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function FlagList({ flags }: { flags: BidmarkFlag[] }) {
  if (!flags.length) return <p className="text-sm text-slate-400 italic">No AI flags raised.</p>
  return (
    <div className="space-y-3">
      {flags.map((f, i) => (
        <div key={i} className={`rounded-lg border p-3 ${f.severity === 'HIGH' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${f.severity === 'HIGH' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{f.severity}</span>
            <span className="font-semibold text-sm text-slate-800">{f.flag}</span>
          </div>
          <dl className="text-xs space-y-1">
            <div className="flex gap-1"><dt className="font-medium text-slate-500 w-28 shrink-0">WHAT:</dt><dd className="text-slate-700">{f.what}</dd></div>
            <div className="flex gap-1"><dt className="font-medium text-slate-500 w-28 shrink-0">WHY:</dt><dd className="text-slate-700">{f.why}</dd></div>
            <div className="flex gap-1"><dt className="font-medium text-slate-500 w-28 shrink-0">WHICH SOURCE:</dt><dd className="text-slate-700">{f.which_source}</dd></div>
            <div className="flex gap-1"><dt className="font-medium text-slate-500 w-28 shrink-0">HOW SERIOUS:</dt><dd className="text-slate-700">{f.how_serious}</dd></div>
            <div className="flex gap-1"><dt className="font-medium text-slate-500 w-28 shrink-0">WHAT TO REVIEW:</dt><dd className="text-slate-700 font-medium">{f.what_to_review}</dd></div>
          </dl>
        </div>
      ))}
    </div>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────

export function BidmarkDashboardPage() {
  const { bidderId, tenderId } = useParams<{ bidderId: string; tenderId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [analysis, setAnalysis] = useState<BidmarkAnalysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    if (!bidderId || !tenderId) return
    try {
      const res = await bidmarkApi.getResult(bidderId, tenderId)
      setAnalysis(res)
    } catch {
      setAnalysis(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [bidderId, tenderId])

  async function handleRun() {
    if (!bidderId || !tenderId) return
    setRunning(true)
    setError(null)
    try {
      const res = await bidmarkApi.runAnalysis(bidderId, tenderId)
      setAnalysis(res)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setRunning(false)
    }
  }

  const fusionCfg = analysis ? (FUSION_CONFIG[analysis.fusion_verdict] ?? FUSION_CONFIG.RECOMMEND_REVIEW) : null

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 p-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Zap className="h-5 w-5 text-blue-600" />
            <h1 className="text-xl font-bold text-slate-900">BIDMARK Verification</h1>
          </div>
          <p className="text-sm text-slate-500">
            Three-module verification · Data Science Fusion · Explainable AI
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>Back</Button>
          <Button size="sm" onClick={handleRun} disabled={running}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${running ? 'animate-spin' : ''}`} />
            {running ? 'Running…' : analysis ? 'Re-run Analysis' : 'Run BIDMARK Analysis'}
          </Button>
        </div>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      {/* Privacy notice */}
      <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-800">
        <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <div>
          <strong>Consent-based and authorised data sources only.</strong>{' '}
          BIDMARK does not access private bank accounts, personal tax returns, SMS, loans, or any data
          outside the scope of authorised government APIs and platform-internal records. Every data
          access is logged in the Privacy Audit Trail below. All government checks are simulated
          (mock) in this demo environment.
        </div>
      </div>

      {!analysis ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <Zap className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium mb-1">No BIDMARK analysis yet</p>
          <p className="text-sm text-slate-400 mb-4">
            Click "Run BIDMARK Analysis" to start the three-module verification.
          </p>
          <Button onClick={handleRun} disabled={running}>
            {running ? 'Running…' : 'Run BIDMARK Analysis'}
          </Button>
        </div>
      ) : (
        <>
          {/* Fusion Verdict banner */}
          {fusionCfg && (
            <div className={`rounded-xl border-2 p-4 ${fusionCfg.bg} ${fusionCfg.border}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-bold uppercase tracking-widest ${fusionCfg.text}`}>
                      Data Science Verdict Fusion
                    </span>
                  </div>
                  <p className={`text-lg font-bold ${fusionCfg.text}`}>{fusionCfg.label}</p>
                  <p className="text-xs text-slate-600 mt-1 max-w-xl">{analysis.fusion_explanation}</p>
                </div>
                <div className="text-right">
                  <span className={`text-2xl font-bold ${fusionCfg.text}`}>
                    {(analysis.fusion_confidence * 100).toFixed(0)}%
                  </span>
                  <p className="text-[10px] text-slate-500">Fusion confidence</p>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-slate-500 italic">
                ⚠️ AI recommendation only — the Procurement Officer makes the final APPROVE / REQUEST CLARIFICATION / REJECT decision.
              </p>
            </div>
          )}

          {/* Three verdict cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <VerdictCard
              label="Module 1 — Entity Registration"
              verdict={analysis.entity_verdict}
              confidence={analysis.entity_confidence}
              summary={analysis.entity_summary}
              Icon={ShieldCheck}
            />
            <VerdictCard
              label="Module 2 — Behavioural / Risk"
              verdict={analysis.compliance_verdict}
              confidence={analysis.compliance_confidence}
              summary={analysis.compliance_summary}
              Icon={Zap}
            />
            <VerdictCard
              label="Module 3 — Document Integrity"
              verdict={analysis.document_verdict}
              confidence={analysis.document_confidence}
              summary={analysis.document_summary}
              Icon={FileSearch}
            />
          </div>

          {/* Detected Inconsistencies */}
          <Collapsible
            title="Detected Inconsistencies"
            count={analysis.detected_inconsistencies.length}
            defaultOpen={analysis.detected_inconsistencies.length > 0}
          >
            <InconsistencyList items={analysis.detected_inconsistencies} />
          </Collapsible>

          {/* Explainable AI Flags */}
          <Collapsible
            title="Explainable AI Flags"
            count={analysis.explainable_flags.length}
            defaultOpen={analysis.explainable_flags.length > 0}
          >
            <FlagList flags={analysis.explainable_flags} />
          </Collapsible>

          {/* Module detail breakdowns */}
          <Collapsible title="Module 1 Detail — Entity Registration Intelligence" defaultOpen={false}>
            <ChecksTable checks={analysis.entity_checks} />
          </Collapsible>

          <Collapsible title="Module 2 Detail — Behavioural / Risk Intelligence" defaultOpen={false}>
            <ChecksTable checks={analysis.compliance_checks} />
          </Collapsible>

          <Collapsible title="Module 3 Detail — Document Intelligence + DigiLocker" defaultOpen={false}>
            <ChecksTable checks={analysis.document_checks} />
          </Collapsible>

          {/* Privacy / Consent Audit Trail */}
          <Collapsible title="Privacy / Consent Audit Trail" count={analysis.consent_audit.length} defaultOpen={false}>
            <div className="space-y-2">
              {analysis.consent_audit.map((e, i) => (
                <div key={i} className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-semibold text-slate-700">{e.data_type}</span>
                      <span className="mx-2 text-slate-300">·</span>
                      <span className="text-slate-500">{e.source}</span>
                    </div>
                    {e.is_mock && (
                      <span className="shrink-0 text-[10px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded font-medium">MOCK</span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 text-slate-500">
                    <span><Lock className="inline h-3 w-3 mr-0.5" />{e.authorization}</span>
                    <span>Purpose: {e.purpose}</span>
                    <span>Accessed: {new Date(e.accessed_at).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </Collapsible>

          {/* PO Action Buttons */}
          {(user?.role === 'PROCUREMENT_OFFICER' || user?.role === 'ADMIN') && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-700 mb-1">Officer Decision</p>
              <p className="text-xs text-slate-500 mb-3">
                You are the final decision-maker. The AI recommendation above is advisory only.
                Use the Bidder 360° view to record your formal decision.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => navigate(`/bidders/${bidderId}/360?tenderId=${tenderId}`)}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                  Open Bidder 360° to Decide
                </Button>
                <Button variant="outline" onClick={() => navigate(-1)}>
                  Back to Tender
                </Button>
              </div>
            </div>
          )}

          {/* Completed timestamp */}
          {analysis.completed_at && (
            <p className="text-center text-xs text-slate-400">
              Analysis completed: {new Date(analysis.completed_at).toLocaleString()}
            </p>
          )}
        </>
      )}
    </div>
  )
}
