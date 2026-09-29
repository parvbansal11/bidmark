import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { RiskBadge } from '@/components/RiskBadge'
import { FingerprintIcon, ScanEye } from 'lucide-react'
import type { RiskLevel } from '@/types'

export function ForensicRiskCard({ analyses }: { analyses: { document_id: string; forensic_risk_score: number; risk_level: RiskLevel; evidence: string[] }[] }) {
  const worst = analyses.reduce<RiskLevel>((acc, a) => (a.risk_level === 'HIGH' ? 'HIGH' : acc === 'HIGH' ? acc : a.risk_level === 'MEDIUM' ? 'MEDIUM' : acc), 'LOW')
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><ScanEye className="h-4 w-4" /> Digital Document Forensics</CardTitle>
        <RiskBadge level={analyses.length ? worst : 'LOW'} />
      </CardHeader>
      <CardContent>
        {!analyses.length && <p className="text-sm text-slate-500">No forensic analysis has been run for this bidder's documents yet.</p>}
        <div className="space-y-3">
          {analyses.map((a) => (
            <div key={a.document_id} className="rounded-md border border-slate-100 px-3 py-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700">Document {a.document_id.slice(0, 8)}…</span>
                <span className="flex items-center gap-2">
                  <span className="text-slate-400">score {a.forensic_risk_score}</span>
                  <RiskBadge level={a.risk_level} />
                </span>
              </div>
              {a.evidence.length > 0 && (
                <ul className="mt-1 ml-4 list-disc space-y-0.5 text-xs text-slate-600">
                  {a.evidence.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] italic text-slate-400">
          Signals indicate potential anomalies for manual verification only — never proof of forgery.
        </p>
      </CardContent>
    </Card>
  )
}

export function BehavioralRiskCard({ report }: { report: { score: number; risk_level: RiskLevel; flags: { category: string; indicator: string; evidence: string; confidence: string }[] } | null }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><FingerprintIcon className="h-4 w-4" /> Behavioral Risk Intelligence</CardTitle>
        {report && <RiskBadge level={report.risk_level} />}
      </CardHeader>
      <CardContent>
        {!report && <p className="text-sm text-slate-500">No behavioral analysis has been run yet.</p>}
        {report && (
          <>
            <p className="text-xs text-slate-500">Behavioral risk score: {report.score}/100</p>
            <div className="mt-3 space-y-2">
              {report.flags.map((f, i) => (
                <div key={i} className="rounded-md bg-slate-50 px-3 py-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-700">{f.indicator}</span>
                    <span className="text-slate-400 uppercase">{f.confidence} confidence</span>
                  </div>
                  <p className="mt-0.5 text-slate-600">{f.evidence}</p>
                </div>
              ))}
              {!report.flags.length && <p className="text-xs text-slate-500">No behavioral flags on record.</p>}
            </div>
          </>
        )}
        <p className="mt-3 text-[11px] italic text-slate-400">
          Every flag requires human review — this is a pattern signal, never proof of collusion or wrongdoing.
        </p>
      </CardContent>
    </Card>
  )
}
