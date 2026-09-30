import { Fragment, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronDown, Info, Network } from 'lucide-react'
import { cn } from '@/app/lib/cn'
import { LINK_GROUP, linkLabel } from '@/app/lib/labels'
import { useResource } from '@/app/lib/useResource'
import { tenders, type BidderLink, type Ring, type Severity, type Tender, type TenderIntelligence } from '@/app/services/bidmark'
import { PageHeader } from '@/app/features/shell/AppShell'
import { Connections } from '@/app/features/intelligence/Connections'
import { SeverityTag } from '@/app/components/bidmark/Status'
import { Mono, SkeletonRows } from '@/app/components/ui/primitives'
import { EmptyState, ErrorState } from '@/app/components/ui/states'
import { useCaseIndex, type CaseRow } from './data'

interface Group { tender: Tender; intel: TenderIntelligence; ring: Ring; index: number }

function useGroups() {
  return useResource('intel:groups', async () => {
    const list = await tenders.list()
    const intel = await Promise.all(list.map(t => tenders.intelligence(t.id).then(i => ({ t, i }))))
    const groups: Group[] = []
    for (const { t, i } of intel) i.rings.forEach((ring, index) => groups.push({ tender: t, intel: i, ring, index }))
    return groups
  })
}

// The group's level is the severity screening gave its members' linked-bidder findings.
function groupSeverity(g: Group, rows: CaseRow[]): Severity | null {
  const sev = rows
    .filter(r => r.queue.tender_id === g.tender.id && g.ring.members.includes(r.queue.bidder_id))
    .flatMap(r => r.detail?.findings ?? [])
    .filter(f => f.source === 'CARTEL')
    .map(f => f.severity)
  return (['HIGH', 'MEDIUM', 'LOW'] as Severity[]).find(s => sev.includes(s)) ?? null
}

const nameOf = (g: Group, id: string) => g.intel.bidder_names?.[id] ?? 'Unknown bidder'

// Risk Intelligence: why are these bidders related?
export function RiskIntelligencePage() {
  const groups = useGroups()
  const index = useCaseIndex()
  return (
    <div>
      <PageHeader eyebrow="Bidmark" title="Risk Intelligence" description="Bidders linked by shared devices, networks, declared details, document authorship or submission timing." />
      <section className="card overflow-hidden">
        <h2 className="border-b border-line px-5 py-3.5 text-[16px] font-semibold">Linked bidder groups</h2>
        {groups.error ? <div className="p-5"><ErrorState error={groups.error} onRetry={groups.reload} what="linked bidder groups" /></div>
          : !groups.data ? <div className="p-5"><SkeletonRows rows={3} /></div>
            : groups.data.length === 0 ? <EmptyState icon={<Network className="size-4" />} title="No linked bidder groups" body="Every tender's bidders were compared. No group was found." />
              : (
                <ul className="divide-y divide-line">
                  {groups.data.map((g, i) => {
                    const sev = groupSeverity(g, index.data ?? [])
                    return (
                      <li key={`${g.tender.id}:${g.index}`} className="grid grid-cols-[88px_minmax(0,1.3fr)_minmax(0,1fr)_auto] items-center gap-4 px-5 py-4">
                        <span className="text-[14px] font-semibold text-ink-2">Group {String(i + 1).padStart(2, '0')}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-[15px] font-semibold">{g.ring.members.map(m => nameOf(g, m)).join(', ')}</span>
                          <span className="block text-[12.5px] text-ink-3">{g.tender.tender_number}</span>
                        </span>
                        <span className="flex items-center gap-3 text-[14px] text-ink-2">
                          <span>{g.ring.members.length} bidders</span>
                          <span className="text-ink-4" aria-hidden>·</span>
                          <span>{g.ring.link_types.length} shared signals</span>
                          {sev && <SeverityTag severity={sev} />}
                        </span>
                        <Link to={`/officer/intelligence/${g.tender.id}/${g.index}`} className="inline-flex h-8 items-center rounded-md border border-line-strong bg-surface px-3 text-[13.5px] font-medium text-ink-2 hover:bg-subtle">Inspect</Link>
                      </li>
                    )
                  })}
                </ul>
              )}
      </section>
    </div>
  )
}

function evidenceValue(l: BidderLink): string | null {
  const e = l.evidence ?? {}
  if (Array.isArray(e.authors)) return (e.authors as string[]).join(', ')
  if (Array.isArray(e.directors)) return `DIN ${(e.directors as string[]).join(', ')}`
  if (typeof e.seconds === 'number') return `${e.seconds} seconds apart`
  if (typeof e.hash === 'string') return `Salted hash ${e.hash}`
  if (typeof e.sha256 === 'string') return `SHA-256 ${(e.sha256 as string).slice(0, 12)}`
  return null
}

export function RiskGroupPage() {
  const { tenderId, ringIndex } = useParams()
  const intel = useResource(tenderId ? `intel:${tenderId}` : null, () => tenders.intelligence(tenderId!))
  const tender = useResource(tenderId ? `tender:${tenderId}` : null, () => tenders.get(tenderId!))
  const index = useCaseIndex()
  const navigate = useNavigate()
  const [graph, setGraph] = useState(false)
  const [open, setOpen] = useState<number | null>(null)
  const ring = intel.data?.rings[Number(ringIndex)]
  const names = useMemo(() => intel.data?.bidder_names ?? {}, [intel.data])

  if (intel.error) return <ErrorState error={intel.error} onRetry={intel.reload} what="this group" />
  if (!intel.data) return <SkeletonRows rows={6} />
  if (!ring) return <EmptyState title="Group not found" body="The link analysis for this tender no longer contains this group." />

  const caseFor = (bidderId: string) => index.data?.find(r => r.queue.tender_id === tenderId && r.queue.bidder_id === bidderId)?.queue.case_id
  const links = ring.links

  return (
    <div className="space-y-6">
      <PageHeader crumbs={[{ label: 'Risk Intelligence', to: '/officer/intelligence' }, { label: `Group ${Number(ringIndex) + 1}` }]}
        title="Linked bidder group" description={tender.data ? `${tender.data.tender_number} · ${tender.data.title}` : undefined} />

      <section className="card overflow-hidden">
        <h2 className="border-b border-line px-5 py-3.5 text-[16px] font-semibold">Bidders</h2>
        <ul className="divide-y divide-line">
          {ring.members.map(m => {
            const caseId = caseFor(m)
            const role = ring.cover_pattern?.designated_low === m ? 'Lowest priced member' : ring.cover_pattern?.covers.includes(m) ? 'Priced above the lowest member' : null
            return (
              <li key={m} className="flex items-center justify-between gap-3 px-5 py-3">
                <span>
                  <span className="block text-[15px] font-medium">{names[m] ?? 'Unknown bidder'}</span>
                  {role && <span className="block text-[12.5px] text-ink-3">{role}</span>}
                </span>
                {caseId && <Link to={`/officer/cases/${caseId}?tab=connections`} className="text-[14px] text-navy-600 hover:underline">Open evaluation</Link>}
              </li>
            )
          })}
        </ul>
        {ring.cover_pattern && <p className="border-t border-line bg-subtle px-5 py-2.5 text-[13.5px] text-ink-2">{ring.cover_pattern.detail}</p>}
      </section>

      <section className="card overflow-hidden">
        <h2 className="border-b border-line px-5 py-3.5 text-[16px] font-semibold">Relationship evidence</h2>
        <table className="data-table">
          <thead><tr><th>Signal</th><th>Between</th><th>Type</th><th aria-label="Details" /></tr></thead>
          <tbody>
            {links.map((l, i) => (
              <Fragment key={i}>
                <tr className="row-link" onClick={() => setOpen(open === i ? null : i)}>
                  <td className="font-medium text-ink">{linkLabel(l.type)}</td>
                  <td>{names[l.a] ?? 'Bidder'} and {names[l.b] ?? 'bidder'}</td>
                  <td className="text-ink-3">{LINK_GROUP[l.type] ?? 'Signal'}</td>
                  <td className="w-10 text-right"><ChevronDown className={cn('inline size-4 text-ink-4 transition-transform', open === i && 'rotate-180')} aria-label={open === i ? 'Hide details' : 'Show details'} /></td>
                </tr>
                {open === i && (
                  <tr>
                    <td colSpan={4} className="bg-subtle">
                      <p className="text-[14px] text-ink-2">{l.detail}</p>
                      {evidenceValue(l) && <Mono className="mt-1 block text-[12.5px] text-ink-3">{evidenceValue(l)}</Mono>}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        <p className="flex items-start gap-2 border-t border-line bg-subtle px-5 py-2.5 text-[12.5px] text-ink-3">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Device and network values are salted hashes of bidder actions. A relationship is a lead for review. It does not by itself establish collusion.
        </p>
      </section>

      <section>
        <button onClick={() => setGraph(g => !g)} aria-expanded={graph} className="inline-flex items-center gap-1.5 text-[14px] font-medium text-navy-600 hover:underline">
          <ChevronDown className={cn('size-4 transition-transform', graph && 'rotate-180')} aria-hidden /> {graph ? 'Hide network graph' : 'Show network graph'}
        </button>
        {graph && (
          <div className="mt-3">
            <Connections intel={intel.data} names={names} members={ring.members} hideGroups
              onOpenBidder={id => { const c = caseFor(id); if (c) navigate(`/officer/cases/${c}?tab=connections`) }} />
          </div>
        )}
      </section>
    </div>
  )
}
