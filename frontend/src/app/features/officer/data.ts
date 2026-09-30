import { useResource } from '@/app/lib/useResource'
import { categoryLabel, findingTitle } from '@/app/lib/labels'
import { findingDocumentId, findingPins, severityRank } from '@/app/lib/bidmarkStatus'
import { cases, tenders, type CaseDetail, type Finding, type Lane, type QueueRow, type Severity } from '@/app/services/bidmark'
import type { StatusKind } from '@/app/components/bidmark/Status'

export interface CaseRow { queue: QueueRow; detail: CaseDetail | null }

// Every case with its detail. The queue endpoint is the complete list; details carry findings and scores.
export function useCaseIndex() {
  return useResource<CaseRow[]>('queue:index', async () => {
    const queue = await cases.queue()
    const details = await Promise.all(queue.map(q => cases.get(q.case_id).catch(() => null)))
    return queue.map((q, i) => ({ queue: q, detail: details[i] }))
  })
}

export type RiskLevel = 'High' | 'Medium' | 'Low'

const LANE_RISK: Record<Lane, RiskLevel> = { ESCALATED: 'High', STANDARD: 'Medium', FAST_TRACK: 'Low' }
const RISK_RANK: Record<RiskLevel, number> = { High: 0, Medium: 1, Low: 2 }

// Risk shown to the officer: the higher of the screening lane and the compliance report's risk level.
export function riskLevel(lane: Lane | null | undefined, complianceRisk?: string | null): RiskLevel {
  const fromLane = lane ? LANE_RISK[lane] : 'Low'
  const r = (complianceRisk ?? '').toUpperCase()
  const fromReport: RiskLevel = r === 'HIGH' || r === 'CRITICAL' ? 'High' : r === 'MEDIUM' ? 'Medium' : 'Low'
  return RISK_RANK[fromLane] <= RISK_RANK[fromReport] ? fromLane : fromReport
}

export const riskKind = (r: RiskLevel): StatusKind => (r === 'High' ? 'finding' : r === 'Medium' ? 'review' : 'pass')

export function riskBasis(lane: Lane | null | undefined, complianceRisk?: string | null): string {
  const parts: string[] = []
  if (lane === 'ESCALATED') parts.push('screening escalated the bid (document tampering or linked bidder signal)')
  else if (lane === 'STANDARD') parts.push('screening raised findings that need review')
  else if (lane === 'FAST_TRACK') parts.push('screening raised no findings')
  if (complianceRisk) parts.push(`compliance report risk is ${complianceRisk.toLowerCase()}`)
  return parts.join('; ')
}

export interface AttentionItem {
  caseId: string
  severity: Severity
  bidder: string
  tenderNumber: string
  title: string
  context: string
  action: 'Review' | 'Review evidence' | 'Inspect' | 'Decide'
  target: string
}

const TAMPER = new Set(['OVERLAPPING_TEXT', 'FIELD_FONT_OUTLIER', 'MODIFIED_AFTER_SIGNING', 'SIGNATURE_BROKEN', 'INCREMENTAL_UPDATES', 'EDITOR_TOOL', 'TIMESTAMP_INVERSION', 'COMPRESSION_HOTSPOT', 'IMAGE_EDITOR'])
const IDENTITY = new Set(['GSTIN_CHECKSUM', 'GSTIN_PAN_MISMATCH', 'PAN_HOLDER_TYPE', 'CIN_YEAR_VS_INCORPORATION', 'NAME_LOOKALIKE', 'NAME_MISMATCH'])

// The lead finding, said the way a procurement officer would say it.
export function plainSummary(lead: Finding, open: Finding[], sharedSignals: number, fileName?: string | null): { title: string; context: string } {
  if (lead.source === 'CARTEL') {
    return { title: 'Linked bidder relationship detected', context: sharedSignals ? `${sharedSignals} shared signal${sharedSignals === 1 ? '' : 's'}` : 'Relationship evidence available' }
  }
  if (TAMPER.has(lead.code)) {
    const same = open.filter(f => TAMPER.has(f.code) && f.category === lead.category).length
    const doc = lead.category ? categoryLabel(lead.category) : 'A document'
    return { title: lead.code === 'MODIFIED_AFTER_SIGNING' ? `${doc} changed after signing` : `${doc} appears modified`,
      context: [`${same} document anomal${same === 1 ? 'y' : 'ies'}`, fileName].filter(Boolean).join(' · ') }
  }
  if (lead.code === 'EXPIRED_AT_BID_DATE') return { title: `${categoryLabel(lead.category)} expired before the bid date`, context: fileName ?? 'Evidence available' }
  if (IDENTITY.has(lead.code)) return { title: 'Registry value does not match submission', context: findingTitle(lead.code, lead.title) }
  if (lead.code === 'REQUIREMENT_NOT_MET') return { title: 'Mandatory requirement not met', context: categoryLabel(lead.category) }
  return { title: findingTitle(lead.code, lead.title), context: lead.category ? categoryLabel(lead.category) : 'Details available' }
}

// One line per case that needs the officer, led by its most serious open item.
export function attentionItems(rows: CaseRow[], sharedSignals: Record<string, number> = {}): AttentionItem[] {
  const items: (AttentionItem & { priority: number })[] = []
  for (const { queue: q, detail: c } of rows) {
    if (!c || q.stage === 'DECIDED' || q.stage === 'DRAFT' || q.stage === 'WITHDRAWN') continue
    const base = `/officer/cases/${q.case_id}`
    const open = c.findings
      .filter(f => (f.severity === 'HIGH' || f.severity === 'MEDIUM') && !f.disposition)
      .sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || Number(b.source === 'CARTEL') - Number(a.source === 'CARTEL'))
    const lead = open[0]
    if (q.stage === 'CLARIFICATION_RECEIVED') {
      items.push({ caseId: q.case_id, severity: lead?.severity ?? 'MEDIUM', bidder: q.bidder_name, tenderNumber: q.tender_number,
        title: 'Clarification received from bidder', context: 'Reply ready for review', action: 'Review', target: `${base}?tab=decision`, priority: q.priority })
      continue
    }
    if (lead) {
      const cartel = lead.source === 'CARTEL'
      items.push({
        caseId: q.case_id, severity: lead.severity, bidder: q.bidder_name, tenderNumber: q.tender_number,
        ...plainSummary(lead, open, sharedSignals[q.bidder_id] ?? 0, lead.filename),
        action: cartel ? 'Inspect' : 'Review evidence',
        target: cartel ? `${base}?tab=connections` : findingPins(lead).length || findingDocumentId(lead) ? `${base}?tab=evidence&finding=${encodeURIComponent(lead.id)}` : `${base}?tab=compliance`,
        priority: q.priority,
      })
    } else if (q.stage === 'SCREENED' || q.stage === 'IN_REVIEW') {
      items.push({ caseId: q.case_id, severity: 'INFO', bidder: q.bidder_name, tenderNumber: q.tender_number,
        title: 'Ready for qualification decision', context: 'No open findings', action: 'Decide', target: `${base}?tab=decision`, priority: q.priority - 1000 })
    }
  }
  return items.sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || b.priority - a.priority)
}

export function openHighCount(rows: CaseRow[]): number {
  return rows.reduce((n, r) => n + (r.queue.stage === 'DECIDED' ? 0 : r.detail?.undisposed_high.length ?? 0), 0)
}

// Distinct relationship signals per bidder, from the tender link analysis.
export function useSharedSignals(tenderIds: string[]) {
  const key = [...new Set(tenderIds)].sort().join(',')
  return useResource<Record<string, number>>(key ? `intel-signals:${key}` : null, async () => {
    const intel = await Promise.all(key.split(',').map(id => tenders.intelligence(id).catch(() => null)))
    const types = new Map<string, Set<string>>()
    for (const t of intel) {
      for (const l of t?.links ?? []) {
        for (const id of [l.a, l.b]) types.set(id, (types.get(id) ?? new Set()).add(l.type))
      }
    }
    return Object.fromEntries([...types].map(([id, s]) => [id, s.size]))
  })
}

export interface TenderVerification { kind: StatusKind; label: string; bids: number }

export function tenderVerification(rows: CaseRow[]): TenderVerification {
  const live = rows.filter(r => r.queue.stage !== 'DRAFT' && r.queue.stage !== 'WITHDRAWN')
  if (!live.length) return { kind: 'unchecked', label: 'No bids received', bids: 0 }
  if (live.some(r => r.queue.stage === 'SUBMITTED')) return { kind: 'processing', label: 'Screening', bids: live.length }
  const review = live.filter(r => r.queue.stage !== 'DECIDED' && ((r.detail?.undisposed_high.length ?? 0) > 0 || r.queue.counts.MEDIUM > 0)).length
  const decided = live.filter(r => r.queue.stage === 'DECIDED').length
  if (review) return { kind: 'review', label: `${review} require${review === 1 ? 's' : ''} review`, bids: live.length }
  if (decided === live.length) return { kind: 'met', label: 'All decided', bids: live.length }
  return { kind: 'pass', label: 'Verified, awaiting decision', bids: live.length }
}
