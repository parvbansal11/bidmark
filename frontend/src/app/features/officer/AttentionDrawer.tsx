import { Link } from 'react-router-dom'
import { ArrowRight, FileText } from 'lucide-react'
import { categoryLabel, findingTitle, linkLabel, LINK_GROUP, RECOMMENDATION_LABEL } from '@/app/lib/labels'
import { findingDocumentId, findingPins, sortFindings } from '@/app/lib/bidmarkStatus'
import { useResource } from '@/app/lib/useResource'
import { tenders, type Finding } from '@/app/services/bidmark'
import { findingValues, plainExplanation } from '@/app/components/bidmark/FindingCard'
import { EvidenceCrop } from '@/app/components/bidmark/EvidencePage'
import { SeverityTag } from '@/app/components/bidmark/Status'
import { Drawer, Mono, Skeleton } from '@/app/components/ui/primitives'
import type { CaseRow } from './data'

// Level 2 and 3 for one attention row: why it needs the officer, and the evidence.
export function AttentionDrawer({ row, onClose }: { row: CaseRow; onClose: () => void }) {
  const { queue: q, detail: c } = row
  const base = `/officer/cases/${q.case_id}`
  const open = sortFindings((c?.findings ?? []).filter(f => (f.severity === 'HIGH' || f.severity === 'MEDIUM') && !f.disposition))
  const lead = open[0]
  const cartel = lead?.source === 'CARTEL'
  const primary = !lead ? { to: `${base}?tab=decision`, label: 'Open decision' }
    : cartel ? { to: `${base}?tab=connections`, label: 'Open relationship evidence' }
      : findingDocumentId(lead) ? { to: `${base}?tab=documents&finding=${encodeURIComponent(lead.id)}&doc=${findingDocumentId(lead)}`, label: 'Open forensic viewer' }
        : { to: `${base}?tab=findings&finding=${encodeURIComponent(lead.id)}`, label: 'Open finding' }

  return (
    <Drawer open onClose={onClose} title={q.bidder_name} subtitle={q.tender_number}
      footer={
        <div className="flex items-center justify-between gap-3">
          <Link to={base} className="text-[13.5px] text-navy-600 hover:underline">Open full case</Link>
          <Link to={primary.to} className="inline-flex h-9 items-center gap-2 rounded-md bg-navy px-4 text-[13.5px] font-medium text-white transition-colors hover:bg-navy-700">
            {primary.label} <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      }>
      {!c ? <Skeleton className="h-40" /> : cartel ? <LinkedBidders tenderId={q.tender_id} bidderId={q.bidder_id} finding={lead} />
        : lead ? <DocumentLead finding={lead} /> : <p className="text-[14px] text-ink-2">No open findings. The bid is ready for a decision.</p>}

      {open.length > 1 && (
        <section className="mt-6">
          <p className="eyebrow mb-2">Also open on this bid</p>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {open.slice(1, 6).map(f => (
              <li key={f.id} className="flex items-center gap-2.5 px-3 py-2.5">
                <SeverityTag severity={f.severity} />
                <span className="min-w-0 flex-1 truncate text-[13.5px]">{findingTitle(f.code, f.title)}</span>
                {f.category && <span className="shrink-0 text-[12.5px] text-ink-3">{categoryLabel(f.category)}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {q.ai_recommendation && (
        <p className="mt-6 border-t border-line pt-4 text-[13.5px] text-ink-3">
          Recommended next step: <span className="font-medium text-ink-2">{RECOMMENDATION_LABEL[q.ai_recommendation]}</span>. The officer records the decision.
        </p>
      )}
    </Drawer>
  )
}

function DocumentLead({ finding: f }: { finding: Finding }) {
  const v = findingValues(f, {})
  const pin = findingPins(f)[0]
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5">
        <SeverityTag severity={f.severity} className="mt-0.5" />
        <p className="text-[15px] font-semibold leading-snug">{findingTitle(f.code, f.title)}</p>
      </div>
      <dl className="divide-y divide-line rounded-lg border border-line">
        <Row label="Observed"><span className="font-semibold text-finding">{v.observed}</span></Row>
        <Row label="Finding">{plainExplanation(f)}</Row>
        <Row label="Evidence">
          <span className="inline-flex items-center gap-1.5"><FileText className="size-3.5 text-ink-3" aria-hidden />{f.filename ?? categoryLabel(f.category)}{f.page ? `, page ${f.page}` : ', whole file'}</span>
        </Row>
      </dl>
      {pin && <EvidenceCrop documentId={pin.document_id} page={pin.page} pageSize={undefined} bbox={pin.bbox} tone={f.severity === 'HIGH' ? 'finding' : 'review'} />}
    </div>
  )
}

function LinkedBidders({ tenderId, bidderId, finding }: { tenderId: string; bidderId: string; finding: Finding }) {
  const intel = useResource(`intel:${tenderId}`, () => tenders.intelligence(tenderId))
  const links = (intel.data?.links ?? []).filter(l => l.a === bidderId || l.b === bidderId)
  const others = [...new Set(links.map(l => (l.a === bidderId ? l.b : l.a)))]
  const names = intel.data?.bidder_names ?? {}
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5">
        <SeverityTag severity={finding.severity} className="mt-0.5" />
        <div>
          <p className="text-[15px] font-semibold leading-snug">Linked bidder relationship detected</p>
          {others.length > 0 && <p className="mt-0.5 text-[13.5px] text-ink-2">With {others.map(o => names[o] ?? 'another bidder').join(', ')}</p>}
        </div>
      </div>
      {intel.error ? <p className="text-[13.5px] text-ink-3">The link analysis could not be loaded.</p>
        : !intel.data ? <Skeleton className="h-40" />
          : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {links.map((l, i) => (
                <li key={i} className="px-3.5 py-2.5">
                  <p className="flex items-baseline justify-between gap-3">
                    <span className="text-[14px] font-medium">{linkLabel(l.type)}</span>
                    <span className="text-[12px] text-ink-4">{LINK_GROUP[l.type] ?? 'Signal'}</span>
                  </p>
                  <p className="mt-0.5 text-[13px] text-ink-3">{l.detail}</p>
                  {typeof l.evidence?.hash === 'string' && <Mono className="text-[12px] text-ink-4">{`Salted hash ${l.evidence.hash}`}</Mono>}
                </li>
              ))}
            </ul>
          )}
      <p className="text-[13px] text-ink-3">A relationship is a lead for review. It does not by itself establish collusion.</p>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 px-3.5 py-2.5 text-[13.5px]">
      <dt className="text-ink-3">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{children}</dd>
    </div>
  )
}

