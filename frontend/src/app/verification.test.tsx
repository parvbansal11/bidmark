import { readFileSync } from 'node:fs'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { passportRows, passportSummary, verificationText } from '@/app/lib/passport'
import { riskLevel } from '@/app/features/officer/data'
import { VerificationValue } from '@/app/features/case/VerificationValue'
import type { BidderEvaluation, CaseDetail, DocumentRecord, Finding, Requirement, RequirementEvaluation, VerificationSummary } from '@/app/services/bidmark/types'

const summary = (over: Partial<VerificationSummary> = {}): VerificationSummary => ({
  applicable: 5, verified: 5, requires_review: 0, non_compliant: 0, pending: 0, submission: { expected: 4, submitted: 4 }, checks: [], ...over,
})

describe('verification summary card', () => {
  it('a bidder with complete submission but an open review is not shown as 100/100 compliant', () => {
    render(<VerificationValue v={summary({ verified: 4, requires_review: 1 })} />)
    expect(screen.getByText('4 of 5')).toBeInTheDocument()
    expect(screen.getByText('1 requires review')).toBeInTheDocument()
    expect(screen.getByText('Submission complete')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/100|\/ ?100|compliant/i)
  })

  it('a fully verified bidder', () => {
    const t = verificationText(summary())
    expect(t.headline).toBe('5 of 5')
    expect(t.details).toEqual([])
  })

  it('names failed and pending checks, and incomplete submission', () => {
    expect(verificationText(summary({ verified: 4, non_compliant: 1 })).details.map(d => d.text)).toEqual(['1 non-compliant'])
    const pending = verificationText(summary({ verified: 3, pending: 2, submission: { expected: 4, submitted: 2 } }))
    expect(pending.headline).toBe('3 of 5')
    expect(pending.details.map(d => d.text)).toEqual(['2 pending'])
    expect(pending.submission).toBe('2 of 4 documents submitted')
  })

  it('an unverified case never shows a verified count', () => {
    render(<VerificationValue v={null} />)
    expect(screen.getByText('Not yet verified')).toBeInTheDocument()
  })

  it('risk is independent of submission completeness', () => {
    // Risk comes from screening and the compliance report, not from what was submitted.
    expect(riskLevel('ESCALATED', 'LOW')).toBe('High')
    expect(verificationText(summary()).submission).toBe('Submission complete')
  })
})

const req = (type: string, evidence = type): Requirement => ({
  id: `r-${type}`, tender_id: 't', requirement_type: type, description: type, is_mandatory: true, threshold: null, threshold_unit: '', weight: 1, evidence_type: evidence,
})
const ev = (type: string, status: RequirementEvaluation['status']): RequirementEvaluation =>
  ({ requirement_type: type, status, explanation: '', evidence: [] } as unknown as RequirementEvaluation)
const doc = (category: string): DocumentRecord => ({ id: `d-${category}`, category, original_filename: `${category}.pdf` } as unknown as DocumentRecord)
const oemFinding: Finding = {
  id: 'f1', code: 'OVERLAPPING_TEXT', severity: 'HIGH', source: 'DOCUMENT', title: 'Text typed over other text', detail: '', document_id: 'd-OEM_AUTHORIZATION',
  category: 'OEM_AUTHORIZATION', page: 1, bbox: [1, 2, 3, 4], evidence: {}, reliability: { precision: 0.5, reviewed: 0 }, disposition: null,
}

function rows(statuses: Record<string, RequirementEvaluation['status']>, findings: Finding[] = [], extraRegistry: string[] = []) {
  const requirements = [req('GST'), req('MCA'), req('OEM_AUTHORIZATION'), req('TURNOVER', 'FINANCIAL'), req('DEBARMENT', 'OTHER'), req('PAN')]
  const evaluation = {
    compliance_report: { requirement_evaluations: Object.entries(statuses).map(([t, s]) => ev(t, s)) },
    government_verification: extraRegistry.map(t => ({ verification_type: t, status: 'VERIFIED', details: {}, is_mock: true })),
  } as unknown as BidderEvaluation
  const c = { findings, screened_at: null } as unknown as CaseDetail
  return passportRows({ c, evaluation, documents: ['GST', 'MCA', 'OEM_AUTHORIZATION', 'FINANCIAL', 'UDYAM'].map(doc), requirements, bidder: null })
}
const all = { GST: 'VERIFIED', MCA: 'VERIFIED', OEM_AUTHORIZATION: 'VERIFIED', TURNOVER: 'VERIFIED', DEBARMENT: 'VERIFIED', PAN: 'NOT_APPLICABLE' } as const

describe('compliance passport counts', () => {
  it('an open forensic finding makes the check review required, not verified', () => {
    expect(passportSummary(rows(all, [oemFinding]))).toEqual({ verified: 4, review: 1, nonCompliant: 0, pending: 0, applicable: 5 })
  })

  it('review required, pending and failed are never counted as verified', () => {
    const s = passportSummary(rows({ ...all, GST: 'REQUIRES_REVIEW', MCA: 'PENDING', TURNOVER: 'FAILED' }))
    expect(s).toEqual({ verified: 2, review: 1, nonCompliant: 1, pending: 1, applicable: 5 })
  })

  it('not-applicable and not-required checks stay out of the denominator', () => {
    // PAN is not applicable; UDYAM is on file and registry-verified but the tender does not require it.
    const s = passportSummary(rows(all, [], ['UDYAM']))
    expect(s).toEqual({ verified: 5, review: 0, nonCompliant: 0, pending: 0, applicable: 5 })
  })
})

describe('no bidder-specific hardcoding', () => {
  it('the summary code names no bidder', () => {
    for (const f of ['src/app/lib/passport.ts', 'src/app/features/case/VerificationValue.tsx', 'src/app/features/case/CasePage.tsx']) {
      expect(readFileSync(f, 'utf8')).not.toMatch(/Coastal|Hydraulics/)
    }
  })
})
