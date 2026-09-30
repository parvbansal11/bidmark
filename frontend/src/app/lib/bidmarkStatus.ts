import type { StatusKind } from '@/app/components/bidmark/Status'
import type {
  BidderEvaluation, CaseDetail, CaseStage, DocumentRecord, Finding, QueueRow, Requirement, RequirementEvaluation, SeverityCounts,
} from '@/app/services/bidmark/types'

export interface BidmarkStatus { kind: StatusKind; label: string; note: string }

// The Bidmark column on a GeM bid list. Describes screening output, never the decision.
export function bidStatus(row: { stage: CaseStage; counts: SeverityCounts; in_ring?: boolean; decision?: string | null }): BidmarkStatus {
  if (row.stage === 'DRAFT') return { kind: 'unchecked', label: 'Not submitted', note: 'The bidder has not submitted the bid yet.' }
  if (row.stage === 'SUBMITTED') return { kind: 'processing', label: 'Screening', note: 'Verification is running on the submitted documents.' }
  const high = row.counts.HIGH ?? 0
  const medium = row.counts.MEDIUM ?? 0
  if (high > 0) return { kind: 'finding', label: `${high} high ${high === 1 ? 'finding' : 'findings'}`, note: 'High findings need an officer ruling before a decision.' }
  if (medium > 0) return { kind: 'review', label: 'Needs review', note: 'Medium findings raised; no high findings.' }
  return { kind: 'pass', label: 'No findings', note: 'Screening raised no findings. Unmeasured checks are listed on the case.' }
}

export function decisionStatus(decision: string | null | undefined): BidmarkStatus | null {
  if (decision === 'QUALIFIED') return { kind: 'met', label: 'Qualified', note: 'Recorded by the procurement officer.' }
  if (decision === 'DISQUALIFIED') return { kind: 'not_met', label: 'Disqualified', note: 'Recorded by the procurement officer.' }
  return null
}

// Which document category a finding concerns, when the finding itself does not say.
const CODE_CATEGORY: Record<string, string> = {
  GSTIN_CHECKSUM: 'GST',
  GSTIN_PAN_MISMATCH: 'GST',
  GSTIN_STATE_MISMATCH: 'GST',
  PAN_HOLDER_TYPE: 'PAN',
  PAN_NAME_INITIAL: 'PAN',
  CIN_YEAR_VS_INCORPORATION: 'MCA',
  CIN_STATE_MISMATCH: 'MCA',
}

export function findingCategories(f: Finding, requirements: Requirement[] = []): string[] {
  const out = new Set<string>()
  if (f.category) out.add(f.category)
  for (const pin of f.evidence?.pins ?? []) if (pin.category) out.add(pin.category)
  if (CODE_CATEGORY[f.code]) out.add(CODE_CATEGORY[f.code])
  const reqId = f.evidence?.requirement_id as string | undefined
  if (reqId) {
    const req = requirements.find(r => r.id === reqId)
    if (req) out.add(req.evidence_type)
  }
  return [...out]
}

export interface RequirementCell {
  requirement: Requirement
  evaluation: RequirementEvaluation | null
  findings: Finding[]
  documents: DocumentRecord[]
  kind: StatusKind
  label: string
}

function evaluationKind(ev: RequirementEvaluation | null, hasDocument: boolean): { kind: StatusKind; label: string } {
  if (!ev) return { kind: 'unchecked', label: 'Not checked' }
  switch (ev.status) {
    case 'VERIFIED': return { kind: 'met', label: 'Met' }
    case 'FAILED': return { kind: 'not_met', label: 'Not met' }
    case 'REQUIRES_REVIEW': return { kind: 'review', label: 'Review' }
    case 'NOT_APPLICABLE': return { kind: 'not_required', label: hasDocument ? 'Not required' : 'Optional' }
    case 'PENDING': return hasDocument ? { kind: 'pending', label: 'Pending' } : { kind: 'not_submitted', label: 'Missing' }
  }
}

export function requirementCell(
  requirement: Requirement,
  evaluation: BidderEvaluation | null,
  findings: Finding[],
  documents: DocumentRecord[],
  requirements: Requirement[],
): RequirementCell {
  const ev = evaluation?.compliance_report?.requirement_evaluations.find(e => e.requirement_type === requirement.requirement_type) ?? null
  const docs = documents.filter(d => d.category === requirement.evidence_type)
  const related = findings.filter(f =>
    f.severity !== 'INFO' && (
      (f.evidence?.requirement_id as string | undefined) === requirement.id ||
      findingCategories(f, requirements).includes(requirement.evidence_type)
    ))
  const base = evaluationKind(ev, docs.length > 0)
  const high = related.filter(f => f.severity === 'HIGH').length
  const medium = related.filter(f => f.severity === 'MEDIUM').length
  if (high > 0) return { requirement, evaluation: ev, findings: related, documents: docs, kind: 'finding', label: high > 1 ? `${high} high` : 'Finding' }
  if (base.kind === 'met' && medium > 0) return { requirement, evaluation: ev, findings: related, documents: docs, kind: 'review', label: 'Review' }
  return { requirement, evaluation: ev, findings: related, documents: docs, ...base }
}

export function forensicsCell(findings: Finding[]): { kind: StatusKind; label: string; findings: Finding[] } {
  const doc = findings.filter(f => f.source === 'DOCUMENT' && f.severity !== 'INFO')
  const high = doc.filter(f => f.severity === 'HIGH').length
  if (high) return { kind: 'finding', label: high > 1 ? `${high} high` : '1 high', findings: doc }
  if (doc.length) return { kind: 'review', label: `${doc.length} signal${doc.length > 1 ? 's' : ''}`, findings: doc }
  return { kind: 'pass', label: 'No signals', findings: doc }
}

export function linksCell(findings: Finding[], inRing: boolean): { kind: StatusKind; label: string; findings: Finding[] } {
  const cartel = findings.filter(f => f.source === 'CARTEL')
  if (inRing || cartel.some(f => f.severity === 'HIGH')) return { kind: 'finding', label: 'Linked', findings: cartel }
  if (cartel.length) return { kind: 'review', label: 'Review', findings: cartel }
  return { kind: 'pass', label: 'None found', findings: cartel }
}

export function queueRowFromCase(c: CaseDetail, bidderName: string, tenderNumber = '', tenderTitle = ''): QueueRow {
  return {
    case_id: c.id, tender_id: c.tender_id, tender_number: tenderNumber, tender_title: tenderTitle, bidder_id: c.bidder_id,
    bidder_name: bidderName, stage: c.stage, lane: c.lane, priority: c.priority, counts: c.summary.counts ?? { HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 },
    in_ring: !!c.summary.in_ring, ai_recommendation: c.ai_recommendation, decision: c.decision, assigned_officer_id: c.assigned_officer_id,
    sla_due_at: c.sla_due_at, sla_breached: c.sla_breached, next_action: { code: '', label: '' },
  }
}

export function severityRank(s: string) {
  return s === 'HIGH' ? 0 : s === 'MEDIUM' ? 1 : s === 'LOW' ? 2 : 3
}

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
}

// Every place a finding points to on a page: its own box, and any pinned fields.
export function findingPins(f: Finding): { document_id: string; page: number; bbox: [number, number, number, number]; label?: string }[] {
  const pins: { document_id: string; page: number; bbox: [number, number, number, number]; label?: string }[] = []
  if (f.document_id && f.page && f.bbox) pins.push({ document_id: f.document_id, page: f.page, bbox: f.bbox })
  for (const p of f.evidence?.pins ?? []) {
    if (p.document_id && p.page && p.bbox && !pins.some(x => x.document_id === p.document_id && x.page === p.page && x.bbox.join() === p.bbox.join())) {
      pins.push({ document_id: p.document_id, page: p.page, bbox: p.bbox, label: p.value })
    }
  }
  return pins
}

export function findingDocumentId(f: Finding): string | null {
  return f.document_id ?? f.evidence?.pins?.[0]?.document_id ?? null
}
