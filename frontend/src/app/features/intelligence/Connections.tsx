import { useMemo, useState } from 'react'
import { ArrowRight, Info, Network } from 'lucide-react'
import { cn } from '@/app/lib/cn'
import { formatINR, initials } from '@/app/lib/format'
import { LINK_GROUP, linkLabel, PRICE_SCREEN_LABEL } from '@/app/lib/labels'
import type { BidderLink, Ring, TenderIntelligence } from '@/app/services/bidmark'
import { SeverityTag, StatusPill } from '@/app/components/bidmark/Status'
import { Mono } from '@/app/components/ui/primitives'
import { EmptyState } from '@/app/components/ui/states'

interface Pair { key: string; a: string; b: string; links: BidderLink[]; weight: number }

function pairsOf(links: BidderLink[]): Pair[] {
  const map = new Map<string, Pair>()
  for (const l of links) {
    const [a, b] = [l.a, l.b].sort()
    const key = `${a}|${b}`
    const p = map.get(key) ?? { key, a, b, links: [], weight: 0 }
    p.links.push(l)
    p.weight += l.weight
    map.set(key, p)
  }
  return [...map.values()].sort((x, y) => y.weight - x.weight)
}

function linkEvidence(l: BidderLink): string | null {
  const e = l.evidence ?? {}
  if (Array.isArray(e.authors)) return `Author: ${(e.authors as string[]).join(', ')}`
  if (Array.isArray(e.directors)) return `DIN: ${(e.directors as string[]).join(', ')}`
  if (typeof e.seconds === 'number') return `${e.seconds} seconds apart`
  if (typeof e.hash === 'string') return `Salted hash ${e.hash}`
  if (typeof e.sha256 === 'string') return `SHA-256 ${(e.sha256 as string).slice(0, 12)}`
  return null
}

export function Connections({ intel, names, focus, prices, onOpenBidder, members, hideGroups }: {
  intel: TenderIntelligence
  names: Record<string, string>
  focus?: string
  prices?: Record<string, number | null>
  onOpenBidder?: (bidderId: string) => void
  members?: string[]
  hideGroups?: boolean
}) {
  const nameOf = (id: string) => names[id] ?? intel.bidder_names?.[id] ?? 'Unknown bidder'
  const pairs = useMemo(() => pairsOf(intel.links), [intel.links])
  const visiblePairs = focus ? pairs.filter(p => p.a === focus || p.b === focus)
    : members ? pairs.filter(p => members.includes(p.a) && members.includes(p.b)) : pairs
  const [selected, setSelected] = useState<string | null>(visiblePairs[0]?.key ?? null)
  const pair = visiblePairs.find(p => p.key === selected) ?? null
  const rings = focus ? intel.rings.filter(r => r.members.includes(focus)) : intel.rings
  const allIds = useMemo(() => {
    const ids = new Set<string>(Object.keys(names))
    Object.keys(intel.bidder_names ?? {}).forEach(id => ids.add(id))
    intel.links.forEach(l => { ids.add(l.a); ids.add(l.b) })
    return [...ids]
  }, [names, intel])

  return (
    <div className="space-y-5">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <section className="card overflow-hidden" aria-label="Bidder network">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <h3 className="text-[14px] font-semibold">Bidder network</h3>
              <p className="text-[12px] text-ink-3">Lines join bidders that share something they should not. Select a line to see why.</p>
            </div>
            <Legend />
          </div>
          <NetworkGraph ids={allIds} pairs={pairs} rings={intel.rings} nameOf={nameOf} focus={focus} selected={selected} onSelect={setSelected} onOpenBidder={onOpenBidder} />
        </section>

        <section className="card overflow-hidden xl:order-first" aria-live="polite" aria-label="Why these bidders are connected">
          {pair ? (
            <div className="animate-fade-in" key={pair.key}>
              <div className="border-b border-line px-4 py-3">
                <p className="eyebrow">Why are these bidders connected?</p>
                <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[14px] font-semibold">
                  <button className="link text-ink hover:text-navy-600" onClick={() => onOpenBidder?.(pair.a)}>{nameOf(pair.a)}</button>
                  <span className="text-ink-4" aria-hidden>and</span>
                  <button className="link text-ink hover:text-navy-600" onClick={() => onOpenBidder?.(pair.b)}>{nameOf(pair.b)}</button>
                </p>
                <p className="mt-1 text-[12px] text-ink-3">{pair.links.length} independent signal{pair.links.length === 1 ? '' : 's'}, combined weight {pair.weight}</p>
              </div>
              <ul className="divide-y divide-line">
                {pair.links.map((l, i) => {
                  const ev = linkEvidence(l)
                  return (
                    <li key={i} className="px-4 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[13px] font-medium text-ink">{linkLabel(l.type)}</span>
                        <span className="text-[12px] text-ink-4">{LINK_GROUP[l.type] ?? 'Signal'}</span>
                      </div>
                      <p className="mt-0.5 text-[12.5px] text-ink-2">{l.detail}</p>
                      {ev && <Mono className="mt-0.5 block text-[12px] text-ink-3">{ev}</Mono>}
                    </li>
                  )
                })}
              </ul>
              <p className="flex items-start gap-2 border-t border-line bg-subtle px-4 py-2.5 text-[12px] text-ink-3">
                <Info className="mt-px size-3.5 shrink-0" aria-hidden />
                Device and network values are salted hashes recorded only for bidder actions. Links are leads for review and do not by themselves prove collusion.
              </p>
            </div>
          ) : (
            <EmptyState icon={<Network className="size-4" />} title={focus ? 'No links found for this bidder' : 'No links between bidders'}
              body="Device, network, declared details, document authorship, identical files and submission timing were compared across every bidder on this tender." />
          )}
        </section>
      </div>

      {!hideGroups && rings.length > 0 && (
        <section className="card overflow-hidden" aria-label="Rings">
          <div className="border-b border-line px-4 py-3">
            <h3 className="text-[14px] font-semibold">Linked groups on this tender</h3>
            <p className="text-[12px] text-ink-3">Bidders joined through weighted links. A group becomes visible when its second member bids; earlier members are re-screened.</p>
          </div>
          <ul className="divide-y divide-line">
            {rings.map((r, i) => <RingRow key={i} ring={r} index={i} nameOf={nameOf} prices={prices} onOpenBidder={onOpenBidder} />)}
          </ul>
        </section>
      )}
    </div>
  )
}

function Legend() {
  return (
    <div className="hidden items-center gap-3 text-[12px] text-ink-3 sm:flex" aria-hidden>
      <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full border-2 border-finding bg-finding-bg" /> In a linked group</span>
      <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full border border-line-strong bg-surface" /> No links found</span>
    </div>
  )
}

function NetworkGraph({ ids, pairs, rings, nameOf, focus, selected, onSelect, onOpenBidder }: {
  ids: string[]; pairs: Pair[]; rings: Ring[]; nameOf: (id: string) => string; focus?: string
  selected: string | null; onSelect: (k: string) => void; onOpenBidder?: (id: string) => void
}) {
  const W = 640
  const H = 360
  const inRing = new Set(rings.flatMap(r => r.members))
  const ordered = [...ids].sort((a, b) => Number(inRing.has(b)) - Number(inRing.has(a)) || nameOf(a).localeCompare(nameOf(b)))
  const pos = new Map<string, { x: number; y: number }>()
  ordered.forEach((id, i) => {
    const angle = -Math.PI / 2 + (i / Math.max(1, ordered.length)) * Math.PI * 2 - Math.PI / Math.max(2, ordered.length)
    pos.set(id, { x: W / 2 + Math.cos(angle) * 220, y: H / 2 + Math.sin(angle) * 128 })
  })
  return (
    <div className="relative bg-[radial-gradient(circle_at_center,var(--color-subtle),var(--color-surface))]">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={`Network of ${ids.length} bidders with ${pairs.length} linked pair${pairs.length === 1 ? '' : 's'}`}>
        {pairs.map(p => {
          const a = pos.get(p.a)
          const b = pos.get(p.b)
          if (!a || !b) return null
          const active = p.key === selected
          const dim = focus && p.a !== focus && p.b !== focus
          return (
            <g key={p.key} className="cursor-pointer" onClick={() => onSelect(p.key)} opacity={dim ? 0.25 : 1}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={18} />
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={active ? 'var(--color-finding)' : '#c98a84'} strokeWidth={Math.min(7, 1.5 + p.weight / 3)} strokeLinecap="round"
                className="transition-[stroke] duration-200" strokeDasharray={active ? undefined : '0'} />
              <g transform={`translate(${(a.x + b.x) / 2}, ${(a.y + b.y) / 2})`}>
                <rect x={-34} y={-11} width={68} height={22} rx={11} fill={active ? 'var(--color-finding)' : '#fff'} stroke="var(--color-finding-line)" />
                <text textAnchor="middle" dy="4" fontSize={12} fontWeight={600} fill={active ? '#fff' : 'var(--color-finding)'}>{p.links.length} signals</text>
              </g>
            </g>
          )
        })}
        {ordered.map(id => {
          const p = pos.get(id)!
          const ring = inRing.has(id)
          const isFocus = focus === id
          const label = nameOf(id).replace(/\s+(Pvt|Private)?\s*(Ltd|Limited)\.?$/i, '')
          return (
            <g key={id} transform={`translate(${p.x}, ${p.y})`} className={onOpenBidder ? 'cursor-pointer' : undefined} onClick={() => onOpenBidder?.(id)}>
              <circle r={isFocus ? 25 : 21} fill={ring ? 'var(--color-finding-bg)' : '#fff'} stroke={ring ? 'var(--color-finding)' : 'var(--color-line-strong)'} strokeWidth={ring ? 2 : 1.25} />
              {isFocus && <circle r={30} fill="none" stroke="var(--color-navy-600)" strokeWidth={1.5} strokeDasharray="3 3" />}
              <text textAnchor="middle" dy="4" fontSize="12" fontWeight={600} fill={ring ? 'var(--color-finding)' : 'var(--color-ink-2)'}>{initials(nameOf(id))}</text>
              <text textAnchor="middle" y={p.y > H / 2 ? 42 : -32} fontSize={12} fill="var(--color-ink-2)" fontWeight={isFocus ? 600 : 400}>{label.length > 26 ? `${label.slice(0, 25)}…` : label}</text>
            </g>
          )
        })}
      </svg>
      {pairs.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-line px-4 py-2.5">
          <span className="mr-1 self-center text-[12px] text-ink-3">Linked pairs:</span>
          {pairs.filter(p => !focus || p.a === focus || p.b === focus).map(p => (
            <button key={p.key} onClick={() => onSelect(p.key)} aria-pressed={p.key === selected}
              className={cn('rounded-full border px-2.5 py-0.5 text-[12px] transition-colors', p.key === selected ? 'border-finding bg-finding text-white' : 'border-finding-line bg-surface text-finding hover:bg-finding-bg')}>
              {initials(nameOf(p.a))} and {initials(nameOf(p.b))}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function RingRow({ ring, index, nameOf, prices, onOpenBidder }: {
  ring: Ring; index: number; nameOf: (id: string) => string; prices?: Record<string, number | null>; onOpenBidder?: (id: string) => void
}) {
  const cover = ring.cover_pattern
  return (
    <li className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        <div className="flex items-center gap-2">
          <SeverityTag severity="HIGH" />
          <p className="text-[13.5px] font-semibold">Group {index + 1}: {ring.members.length} bidders, link strength {ring.strength}</p>
        </div>
        <ul className="mt-2.5 space-y-1.5">
          {ring.members.map(m => (
            <li key={m} className="flex items-center justify-between gap-2 text-[13px]">
              <button className="link text-left text-ink" onClick={() => onOpenBidder?.(m)}>{nameOf(m)}</button>
              <span className="flex items-center gap-2">
                {prices?.[m] != null && <span className="tnum text-[12px] text-ink-3">{formatINR(prices[m])}</span>}
                {cover?.designated_low === m && <StatusPill size="sm" kind="review" label="Lowest in group" />}
                {cover?.covers.includes(m) && <StatusPill size="sm" kind="finding" label="Priced above" />}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {ring.link_types.map(t => <span key={t} className="rounded border border-line bg-subtle px-1.5 py-0.5 text-[12px] text-ink-2">{linkLabel(t)}</span>)}
        </div>
      </div>
      <div className="rounded-lg border border-line bg-subtle px-3.5 py-3">
        <p className="text-[12.5px] font-semibold">Price pattern</p>
        {cover ? (
          <>
            <p className="mt-1 text-[12.5px] text-ink-2">{cover.detail}</p>
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
              {cover.covers.map(c => initials(nameOf(c))).join(', ')} <ArrowRight className="size-3" aria-hidden /> priced above {initials(nameOf(cover.designated_low))}
              {cover.low_is_tender_lowest && ', who is the lowest bidder on the whole tender.'}
            </p>
          </>
        ) : <p className="mt-1 text-[12.5px] text-ink-3">No cover-bid pattern among the group's prices.</p>}
      </div>
    </li>
  )
}

export function PriceScreens({ intel, prices, nameOf }: {
  intel: TenderIntelligence; prices: Record<string, number | null>; nameOf: (id: string) => string
}) {
  const ps = intel.price_screens
  const entries = Object.entries(prices).filter((e): e is [string, number] => e[1] != null).sort((a, b) => a[1] - b[1])
  const max = Math.max(...entries.map(e => e[1]), 1)
  const min = Math.min(...entries.map(e => e[1]), max)
  const floor = min * 0.9
  const ringMembers = new Set(intel.rings.flatMap(r => r.members))
  return (
    <section className="card overflow-hidden" aria-label="Price screens">
      <div className="border-b border-line px-4 py-3">
        <h3 className="text-[14px] font-semibold">Bid-rigging price screens</h3>
        <p className="text-[12px] text-ink-3">Published screens (Imhof, Karagok and Rutz 2018; OECD) run on the {ps.n_bids} quoted prices. Statistical leads, not proof.</p>
      </div>
      <div className="grid gap-5 px-4 py-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div>
          <p className="eyebrow mb-2">Quoted prices, lowest first</p>
          <ul className="space-y-1.5">
            {entries.map(([id, price], i) => (
              <li key={id} className="grid grid-cols-[150px_minmax(0,1fr)_92px] items-center gap-2 text-[12.5px]">
                <span className={cn('truncate', ringMembers.has(id) ? 'font-medium text-finding' : 'text-ink-2')}>{i + 1}. {nameOf(id).replace(/\s+(Pvt|Private)?\s*(Ltd|Limited)\.?$/i, '')}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-sunken">
                  <span className={cn('block h-full rounded-full', ringMembers.has(id) ? 'bg-finding/70' : 'bg-navy-600/60')} style={{ width: `${((price - floor) / (max - floor)) * 100}%` }} />
                </span>
                <span className="tnum text-right text-ink">{formatINR(price)}</span>
              </li>
            ))}
          </ul>
          {ringMembers.size > 0 && <p className="mt-2 text-[12px] text-ink-3">Bars in red belong to bidders in a linked group. Scale starts at 90% of the lowest bid.</p>}
        </div>
        <div className="space-y-3">
          <dl className="grid grid-cols-3 gap-2">
            <Metric label="Coefficient of variation" value={ps.cv != null ? ps.cv.toFixed(3) : 'Not computed'} />
            <Metric label="Relative distance" value={ps.relative_distance != null ? ps.relative_distance.toFixed(2) : 'Not computed'} />
            <Metric label="Bids screened" value={String(ps.n_bids)} />
          </dl>
          {ps.flags.length ? ps.flags.map(f => (
            <div key={f.code} className="rounded-lg border border-review-line bg-review-bg/60 px-3 py-2.5">
              <div className="flex items-center gap-2"><SeverityTag severity={f.severity} /><span className="text-[13px] font-semibold">{PRICE_SCREEN_LABEL[f.code] ?? f.code}</span></div>
              <p className="mt-1 text-[12.5px] text-ink-2">{f.detail}</p>
            </div>
          )) : <p className="text-[12.5px] text-ink-3">No price screen raised a flag on this tender.</p>}
          {ps.step_ratios && ps.step_ratios.length > 0 && (
            <p className="text-[12px] text-ink-3">Step ratios between consecutive bids: <Mono className="text-[12px]">{ps.step_ratios.map(r => r.toFixed(3)).join(', ')}</Mono></p>
          )}
        </div>
      </div>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line px-3 py-2">
      <dt className="text-[12px] leading-tight text-ink-3">{label}</dt>
      <dd className="tnum mt-1 text-[15px] font-semibold">{value}</dd>
    </div>
  )
}
