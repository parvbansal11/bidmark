import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, Section, EmptyState, Alert } from '@/components/ui/Misc'
import { Select, Label } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { RiskBadge } from '@/components/RiskBadge'
import * as tendersApi from '@/api/tenders'
import * as forensicsApi from '@/api/forensics'
import type { Tender, FingerprintComparison } from '@/types'
import { apiErrorMessage } from '@/api/client'
import { ScanSearch } from 'lucide-react'

export function ForensicsPage() {
  const [tenders, setTenders] = useState<Tender[]>([])
  const [tenderId, setTenderId] = useState('')
  const [results, setResults] = useState<FingerprintComparison[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    tendersApi.listTenders().then((t) => {
      setTenders(t)
      if (t.length) setTenderId(t[0].id)
    })
  }, [])

  async function runScan() {
    if (!tenderId) return
    setLoading(true)
    setError(null)
    try {
      const data = await forensicsApi.compareTenderDocuments(tenderId, 0.5)
      setResults(data)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Digital Document Forensics" description="Cross-bidder document similarity and fingerprint scanning (USP 1 & 2)." />

      <Section title="Cross-bidder similarity scan" description="Compares same-category documents submitted by different bidders on a tender.">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-64">
            <Label>Tender</Label>
            <Select value={tenderId} onChange={(e) => setTenderId(e.target.value)}>
              {tenders.map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </Select>
          </div>
          <Button onClick={runScan} disabled={loading || !tenderId}>
            <ScanSearch className="h-4 w-4" /> {loading ? 'Scanning…' : 'Run scan'}
          </Button>
        </div>

        {error && <Alert tone="danger">{error}</Alert>}

        {results && (
          results.length ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {results.map((r) => (
                <Card key={r.id}>
                  <CardContent className="space-y-2 py-4 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-700">Similarity: {(r.similarity_score * 100).toFixed(1)}%</span>
                      <RiskBadge level={r.level} />
                    </div>
                    <p className="text-xs text-slate-500">
                      Bidder <Link to={`/bidders/${r.bidder_a_id}`} className="text-blue-600 underline">{r.bidder_a_id.slice(0, 8)}…</Link> vs{' '}
                      <Link to={`/bidders/${r.bidder_b_id}`} className="text-blue-600 underline">{r.bidder_b_id.slice(0, 8)}…</Link>
                    </p>
                    {r.requires_review && <p className="text-xs font-medium text-amber-600">Flagged for manual review</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState title="No similar documents found" description="No document pairs met the similarity threshold for this tender." />
          )
        )}
      </Section>
    </div>
  )
}
