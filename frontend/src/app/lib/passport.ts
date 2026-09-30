import type { StatusKind } from '@/app/components/bidmark/Status'
import type {
  Bidder, BidderEvaluation, CaseDetail, DocumentRecord, Finding, RegistryResult, Requirement, RequirementEvaluation,
} from '@/app/services/bidmark'
import { findingCategories, severityRank } from './bidmarkStatus'
import { categoryLabel, findingTitle } from './labels'

// The compliance passport: every statutory and eligibility check a bid can carry,
// mapped onto what the verification service actually recorded. Nothing is inferred
// beyond the recorded requirement evaluation, registry response and findings.

export type PassportResult = 'Verified' | 'Review required' | 'Non-compliant' | 'Pending' | 'Not applicable' | 'Not verified' | 'Unavailable'

export const RESULT_KIND: Record<PassportResult, StatusKind> = {
  'Verified': 'verified',
  'Review required': 'review',
  'Non-compliant': 'not_met',
  'Pending': 'pending',
  'Not applicable': 'not_required',
  'Not verified': 'unchecked',
  'Unavailable': 'unavailable',
}

interface CheckDef {
  key: string
  label: string
  // Requirement type, registry verification type and document category share one code where they exist.
  code?: string
  source?: string
  submitted?: (b: Bidder | null) => string | null
}

export const PASSPORT_GROUPS: { title: string; checks: CheckDef[] }[] = [
  {
    title: 'Identity',
    checks: [
      { key: 'PAN', label: 'PAN', code: 'PAN', source: 'Income Tax PAN', submitted: b => b?.pan_number ?? null },
      { key: 'GST', label: 'GST registration', code: 'GST', source: 'GSTN', submitted: b => b?.gstin ?? null },
      { key: 'MCA', label: 'MCA / CIN', code: 'MCA', source: 'MCA21', submitted: b => b?.cin ?? null },
      { key: 'UDYAM', label: 'Udyam registration', code: 'UDYAM', source: 'Udyam portal', submitted: b => b?.udyam_number ?? null },
    ],
  },
  {
    title: 'Statutory',
    checks: [
      { key: 'INCOME_TAX', label: 'Income tax return', code: 'INCOME_TAX', source: 'Income Tax' },
      { key: 'GST_RETURNS', label: 'GST return filing' },
      { key: 'EPFO', label: 'EPFO registration', code: 'EPFO', source: 'EPFO' },
      { key: 'ESIC', label: 'ESIC registration', code: 'ESIC', source: 'ESIC' },
    ],
  },
  {
    title: 'Eligibility',
    checks: [
      { key: 'STARTUP_INDIA', label: 'Startup India (DPIIT)', code: 'STARTUP_INDIA', source: 'Startup India' },
      { key: 'NSIC', label: 'NSIC registration', code: 'NSIC', source: 'NSIC' },
      { key: 'OEM_AUTHORIZATION', label: 'OEM authorisation', code: 'OEM_AUTHORIZATION', source: 'Submitted document' },
      { key: 'LOCAL_CONTENT', label: 'Make in India (local content)', code: 'LOCAL_CONTENT', source: 'Local content declaration' },
      { key: 'BIS', label: 'BIS certification' },
    ],
  },
  {
    title: 'Document and governance',
    checks: [
      { key: 'DIGILOCKER', label: 'DigiLocker', code: 'DIGILOCKER', source: 'DigiLocker' },
      { key: 'DEBARMENT', label: 'Debarment / blacklisting', code: 'DEBARMENT', source: 'Debarment list' },
    ],
  },
]

const COVERED = new Set(PASSPORT_GROUPS.flatMap(g => g.checks.map(c => c.code).filter(Boolean) as string[]))

export interface PassportRow {
  key: string
  group: string
  label: string
  result: PassportResult
  source: string
  sandbox: boolean
  checked: string | null
  reason: string
  submitted: string | null
  registry: RegistryResult | null
  requirement: Requirement | null
  evaluation: RequirementEvaluation | null
  documents: DocumentRecord[]
  findings: Finding[]
}

export interface PassportInput {
  c: CaseDetail
  evaluation: BidderEvaluation | null
  documents: DocumentRecord[]
  requirements: Requirement[]
  bidder: Bidder | null
}

// Backend explanations name the sandbox gateway 'mock'; say sandbox, which is what it is.
const clean = (t: string) => t.replace(/MOCK_GOVERNMENT_API \(mock\)/g, 'sandbox registry').replace(/\bmock registry\b/g, 'sandbox registry').replace(/\(mock\)/g, '(sandbox)')

const isSandbox = (r: RegistryResult | null | undefined) => !!r && (r.is_mock || r.details?.lookup === 'SANDBOX_REGISTRY')

function resultFromEvaluation(ev: RequirementEvaluation): PassportResult {
  switch (ev.status) {
    case 'VERIFIED': return 'Verified'
    case 'FAILED': return 'Non-compliant'
    case 'REQUIRES_REVIEW': return 'Review required'
    case 'PENDING': return 'Pending'
    case 'NOT_APPLICABLE': return 'Not applicable'
  }
}

function buildRow(group: string, def: CheckDef, input: PassportInput, requirement: Requirement | null): PassportRow {
  const { c, evaluation, documents, requirements, bidder } = input
  const code = def.code
  const reqType = requirement?.requirement_type ?? code
  const docCategory = requirement?.evidence_type ?? code
  const ev = reqType ? evaluation?.compliance_report?.requirement_evaluations.find(e => e.requirement_type === reqType) ?? null : null
  const registry = code ? evaluation?.government_verification.find(g => g.verification_type === code) ?? null : null
  const docs = docCategory ? documents.filter(d => d.category === docCategory) : []
  const findings = c.findings
    .filter(f => f.severity !== 'INFO' && f.disposition?.outcome !== 'DISMISSED')
    .filter(f => (requirement && (f.evidence?.requirement_id as string | undefined) === requirement.id) || (docCategory && findingCategories(f, requirements).includes(docCategory)))
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
  const sandbox = isSandbox(registry) || (ev?.evidence ?? []).some(e => /mock|sandbox/i.test(e))
  const upheld = findings.some(f => f.severity === 'HIGH' && f.disposition?.outcome === 'UPHELD')
  const openHigh = findings.some(f => f.severity === 'HIGH' && !f.disposition)
  const openMedium = findings.some(f => f.severity === 'MEDIUM' && !f.disposition)

  let result: PassportResult
  let reason = ''
  if (!code && !requirement) {
    result = 'Unavailable'
    reason = 'No verification source is connected for this check.'
  } else if (ev) {
    result = resultFromEvaluation(ev)
    reason = ev.explanation
  } else if (registry) {
    result = registry.status === 'VERIFIED' ? 'Verified' : registry.status === 'FAILED' || registry.status === 'MISMATCH' ? 'Non-compliant' : 'Review required'
    reason = `Registry returned ${registry.status.toLowerCase().replace(/_/g, ' ')}.`
  } else if (docs.length) {
    result = 'Not verified'
    reason = 'A document is on file. This tender does not require the check, so it was not verified.'
  } else {
    result = 'Not applicable'
    reason = 'Not required by this tender and no document submitted.'
  }
  if (result !== 'Not applicable' && result !== 'Unavailable') {
    if (result === 'Verified' || result === 'Not verified' || result === 'Pending') {
      if (upheld) result = 'Non-compliant'
      else if (openHigh || openMedium) result = 'Review required'
    } else if (result === 'Review required' && upheld) {
      result = 'Non-compliant'
    }
    if ((upheld || openHigh || openMedium) && findings[0] && (result === 'Review required' || result === 'Non-compliant')) {
      reason = `${findingTitle(findings[0].code, findings[0].title)}.`
    }
  }

  const source = result === 'Not applicable' ? 'Tender rules'
    : result === 'Unavailable' ? 'Not connected'
      : code === 'DEBARMENT' ? (sandbox ? 'Sandbox debarment list' : 'Debarment list')
        : registry ? `${def.source ?? categoryLabel(code)}${sandbox ? ' (sandbox)' : ''}`
          : docs.length ? 'Submitted document' : def.source ?? 'Tender rules'

  return {
    key: requirement ? `req:${requirement.id}` : def.key,
    group, label: def.label, result, source, sandbox,
    checked: (ev || registry) && result !== 'Not applicable' ? c.screened_at : null,
    reason: clean(reason), submitted: def.submitted?.(bidder) ?? (docs[0]?.original_filename ?? null),
    registry, requirement, evaluation: ev, documents: docs, findings,
  }
}

export function passportRows(input: PassportInput): PassportRow[] {
  const rows: PassportRow[] = []
  for (const g of PASSPORT_GROUPS) {
    for (const def of g.checks) {
      const requirement = def.code ? input.requirements.find(r => r.requirement_type === def.code) ?? null : null
      rows.push(buildRow(g.title, def, input, requirement))
    }
  }
  // Tender-specific requirements that are not one of the standard checks (turnover, experience).
  for (const r of input.requirements.filter(r => !COVERED.has(r.requirement_type))) {
    rows.push(buildRow('Document and governance', { key: r.id, label: r.description || categoryLabel(r.requirement_type) }, input, r))
  }
  return rows
}

export interface PassportSummary { verified: number; review: number; nonCompliant: number; pending: number; applicable: number }

export function passportSummary(rows: PassportRow[]): PassportSummary {
  const count = (r: PassportResult) => rows.filter(x => x.result === r).length
  const applicable = rows.filter(r => !['Not applicable', 'Unavailable'].includes(r.result)).length
  return { verified: count('Verified'), review: count('Review required'), nonCompliant: count('Non-compliant'), pending: count('Pending') + count('Not verified'), applicable }
}
