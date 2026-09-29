import { useEffect, useState } from 'react'
import { PageHeader, Section, Alert } from '@/components/ui/Misc'
import { Select, Label } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { BehavioralRiskCard } from '@/components/ForensicBehavioralCards'
import * as tendersApi from '@/api/tenders'
import * as bidderApi from '@/api/bidders'
import * as behaviorApi from '@/api/behavior'
import type { Bidder, Tender } from '@/types'
import { apiErrorMessage } from '@/api/client'
import { FingerprintIcon } from 'lucide-react'

export function BehaviorPage() {
  const [tenders, setTenders] = useState<Tender[]>([])
  const [bidders, setBidders] = useState<Bidder[]>([])
  const [tenderId, setTenderId] = useState('')
  const [bidderId, setBidderId] = useState('')
  const [report, setReport] = useState<Awaited<ReturnType<typeof behaviorApi.analyzeBehavior>> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([tendersApi.listTenders(), bidderApi.listBidders()]).then(([t, b]) => {
      setTenders(t)
      setBidders(b)
      if (t.length) setTenderId(t[0].id)
      if (b.length) setBidderId(b[0].id)
    })
  }, [])

  async function runAnalysis() {
    if (!tenderId || !bidderId) return
    setLoading(true)
    setError(null)
    try {
      const data = await behaviorApi.analyzeBehavior(bidderId, tenderId)
      setReport(data)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Behavioral Risk Intelligence" description="Company-level and cross-bidder pattern signals (USP 3) — never proof of wrongdoing." />

      <Section title="Run analysis">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-64">
            <Label>Bidder</Label>
            <Select value={bidderId} onChange={(e) => setBidderId(e.target.value)}>
              {bidders.map((b) => <option key={b.id} value={b.id}>{b.company_name}</option>)}
            </Select>
          </div>
          <div className="w-64">
            <Label>Tender</Label>
            <Select value={tenderId} onChange={(e) => setTenderId(e.target.value)}>
              {tenders.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </Select>
          </div>
          <Button onClick={runAnalysis} disabled={loading || !tenderId || !bidderId}>
            <FingerprintIcon className="h-4 w-4" /> {loading ? 'Analyzing…' : 'Run behavioral analysis'}
          </Button>
        </div>
        {error && <Alert tone="danger">{error}</Alert>}
      </Section>

      {report && (
        <BehavioralRiskCard
          report={{
            score: report.behavioral_risk_score,
            risk_level: report.risk_level,
            flags: (report.flags ?? []).map((f) => ({ category: f.category, indicator: f.indicator, evidence: f.evidence, confidence: f.confidence })),
          }}
        />
      )}
    </div>
  )
}
