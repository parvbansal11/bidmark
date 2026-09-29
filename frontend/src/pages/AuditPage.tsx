import { useEffect, useState } from 'react'
import { PageHeader, Section, FullPageSpinner } from '@/components/ui/Misc'
import { Select, Label } from '@/components/ui/Input'
import { Card, CardContent } from '@/components/ui/Card'
import { AuditTimeline } from '@/components/AuditTimeline'
import * as tendersApi from '@/api/tenders'
import * as bidderApi from '@/api/bidders'
import * as auditApi from '@/api/audit'
import type { AuditLogEntry, Bidder, Tender } from '@/types'

export function AuditPage() {
  const [tenders, setTenders] = useState<Tender[]>([])
  const [bidders, setBidders] = useState<Bidder[]>([])
  const [tenderId, setTenderId] = useState('')
  const [bidderId, setBidderId] = useState('')
  const [scope, setScope] = useState<'bidder' | 'bidder-tender'>('bidder')
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    Promise.all([tendersApi.listTenders(), bidderApi.listBidders()]).then(([t, b]) => {
      setTenders(t)
      setBidders(b)
      if (t.length) setTenderId(t[0].id)
      if (b.length) setBidderId(b[0].id)
    })
  }, [])

  useEffect(() => {
    if (!bidderId) return
    setLoading(true)
    const promise = scope === 'bidder' ? auditApi.getBidderAuditTrail(bidderId) : auditApi.getAuditTrail(bidderId, tenderId)
    promise.then(setEntries).finally(() => setLoading(false))
  }, [bidderId, tenderId, scope])

  return (
    <div className="space-y-6">
      <PageHeader title="Audit Trail" description="Append-only record of every action taken on a bidder's verification (USP 9)." />

      <Section title="Filter">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-64">
            <Label>Bidder</Label>
            <Select value={bidderId} onChange={(e) => setBidderId(e.target.value)}>
              {bidders.map((b) => <option key={b.id} value={b.id}>{b.company_name}</option>)}
            </Select>
          </div>
          <div className="w-48">
            <Label>Scope</Label>
            <Select value={scope} onChange={(e) => setScope(e.target.value as 'bidder' | 'bidder-tender')}>
              <option value="bidder">All tenders</option>
              <option value="bidder-tender">Specific tender</option>
            </Select>
          </div>
          {scope === 'bidder-tender' && (
            <div className="w-64">
              <Label>Tender</Label>
              <Select value={tenderId} onChange={(e) => setTenderId(e.target.value)}>
                {tenders.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </Select>
            </div>
          )}
        </div>
      </Section>

      <Card>
        <CardContent className="py-4">
          {loading ? <FullPageSpinner /> : <AuditTimeline entries={entries} />}
        </CardContent>
      </Card>
    </div>
  )
}
