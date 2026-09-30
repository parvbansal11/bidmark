export type Role = 'ADMIN' | 'PROCUREMENT_OFFICER' | 'BIDDER' | 'AUDITOR'

export interface User {
  id: string
  email: string
  full_name: string
  role: Role
  is_active: boolean
  created_at?: string
}

export type Severity = 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'
export type FindingSource = 'DOCUMENT' | 'CROSS_CHECK' | 'REQUIREMENT' | 'CARTEL'
export type SeverityCounts = Record<Severity, number>

export type CaseStage =
  | 'DRAFT' | 'SUBMITTED' | 'SCREENED' | 'IN_REVIEW' | 'CLARIFICATION_REQUESTED'
  | 'CLARIFICATION_RECEIVED' | 'DECIDED' | 'WITHDRAWN'
export type Lane = 'ESCALATED' | 'STANDARD' | 'FAST_TRACK'
export type Recommendation = 'RECOMMEND_APPROVAL' | 'RECOMMEND_REVIEW' | 'RECOMMEND_REJECTION'
export type Decision = 'QUALIFIED' | 'DISQUALIFIED'

export interface NextAction { code: string; label: string }

export interface QueueRow {
  case_id: string
  tender_id: string
  tender_number: string
  tender_title: string
  bidder_id: string
  bidder_name: string
  stage: CaseStage
  lane: Lane | null
  priority: number
  counts: SeverityCounts
  in_ring: boolean
  ai_recommendation: Recommendation | null
  decision: Decision | null
  assigned_officer_id: string | null
  sla_due_at: string | null
  sla_breached: boolean
  next_action: NextAction
}

export type BBox = [number, number, number, number]

export interface EvidencePin {
  document_id: string
  category: string
  field: string
  page: number
  bbox: BBox
  value: string
  simulated: boolean
}

export interface Disposition {
  outcome: 'UPHELD' | 'DISMISSED'
  note: string
  officer_id: string
  at: string
}

export interface Finding {
  id: string
  code: string
  severity: Severity
  source: FindingSource
  title: string
  detail: string
  document_id: string | null
  category: string | null
  filename?: string | null
  page: number | null
  bbox: BBox | null
  evidence: Record<string, unknown> & { pins?: EvidencePin[] }
  reliability: { precision: number; reviewed: number }
  disposition: Disposition | null
}

export interface Clarification {
  id: string
  case_id: string
  finding_id: string | null
  question: string
  requested_category: string | null
  status: 'OPEN' | 'ANSWERED'
  due_at: string | null
  response_text: string | null
  response_document_id: string | null
  answered_at: string | null
  asked_at: string
}

export interface CaseSummary {
  compliance_score?: number
  compliance_risk?: string
  fusion_verdict?: string
  fusion_confidence?: number
  counts?: SeverityCounts
  sources?: Record<FindingSource, number>
  in_ring?: boolean
  recommendation_rationale?: string
}

// Tender requirements the compliance report applies to this bid, counted without weighting.
// Only a requirement verified with no open or upheld finding on its evidence counts as verified.
export interface VerificationSummary {
  applicable: number
  verified: number
  requires_review: number
  non_compliant: number
  pending: number
  submission: { expected: number; submitted: number }
  checks: { requirement_type: string; status: 'VERIFIED' | 'REQUIRES_REVIEW' | 'NON_COMPLIANT' | 'PENDING'; evidence_expected: boolean; evidence_submitted: boolean }[]
}

export interface CaseDetail {
  id: string
  tender_id: string
  bidder_id: string
  stage: CaseStage
  lane: Lane | null
  priority: number
  assigned_officer_id: string | null
  summary: CaseSummary
  findings: Finding[]
  undisposed_high: string[]
  verification?: VerificationSummary | null
  screened_at: string | null
  sla_due_at: string | null
  sla_breached: boolean
  decision: Decision | null
  decision_reason: string | null
  decided_by: string | null
  decided_at: string | null
  ai_recommendation: Recommendation | null
  audit_anchor: string | null
  allowed_transitions: CaseStage[]
  clarifications: Clarification[]
}

export interface Tender {
  id: string
  tender_number: string
  title: string
  department: string
  organization: string
  description: string | null
  estimated_value: number | null
  published_at: string | null
  deadline: string | null
  status: string
  gem_tender_id: string | null
  tender_type: string | null
  tender_category: string | null
  tender_mode: string | null
  bid_system: string | null
  location: string | null
  bid_validity_days: number | null
  is_flagged: boolean
  flagged_reason: string | null
  created_at: string
}

export interface Requirement {
  id: string
  tender_id: string
  requirement_type: string
  description: string
  is_mandatory: boolean
  threshold: number | null
  threshold_unit: string
  weight: number
  evidence_type: string
}

export interface Director { name: string; din: string }

export interface Bidder {
  id: string
  user_id: string | null
  company_name: string
  legal_name: string | null
  pan_number: string | null
  gstin: string | null
  cin: string | null
  udyam_number: string | null
  registered_address: string | null
  incorporation_date: string | null
  contact_email: string | null
  contact_phone: string | null
  website: string | null
  status: string
  directors: Director[] | null
}

export interface DocumentRecord {
  id: string
  bidder_id: string
  tender_id: string | null
  category: string
  original_filename: string
  mime_type: string
  file_size_bytes: number
  file_hash_sha256: string
  status: string
  uploaded_at: string
}

export interface BidSubmission {
  id: string
  tender_id: string
  bidder_id: string
  quoted_price: number | null
  local_content_percent: number | null
  declared_turnover_crore: number | null
  submitted_at: string | null
  status: string
}

export type CheckStatus = 'PASS' | 'FLAG' | 'UNMEASURED'

export interface ExtractedField {
  field: string
  value: string | number | null
  raw: string | null
  label: string | null
  page: number | null
  bbox: BBox | null
  line_text?: string
  fonts?: string[]
  source?: string
  confidence?: number
  simulated?: boolean
}

export interface ForensicSignal {
  code: string
  severity: Severity
  title: string
  detail: string
  confidence: string
  page: number | null
  bbox: BBox | null
  field: string | null
  evidence: Record<string, unknown>
}

export interface SignatureInfo {
  field: string
  intact: boolean
  valid: boolean
  trusted: boolean
  coverage: string
  modification_level: string
  signer: string
  signed_at: string
}

export interface DocumentEvidence {
  document: {
    id: string
    category: string
    filename: string
    mime_type: string
    sha256: string
    size_bytes: number
    status: string
  }
  simulated: boolean
  readable: boolean
  method: string
  detected_type: string | null
  pages: number
  page_sizes: [number, number][]
  fields: Record<string, ExtractedField>
  signals: ForensicSignal[]
  checks: { code: string; status: CheckStatus; note: string }[]
  structure: {
    kind: string
    metadata?: Record<string, unknown>
    revisions?: number
    signatures?: SignatureInfo[]
    fonts?: Record<string, number>
  } | null
}

export interface RequirementEvaluation {
  requirement_type: string
  status: 'VERIFIED' | 'FAILED' | 'PENDING' | 'NOT_APPLICABLE' | 'REQUIRES_REVIEW'
  evidence: string[]
  discrepancies: unknown[]
  explanation: string
}

export interface RegistryResult {
  verification_type: string
  status: string
  reference_id: string | null
  is_mock: boolean
  details: Record<string, unknown>
}

export interface CrossDocumentCheck {
  field: string
  relation: string
  sources: string[]
  values: unknown[]
  status: string
  requires_review: boolean
}

export interface BidderEvaluation {
  bidder: Pick<Bidder, 'id' | 'company_name' | 'legal_name' | 'pan_number' | 'gstin' | 'cin' | 'registered_address' | 'status'>
  tender: { id: string; title: string; tender_number: string }
  compliance_report: {
    overall_score: number
    risk_level: string
    requirement_evaluations: RequirementEvaluation[]
  } | null
  government_verification: RegistryResult[]
  documents: { id: string; category: string; original_filename: string; status: string }[]
  cross_document_checks: CrossDocumentCheck[]
}

export type LinkType =
  | 'SHARED_DEVICE' | 'SHARED_IP' | 'SHARED_NETWORK' | 'SHARED_DIRECTOR' | 'SHARED_PHONE' | 'SHARED_EMAIL'
  | 'SHARED_EMAIL_DOMAIN' | 'SHARED_ADDRESS' | 'SHARED_DOCUMENT_AUTHOR' | 'IDENTICAL_FILE' | 'SYNCHRONIZED_SUBMISSION'
  | string

export interface BidderLink {
  a: string
  b: string
  type: LinkType
  weight: number
  detail: string
  evidence: Record<string, unknown>
}

export interface Ring {
  members: string[]
  strength: number
  link_types: LinkType[]
  links: BidderLink[]
  cover_pattern: {
    designated_low: string
    covers: string[]
    low_is_tender_lowest: boolean
    detail: string
  } | null
}

export interface PriceScreens {
  n_bids: number
  flags: { code: string; severity: Severity; detail: string }[]
  mean?: number
  cv?: number
  relative_distance?: number
  step_ratios?: number[]
}

export interface TenderIntelligence {
  tender_id: string
  links: BidderLink[]
  rings: Ring[]
  price_screens: PriceScreens
  per_bidder: Record<string, { code: string; severity: Severity; detail: string }[]>
  bidder_names?: Record<string, string>
}

export interface ChainStatus {
  intact: boolean
  entries: number
  head_seq: number
  head_hash: string
  broken_at?: number
  problem?: string
}

export interface AuditEntry {
  id: string
  actor_id: string | null
  actor_role: Role | null
  action: string
  entity_type: string | null
  entity_id: string | null
  bidder_id: string | null
  tender_id: string | null
  description: string
  metadata: Record<string, unknown>
  created_at: string
  seq: number
  row_hash: string
  prev_hash: string
}

export interface TimelineEvent {
  seq: number
  at: string
  action: string
  actor_role: Role | null
  actor_id: string | null
  description: string
  metadata: Record<string, unknown>
  row_hash: string
}

export interface RuleReliability {
  code: string
  precision: number
  reviewed: number
  upheld?: number
  dismissed?: number
}

export type CitationType = 'finding' | 'document' | 'check' | 'relationship' | 'audit'

export interface Citation {
  type: CitationType
  id: string
  label: string
  document_id?: string | null
  page?: number | null
  requirement_type?: string
  bidder_id?: string
  seq?: number
}

export interface CopilotAnswer {
  answer: string
  evidence: string[]
  question: string
  disclaimer: string
  provider?: string
  intent?: string
  citations?: Citation[]
  suggestions?: string[]
}

export interface CopilotStatus { mode: 'deterministic'; model: string | null }

// Home payloads, one per role
export interface OfficerStats {
  to_review: number
  escalated: number
  standard: number
  fast_track: number
  sla_breached: number
  linked_bidders: number
  awaiting_bidder: number
  decided_last_24h: number
}

export interface HomeUser { id: string; name: string; email: string; role: Role }

export interface OfficerHome {
  role: 'PROCUREMENT_OFFICER'
  stats: OfficerStats
  queue: QueueRow[]
  tasks: { code: string; label: string; case_id?: string; tender_id?: string }[]
  user: HomeUser
}

export interface BidderTask {
  code: string
  label: string
  case_id?: string
  tender_id?: string
  document_id?: string
  category?: string
  valid_until?: string
  expired?: boolean
}

export interface BidderCase {
  id: string
  tender_id: string
  tender_title: string | null
  stage: 'DRAFT' | 'SUBMITTED' | 'UNDER_EVALUATION' | 'CLARIFICATION_REQUESTED' | 'DECIDED' | string
  missing_documents: string[]
  clarifications: Clarification[]
  open_clarifications: number
  decision: Decision | null
  decision_reason: string | null
  next_action: NextAction
}

export interface BidderHome {
  role: 'BIDDER'
  bidder_id: string
  company_name: string
  status: string
  profile_complete: boolean
  tasks: BidderTask[]
  cases: BidderCase[]
  open_tenders: { id: string; tender_number: string; title: string; deadline: string | null; already_bidding: boolean }[]
  expiring_documents: { document_id: string; category: string; valid_until: string; expired: boolean }[]
  user: HomeUser
}

export interface AuditorDecision {
  seq: number
  at: string
  description: string
  case_id: string
  row_hash: string
  decision: Decision
  ai_recommendation: Recommendation | null
  against_ai: boolean
  upheld_high: string[]
}

export interface AuditorHome {
  role: 'AUDITOR'
  audit_chain: ChainStatus
  stats: { decisions: number; against_ai: number; high_findings_dismissed: number; dispositions: number }
  tasks: { code: string; label: string; case_id?: string }[]
  recent_decisions: AuditorDecision[]
  user: HomeUser
}

export interface AdminHome {
  role: 'ADMIN'
  stats: {
    tenders: number
    tenders_by_status: Record<string, number>
    users_by_role: Record<Role, number>
    cases_by_stage: Record<string, number>
  }
  tasks: { code: string; label: string; tender_id?: string }[]
  rules: RuleReliability[]
  audit_chain: ChainStatus
  officer_view: OfficerStats
  user: HomeUser
}

export type Home = OfficerHome | BidderHome | AuditorHome | AdminHome

export interface PortalTender {
  tender_id: string
  title: string
  tender_number: string
  gem_tender_id: string | null
  organization: string
  department: string
  deadline: string | null
  published_at: string | null
  status: string
  bid_status: string
  compliance_percent: number | null
  documents_required: number
  documents_submitted: number
  bid_submitted: boolean
}

export interface PortalRequirementStatus {
  requirement_type: string
  label: string
  status: RequirementEvaluation['status']
  explanation: string
}

export interface Notification {
  id: string
  type: string
  title: string
  message: string
  is_read: boolean
  tender_id: string | null
  created_at: string
}
