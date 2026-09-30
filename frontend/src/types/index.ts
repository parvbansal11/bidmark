// Shared domain types mirroring the FastAPI backend's Pydantic schemas.
// Kept intentionally loose (optional fields, string dates) to match the
// permissive JSON the API actually returns.

export type UserRole = 'BIDDER' | 'PROCUREMENT_OFFICER' | 'ADMIN' | 'AUDITOR'

export interface User {
  id: string
  email: string
  full_name: string
  role: UserRole
  is_active: boolean
}

export interface ApiEnvelope<T> {
  success: boolean
  data: T
  message: string
  timestamp: string
}

export interface ApiErrorBody {
  success: false
  error: { code: string; message: string; details?: unknown }
  timestamp: string
}

export interface AdminUser {
  id: string
  email: string
  full_name: string
  role: UserRole
  is_active: boolean
  created_at: string
}

export interface Bidder {
  id: string
  user_id?: string | null
  company_name: string
  legal_name?: string | null
  pan_number?: string | null
  gstin?: string | null
  cin?: string | null
  udyam_number?: string | null
  registered_address?: string | null
  incorporation_date?: string | null
  contact_email?: string | null
  contact_phone?: string | null
  website?: string | null
  status: string
  created_at: string
  updated_at: string
}

export interface Requirement {
  id: string
  tender_id: string
  requirement_type: string
  description: string
  is_mandatory: boolean
  threshold?: number | null
  threshold_unit?: string | null
  weight: number
  evidence_type: string
}

export const TENDER_TYPE_OPTIONS = ['OPEN_TENDER', 'LIMITED_TENDER', 'SINGLE_TENDER'] as const
export const TENDER_CATEGORY_OPTIONS = ['GOODS', 'SERVICES', 'WORKS'] as const
export const TENDER_MODE_OPTIONS = ['ONLINE', 'OFFLINE', 'HYBRID'] as const
export const BID_SYSTEM_OPTIONS = ['SINGLE_PACKET', 'TWO_PACKET'] as const

export interface Tender {
  id: string
  tender_number: string
  gem_tender_id?: string | null
  custom_tender_id?: string | null
  title: string
  department: string
  organization: string
  description?: string | null
  estimated_value?: number | null
  published_at?: string | null
  deadline?: string | null
  status: string
  tender_type?: string | null
  tender_category?: string | null
  tender_mode?: string | null
  bid_system?: string | null
  location?: string | null
  bid_validity_days?: number | null
  is_flagged?: boolean
  flagged_reason?: string | null
  created_at: string
  updated_at: string
  requirements?: Requirement[]
}

export const DOCUMENT_CATEGORIES = [
  'GST', 'PAN', 'UDYAM', 'INCOME_TAX', 'MCA', 'STARTUP_INDIA', 'NSIC',
  'EPFO', 'ESIC', 'OEM_AUTHORIZATION', 'LOCAL_CONTENT', 'EXPERIENCE_CERTIFICATE',
  'FINANCIAL', 'DEBARMENT', 'DIGILOCKER', 'OTHER',
] as const

export interface DocumentExtraction {
  id: string
  document_id: string
  extraction_provider: string
  company_name?: string | null
  registration_number?: string | null
  pan?: string | null
  gstin?: string | null
  cin?: string | null
  address?: string | null
  turnover_crore?: number | null
  issue_date?: string | null
  validity_date?: string | null
  document_number?: string | null
  extraction_confidence: number
}

export interface VerificationResult {
  id: string
  document_id: string
  verification_type: string
  status: string
  is_mock: boolean
  government_source: string
  reference_id?: string | null
  reasons?: string[]
  details?: Record<string, unknown>
  verified_at?: string | null
}

export interface DocumentItem {
  id: string
  bidder_id: string
  tender_id?: string | null
  category: string
  original_filename: string
  mime_type: string
  file_size_bytes: number
  status: string
  created_at: string
  extraction?: DocumentExtraction
  verification_results?: VerificationResult[]
}

export interface CrossCheckResult {
  id: string
  field: string
  relation: string
  sources: string[]
  values: unknown[]
  status: 'MATCH' | 'MINOR_VARIATION' | 'MAJOR_MISMATCH' | 'NOT_APPLICABLE'
  requires_review: boolean
}

export interface Discrepancy {
  id: string
  category: string
  description: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH'
  affected_requirement_type?: string | null
  score_impact: number
}

export interface RequirementEvaluation {
  id: string
  requirement_id: string
  requirement_type: string
  status: 'VERIFIED' | 'FAILED' | 'PENDING' | 'REQUIRES_REVIEW' | 'NOT_APPLICABLE'
  evidence: string[]
  discrepancies: string[]
  explanation: string
  score_contribution: number
  max_score_contribution: number
}

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH'

export interface ComplianceReport {
  id: string
  bidder_id: string
  tender_id: string
  overall_score: number
  risk_level: RiskLevel
  verified_count: number
  failed_count: number
  pending_count: number
  requires_review_count: number
  not_applicable_count: number
  critical_issues: string[]
  generated_at?: string | null
  requirement_evaluations: RequirementEvaluation[]
}

export type AIRecommendationValue = 'COMPLIANT' | 'REQUIRES_REVIEW' | 'NON_COMPLIANT'

export interface AIRecommendation {
  recommendation: AIRecommendationValue
  confidence: number
  reasons: string[]
  critical_issues: string[]
  missing_requirements: string[]
  recommended_actions: string[]
  disclaimer: string
}

export interface ForensicAnalysis {
  id: string
  document_id: string
  forensic_risk_score: number
  risk_level: RiskLevel
  signals: { type: string; weight: number; confidence: string }[]
  evidence: string[]
  requires_human_review: boolean
}

export interface DocumentFingerprint {
  id: string
  document_id: string
  bidder_id: string
  file_hash: string
  normalized_text_hash: string
  structural_features: Record<string, unknown>
  metadata_features: Record<string, unknown>
  document_type: string
}

export interface FingerprintComparison {
  id: string
  document_a_id: string
  document_b_id: string
  bidder_a_id: string
  bidder_b_id: string
  similarity_score: number
  level: RiskLevel
  common_sections: string[]
  requires_review: boolean
}

export interface BehavioralFlag {
  category: string
  indicator: string
  evidence: string
  confidence: string
  score_impact: number
  requires_human_review: boolean
}

export interface BehavioralRiskReport {
  id: string
  bidder_id: string
  tender_id: string
  behavioral_risk_score: number
  risk_level: RiskLevel
  requires_human_review: boolean
  disclaimer: string
  flags: BehavioralFlag[]
}

export interface GraphNode {
  id: string
  label: string
  type: string
}
export interface GraphEdge {
  source: string
  target: string
  type: string
  evidence?: string
  weight?: number
}
export interface RelationshipGraph {
  tender_id: string
  nodes: GraphNode[]
  edges: GraphEdge[]
  disclaimer: string
}

export interface RedFlagCascadeItem {
  source_evidence: string
  anomaly: string
  affected_requirement: string
  score_impact: number
  risk_level: RiskLevel
  review_recommendation: string
  officer_action: string
}

export interface SimulatedBidderResult {
  bidder_id: string
  company_name: string
  baseline_score: number | null
  baseline_risk_level: RiskLevel | null
  simulated_score: number
  simulated_risk_level: RiskLevel
  score_delta: number | null
  failed_requirements: string[]
  requirement_details: { requirement_type: string; status: string; threshold_used: number | null; explanation: string }[]
  simulated_rank: number
}

export interface SimulationResult {
  tender_id: string
  overrides_applied: unknown[]
  note: string
  bidders: SimulatedBidderResult[]
}

export type DecisionValue = 'QUALIFIED' | 'DISQUALIFIED' | 'PENDING_REVIEW'

export interface OfficerDecision {
  id: string
  bidder_id: string
  tender_id: string
  officer_id: string
  decision: DecisionValue
  reason: string
  decided_at?: string | null
}

export interface AuditLogEntry {
  id: string
  actor_id?: string | null
  actor_role?: string | null
  action: string
  entity_type?: string | null
  entity_id?: string | null
  bidder_id?: string | null
  tender_id?: string | null
  description: string
  metadata: Record<string, unknown>
  created_at: string
}

export interface Bidder360 {
  bidder: Partial<Bidder> & { id: string; company_name: string }
  tender: { id: string; title: string; tender_number: string }
  compliance_report: (Omit<ComplianceReport, 'id' | 'bidder_id' | 'tender_id' | 'not_applicable_count' | 'generated_at'> & {
    requirement_evaluations: Pick<RequirementEvaluation, 'requirement_type' | 'status' | 'evidence' | 'discrepancies' | 'explanation' | 'score_contribution' | 'max_score_contribution'>[]
  }) | null
  government_verification: { verification_type: string; status: string; reference_id?: string | null; is_mock: boolean; details: Record<string, unknown> }[]
  documents: { id: string; category: string; original_filename: string; status: string }[]
  cross_document_checks: Pick<CrossCheckResult, 'field' | 'relation' | 'sources' | 'values' | 'status' | 'requires_review'>[]
  discrepancies: Pick<Discrepancy, 'category' | 'description' | 'severity' | 'score_impact'>[]
  forensic_risk: { document_id: string; forensic_risk_score: number; risk_level: RiskLevel; signals: unknown[]; evidence: string[] }[]
  behavioral_risk: { score: number; risk_level: RiskLevel; flags: { category: string; indicator: string; evidence: string; confidence: string }[] } | null
  red_flag_cascade: RedFlagCascadeItem[]
  ai_recommendation: AIRecommendation | null
  officer_decision: { decision: DecisionValue; reason: string; officer_id: string; decided_at?: string | null } | null
}

export interface BidSubmission {
  id: string
  tender_id: string
  bidder_id: string
  quoted_price?: number | null
  local_content_percent?: number | null
  declared_turnover_crore?: number | null
  submitted_at?: string | null
  status: string
}

// ---------------------------------------------------------------------------
// Bidder Portal — self-scoped, already-translated data for the BIDDER role.
// ---------------------------------------------------------------------------

export interface PortalNotification {
  id: string
  type: string
  title: string
  message: string
  is_read: boolean
  tender_id?: string | null
  created_at: string
}

export interface PortalTenderSummary {
  tender_id: string
  title: string
  tender_number: string
  gem_tender_id?: string | null
  organization: string
  department: string
  deadline?: string | null
  published_at?: string | null
  status: string
  bid_status: string
  compliance_percent: number | null
  documents_required: number
  documents_submitted: number
  bid_submitted: boolean
}

export interface PortalDocument {
  id: string
  category: string
  label: string
  original_filename: string
  uploaded_at?: string | null
  validity_date?: string | null
  status: 'VERIFIED' | 'PENDING_REVIEW' | 'ACTION_REQUIRED' | 'EXPIRING_SOON'
  tender_id?: string | null
  reusable: boolean
}

export interface PortalComplianceCategory {
  category: string
  label: string
  percent: number | null
  status: 'COMPLIANT' | 'PARTIALLY_COMPLIANT' | 'MISSING' | 'PENDING_VERIFICATION'
}

export interface PortalComplianceStatus {
  overall_compliance_percent: number | null
  categories: PortalComplianceCategory[]
  tenders: { tender_id: string; title: string; overall_score: number | null; risk_level: RiskLevel | null }[]
}

export interface PortalComplianceDetail {
  tender_id: string
  overall_score: number | null
  risk_level: RiskLevel | null
  requirements: { requirement_type: string; label: string; status: string; explanation: string; score_contribution: number; max_score_contribution: number }[]
}

export interface PortalActionItem {
  priority: 'CRITICAL' | 'NEEDS_ATTENTION'
  title: string
  description: string
  action: 'UPLOAD' | 'REPLACE' | 'CORRECT' | 'REVIEW'
  category: string
  tender_id: string
  tender_title: string
}

export interface PortalActionItems {
  critical: PortalActionItem[]
  needs_attention: PortalActionItem[]
  completed: { title: string; tender_id: string; tender_title: string }[]
}

export interface PortalSubmission {
  tender_id: string
  tender_title: string
  technical_bid_status: string
  financial_bid_status: string
  documents_submitted: number
  submitted_at?: string | null
  compliance_at_submission: number | null
  evaluation_status: string
  read_only: boolean
}

export interface PortalDashboard {
  welcome_name: string
  summary: {
    active_tenders: number
    documents_submitted: number
    overall_compliance_percent: number | null
    actions_required: number
  }
  action_required: PortalActionItem[]
  my_tenders: PortalTenderSummary[]
  recent_notifications: PortalNotification[]
}
