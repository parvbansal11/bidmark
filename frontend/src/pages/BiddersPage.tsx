import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, FullPageSpinner, EmptyState } from '@/components/ui/Misc'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import * as bidderApi from '@/api/bidders'
import type { Bidder } from '@/types'
import { Search } from 'lucide-react'

// NOTE: there is deliberately no "Add Bidder" action anywhere on this page,
// for any role (Admin included). Bidder profiles are created automatically
// when a bidder self-registers (see the auth register endpoint) — manual
// bidder creation is not a workflow this product exposes in the UI.

export function BiddersPage() {
  const [bidders, setBidders] = useState<Bidder[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  function refresh(q?: string) {
    setLoading(true)
    bidderApi.listBidders(q ? { q } : undefined).then(setBidders).finally(() => setLoading(false))
  }

  useEffect(() => refresh(), [])

  return (
    <div className="space-y-4">
      <PageHeader title="Bidders" description="Registered bidder profiles across all tenders." />

      <div className="flex items-center gap-2">
        <div className="relative w-72">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            className="pl-8"
            placeholder="Search by company name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && refresh(query)}
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => refresh(query)}>
          Search
        </Button>
      </div>

      {loading ? (
        <FullPageSpinner />
      ) : !bidders.length ? (
        <EmptyState title="No bidders found" />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {bidders.map((b) => (
            <Link key={b.id} to={`/bidders/${b.id}`}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardContent className="space-y-1 py-4">
                  <p className="text-sm font-semibold text-slate-900">{b.company_name}</p>
                  <p className="text-xs text-slate-500">PAN: {b.pan_number ?? '—'}</p>
                  <p className="text-xs text-slate-500">GSTIN: {b.gstin ?? '—'}</p>
                  <p className="text-xs text-slate-400">{b.registered_address ?? 'No address on file'}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
