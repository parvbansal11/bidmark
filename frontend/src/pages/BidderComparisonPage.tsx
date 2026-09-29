import { useEffect, useState } from 'react'
import { PageHeader, Section, Alert, FullPageSpinner } from '@/components/ui/Misc'
import { Select, Label } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { RiskBadge } from '@/components/RiskBadge'
import * as tendersApi from '@/api/tenders'
import * as bidderApi from '@/api/bidders'
import * as dashboardApi from '@/api/dashboard'
import * as intelligenceApi from '@/api/intelligence'
import type { Bidder, Bidder360, Tender } from '@/types'
import { apiErrorMessage } from '@/api/client'
import { GitCompare } from 'lucide-react'

export function BidderComparisonPage() {
  const [tenders, setTenders] = useState<Tender[]>([])
  const [bidders, setBidders] = useState<Bidder[]>([])
  const [tenderId, setTenderId] = useState('')
  const [bidderAId, setBidderAId] = useState('')
  const [bidderBId, setBidderBId] = useState('')
  const [dataA, setDataA] = useState<Bidder360 | null>(null)
  const [dataB, setDataB] = useState<Bidder360 | null>(null)
  const [summary, setSummary] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([tendersApi.listTenders(), bidderApi.listBidders()]).then(([t, b]) => {
      setTenders(t)
      setBidders(b)
      if (t.length) setTenderId(t[0].id)
      if (b.length > 1) {
        setBidderAId(b[0].id)
        setBidderBId(b[1].id)
      }
    })
  }, [])

  async function compare() {
    if (!tenderId || !bidderAId || !bidderBId) return
    setLoading(true)
    setError(null)
    setSummary(null)
    try {
      const [a, b] = await Promise.all([
        dashboardApi.getBidder360(bidderAId, tenderId),
        dashboardApi.getBidder360(bidderBId, tenderId),
      ])
      setDataA(a)
      setDataB(b)
      try {
        const res = await intelligenceApi.askCopilot(bidderAId, tenderId, 'Why did this bidder score higher or lower than the comparison bidder?', bidderBId)
        setSummary(res.answer)
      } catch {
        setSummary(null)
      }
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Bidder Comparison" description="Side-by-side compliance comparison between two bidders on the same tender." />

      <Section title="Select bidders to compare">
        <div className="flex flex-wrap items-end gap-3">
          <Picker label="Tender" value={tenderId} onChange={setTenderId} options={tenders.map((t) => ({ value: t.id, label: t.title }))} />
          <Picker label="Bidder A" value={bidderAId} onChange={setBidderAId} options={bidders.map((b) => ({ value: b.id, label: b.company_name }))} />
          <Picker label="Bidder B" value={bidderBId} onChange={setBidderBId} options={bidders.map((b) => ({ value: b.id, label: b.company_name }))} />
          <Button onClick={compare} disabled={loading || !tenderId || !bidderAId || !bidderBId || bidderAId === bidderBId}>
            <GitCompare className="h-4 w-4" /> {loading ? 'Comparing…' : 'Compare'}
          </Button>
        </div>
        {bidderAId && bidderAId === bidderBId && <p className="mt-2 text-xs text-amber-600">Select two different bidders.</p>}
        {error && <Alert tone="danger" className="mt-2">{error}</Alert>}
      </Section>

      {loading && <FullPageSpinner />}

      {dataA && dataB && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <BidderSummaryCard data={dataA} />
          <BidderSummaryCard data={dataB} />
        </div>
      )}

      {summary && (
        <Card>
          <CardHeader>
            <CardTitle>Copilot comparison summary</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600">{summary}</CardContent>
        </Card>
      )}
    </div>
  )
}

function Picker({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="w-56">
      <Label>{label}</Label>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
    </div>
  )
}

function BidderSummaryCard({ data }: { data: Bidder360 }) {
  const report = data.compliance_report
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{data.bidder.company_name}</CardTitle>
        {report && <RiskBadge level={report.risk_level} />}
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p>Score: <span className="font-semibold">{report?.overall_score ?? '—'}</span></p>
        <p>Verified: {report?.verified_count ?? 0} · Failed: {report?.failed_count ?? 0} · Review: {report?.requires_review_count ?? 0}</p>
        <p>AI recommendation: {data.ai_recommendation?.recommendation.replace(/_/g, ' ') ?? '—'}</p>
        <p>Forensic risk: {data.forensic_risk.length ? Math.max(...data.forensic_risk.map((f) => f.forensic_risk_score)) : 0}</p>
        <p>Behavioral risk: {data.behavioral_risk?.risk_level ?? 'LOW'}</p>
      </CardContent>
    </Card>
  )
}
