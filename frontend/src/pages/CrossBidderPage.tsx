import { useEffect, useState } from 'react'
import { PageHeader, Section, Alert, FullPageSpinner } from '@/components/ui/Misc'
import { Select, Label } from '@/components/ui/Input'
import { Card, CardContent } from '@/components/ui/Card'
import { RelationshipGraph } from '@/components/RelationshipGraph'
import * as tendersApi from '@/api/tenders'
import * as intelligenceApi from '@/api/intelligence'
import type { RelationshipGraph as RelationshipGraphType, Tender } from '@/types'
import { apiErrorMessage } from '@/api/client'

export function CrossBidderPage() {
  const [tenders, setTenders] = useState<Tender[]>([])
  const [tenderId, setTenderId] = useState('')
  const [graph, setGraph] = useState<RelationshipGraphType | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    tendersApi.listTenders().then((t) => {
      setTenders(t)
      if (t.length) setTenderId(t[0].id)
      else setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!tenderId) return
    setLoading(true)
    setError(null)
    intelligenceApi
      .getRelationshipGraph(tenderId)
      .then(setGraph)
      .catch((err) => setError(apiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [tenderId])

  return (
    <div className="space-y-6">
      <PageHeader title="Cross-Bidder Intelligence Graph" description="Relationships that deserve manual review — never proof of collusion (USP 4)." />

      <Section title="Select tender">
        <div className="w-64">
          <Label>Tender</Label>
          <Select value={tenderId} onChange={(e) => setTenderId(e.target.value)}>
            {tenders.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </Select>
        </div>
      </Section>

      {error && <Alert tone="danger">{error}</Alert>}

      <Card>
        <CardContent className="py-6">
          {loading ? <FullPageSpinner /> : graph ? <RelationshipGraph graph={graph} /> : <p className="text-sm text-slate-500">No tender selected.</p>}
        </CardContent>
      </Card>
    </div>
  )
}
