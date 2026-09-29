// BIDMARK Verification Architecture — frontend types

export type BidmarkVerdict = 'VERIFIED' | 'NEEDS_REVIEW' | 'FLAGGED'
export type BidmarkFusionVerdict =
  | 'RECOMMEND_APPROVAL'
  | 'RECOMMEND_REVIEW'
  | 'RECOMMEND_REJECTION'

export interface BidmarkCheck {
  check: string
  status: 'PASS' | 'FLAG' | 'MISSING' | 'PENDING' | 'REVIEW'
  source: string
  identifier?: string | null
  value?: unknown
  expected?: string
  note: string
}

export interface BidmarkInconsistency {
  what: string
  where: string
  why: string
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
  evidence: {
    source: string
    value_found?: unknown
    value_expected?: string
  }
}

export interface BidmarkFlag {
  flag: string
  what: string
  why: string
  which_source: string
  how_serious: string
  what_to_review: string
  module: string
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
}

export interface BidmarkConsentEntry {
  data_type: string
  source: string
  authorization: string
  purpose: string
  accessed_at: string
  is_mock: boolean
}

export interface BidmarkAnalysis {
  id: string
  bidder_id: string
  tender_id: string

  // Module 1
  entity_verdict: BidmarkVerdict
  entity_confidence: number
  entity_summary: string
  entity_checks: BidmarkCheck[]

  // Module 2
  compliance_verdict: BidmarkVerdict
  compliance_confidence: number
  compliance_summary: string
  compliance_checks: BidmarkCheck[]

  // Module 3
  document_verdict: BidmarkVerdict
  document_confidence: number
  document_summary: string
  document_checks: BidmarkCheck[]

  // Fusion
  fusion_verdict: BidmarkFusionVerdict
  fusion_confidence: number
  fusion_explanation: string

  detected_inconsistencies: BidmarkInconsistency[]
  explainable_flags: BidmarkFlag[]
  consent_audit: BidmarkConsentEntry[]

  completed_at?: string | null
  created_at?: string | null
}

// Bidder-friendly summary (no internal module names)
export interface BidmarkActionItem {
  title: string
  description: string
  priority: 'URGENT' | 'ATTENTION'
}

export interface BidmarkSummary {
  entity_status: string
  compliance_status: string
  document_status: string
  overall_status: string
  overall_message: string
  action_items: BidmarkActionItem[]
  completed_at?: string | null
}

// PO tender overview
export interface BidmarkTenderSummaryRow {
  bidder_id: string
  company_name: string
  entity_verdict: BidmarkVerdict | null
  compliance_verdict: BidmarkVerdict | null
  document_verdict: BidmarkVerdict | null
  fusion_verdict: BidmarkFusionVerdict | null
  fusion_confidence: number | null
  flag_count: number | null
  analysed: boolean
  completed_at?: string | null
}
