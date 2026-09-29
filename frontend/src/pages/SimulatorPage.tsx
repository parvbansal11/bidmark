import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, Section, Alert, EmptyState } from '@/components/ui/Misc'
import { Select, Label, Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { RiskBadge } from '@/components/RiskBadge'
import * as tendersApi from '@/api/tenders'
import * as intelligenceApi from '@/api/intelligence'
import type { Requirement, SimulationResult, Tender } from '@/types'
import { apiErrorMessage } from '@/api/client'
import { FlaskConical } from 'lucide-react'

export function SimulatorPage() {
  const [tenders, setTenders] = useState<Tender[]>([])
  const [tenderId, setTenderId] = useState('')
  const [requirements, setRequirements] = useState<Requirement[]>([])
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [result, setResult] = useState<SimulationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    tendersApi.listTenders().then((t) => {
      setTenders(t)
      if (t.length) setTenderId(t[0].id)
    })
  }, [])

  useEffect(() => {
    if (!tenderId) return
    tendersApi.listRequirements(tenderId).then((r) => {
      setRequirements(r.filter((req) => req.threshold !== null && req.threshold !== undefined))
      setOverrides({})
      setResult(null)
    })
  }, [tenderId])

  async function runSimulation() {
    setLoading(true)
    setError(null)
    try {
      const payloadOverrides = Object.entries(overrides)
        .filter(([, v]) => v !== '')
        .map(([requirement_id, v]) => ({ requirement_id, threshold: Number(v) }))
      const data = await intelligenceApi.runSimulation(tenderId, payloadOverrides)
      setResult(data)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="What-If Compliance Simulator" description="Preview the impact of changing a requirement threshold — nothing is written to the real tender (USP 6)." />

      <Section title="Configure simulation">
        <div className="w-64">
          <Label>Tender</Label>
          <Select value={tenderId} onChange={(e) => setTenderId(e.target.value)}>
            {tenders.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </Select>
        </div>

        {!requirements.length ? (
          <p className="mt-3 text-xs text-slate-500">This tender has no threshold-based requirements (e.g. LOCAL_CONTENT, TURNOVER) to simulate.</p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {requirements.map((r) => (
              <div key={r.id}>
                <Label>{r.requirement_type} threshold (current: {r.threshold}{r.threshold_unit ?? ''})</Label>
                <Input
                  type="number"
                  placeholder={String(r.threshold)}
                  value={overrides[r.id] ?? ''}
                  onChange={(e) => setOverrides({ ...overrides, [r.id]: e.target.value })}
                />
              </div>
            ))}
          </div>
        )}

        <Button className="mt-3" onClick={runSimulation} disabled={loading || !tenderId}>
          <FlaskConical className="h-4 w-4" /> {loading ? 'Simulating…' : 'Run simulation'}
        </Button>
        {error && <Alert tone="danger" className="mt-2">{error}</Alert>}
      </Section>

      {result && (
        <Section title="Simulation results" description={result.note}>
          {!result.bidders.length ? (
            <EmptyState title="No bidders linked to this tender" />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Rank</th>
                    <th className="px-3 py-2">Bidder</th>
                    <th className="px-3 py-2">Baseline</th>
                    <th className="px-3 py-2">Simulated</th>
                    <th className="px-3 py-2">Delta</th>
                    <th className="px-3 py-2">Risk</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.bidders.map((b) => (
                    <tr key={b.bidder_id}>
                      <td className="px-3 py-2">#{b.simulated_rank}</td>
                      <td className="px-3 py-2 font-medium text-slate-800">{b.company_name}</td>
                      <td className="px-3 py-2 text-slate-500">{b.baseline_score ?? '—'}</td>
                      <td className="px-3 py-2 font-semibold">{b.simulated_score}</td>
                      <td className={`px-3 py-2 ${(b.score_delta ?? 0) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {b.score_delta !== null ? (b.score_delta > 0 ? `+${b.score_delta}` : b.score_delta) : '—'}
                      </td>
                      <td className="px-3 py-2"><RiskBadge level={b.simulated_risk_level} /></td>
                      <td className="px-3 py-2 text-right">
                        <Link to={`/bidders/${b.bidder_id}/tenders/${tenderId}`} className="text-xs text-blue-600 underline">
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      <Card>
        <CardContent className="py-3 text-xs text-slate-400">
          The simulator never modifies the actual tender or requirement data — it re-evaluates every bidder in memory only.
        </CardContent>
      </Card>
    </div>
  )
}
