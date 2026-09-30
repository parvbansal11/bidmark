import { describe, expect, it } from 'vitest'
import { bidStatus, forensicsCell, requirementCell } from './bidmarkStatus'
import type { BidderEvaluation, DocumentRecord, Finding, Requirement } from '@/app/services/bidmark/types'

const req = (over: Partial<Requirement> = {}): Requirement => ({
  id: 'r-oem', tender_id: 't', requirement_type: 'OEM_AUTHORIZATION', description: 'OEM valid on bid date', is_mandatory: true,
  threshold: null, threshold_unit: 'NONE', weight: 1, evidence_type: 'OEM_AUTHORIZATION', ...over,
})

const evaluation = (status: string): BidderEvaluation => ({
  bidder: { id: 'b', company_name: 'X', legal_name: 'X', pan_number: null, gstin: null, cin: null, registered_address: null, status: 'ACTIVE' },
  tender: { id: 't', title: 'T', tender_number: 'N' },
  compliance_report: { overall_score: 100, risk_level: 'LOW', requirement_evaluations: [
    { requirement_type: 'OEM_AUTHORIZATION', status: status as 'VERIFIED', evidence: [], discrepancies: [], explanation: '' },
  ] },
  government_verification: [], documents: [], cross_document_checks: [],
})

const doc: DocumentRecord = {
  id: 'd1', bidder_id: 'b', tender_id: null, category: 'OEM_AUTHORIZATION', original_filename: 'oem.pdf', mime_type: 'application/pdf',
  file_size_bytes: 1, file_hash_sha256: 'x', status: 'VERIFIED', uploaded_at: '2026-09-27T00:00:00',
}

const finding = (over: Partial<Finding> = {}): Finding => ({
  id: 'f1', code: 'OVERLAPPING_TEXT', severity: 'HIGH', source: 'DOCUMENT', title: 't', detail: 'd', document_id: 'd1',
  category: 'OEM_AUTHORIZATION', page: 1, bbox: [1, 2, 3, 4], evidence: {}, reliability: { precision: 0.5, reviewed: 0 }, disposition: null, ...over,
})

describe('requirement cell semantics', () => {
  it('a registry "verified" requirement still shows a finding when its document was tampered with', () => {
    const cell = requirementCell(req(), evaluation('VERIFIED'), [finding()], [doc], [req()])
    expect(cell.kind).toBe('finding')
  })

  it('a missing mandatory document is "Missing", never pending or passed', () => {
    const cell = requirementCell(req(), evaluation('PENDING'), [], [], [req()])
    expect(cell.kind).toBe('not_submitted')
    expect(cell.label).toBe('Missing')
  })

  it('no evaluation on record is "Not checked", never a pass', () => {
    const cell = requirementCell(req(), null, [], [doc], [req()])
    expect(cell.kind).toBe('unchecked')
  })
})

describe('bid status', () => {
  it('describes screening output and never states a qualification', () => {
    expect(bidStatus({ stage: 'SCREENED', counts: { HIGH: 2, MEDIUM: 0, LOW: 0, INFO: 0 } }).kind).toBe('finding')
    expect(bidStatus({ stage: 'SCREENED', counts: { HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 } }).label).toBe('No findings')
    expect(bidStatus({ stage: 'SUBMITTED', counts: { HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 } }).kind).toBe('processing')
  })

  it('forensics with no signals says so rather than "passed"', () => {
    expect(forensicsCell([]).label).toBe('No signals')
  })
})
