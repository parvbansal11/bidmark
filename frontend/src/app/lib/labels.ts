import type { CaseStage, FindingSource, Lane, LinkType, Recommendation, Role, Severity } from '@/app/services/bidmark/types'
import { humanise } from './format'

export const ROLE_LABEL: Record<Role, string> = {
  PROCUREMENT_OFFICER: 'Procurement Officer',
  BIDDER: 'Bidder',
  AUDITOR: 'Auditor',
  ADMIN: 'Administrator',
}

export const ROLE_HOME: Record<Role, string> = {
  PROCUREMENT_OFFICER: '/officer',
  BIDDER: '/seller',
  AUDITOR: '/auditor',
  ADMIN: '/admin',
}

export const CATEGORY_LABEL: Record<string, string> = {
  GST: 'GST registration',
  PAN: 'PAN',
  UDYAM: 'Udyam / MSME',
  INCOME_TAX: 'Income tax return',
  MCA: 'Certificate of incorporation',
  STARTUP_INDIA: 'Startup India (DPIIT)',
  NSIC: 'NSIC registration',
  EPFO: 'EPFO registration',
  ESIC: 'ESIC registration',
  OEM_AUTHORIZATION: 'OEM authorisation',
  LOCAL_CONTENT: 'Make in India (local content)',
  EXPERIENCE_CERTIFICATE: 'Experience certificate',
  FINANCIAL: 'CA turnover certificate',
  TURNOVER: 'Turnover',
  DEBARMENT: 'Debarment check',
  DIGILOCKER: 'DigiLocker',
  OTHER: 'Other document',
}

export const REQUIREMENT_SHORT: Record<string, string> = {
  GST: 'GST',
  PAN: 'PAN',
  MCA: 'CIN / MCA',
  UDYAM: 'Udyam',
  OEM_AUTHORIZATION: 'OEM',
  TURNOVER: 'Turnover',
  FINANCIAL: 'Turnover',
  DEBARMENT: 'Debarment',
  LOCAL_CONTENT: 'Make in India',
  EXPERIENCE_CERTIFICATE: 'Experience',
  EPFO: 'EPFO',
  ESIC: 'ESIC',
  NSIC: 'NSIC',
  OTHER: 'Other',
}

export const categoryLabel = (c: string | null | undefined) => (c ? CATEGORY_LABEL[c] ?? humanise(c) : 'Uncategorised')

export const STAGE_LABEL: Record<CaseStage, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  SCREENED: 'Screened, awaiting review',
  IN_REVIEW: 'In officer review',
  CLARIFICATION_REQUESTED: 'Clarification requested',
  CLARIFICATION_RECEIVED: 'Clarification received',
  DECIDED: 'Decided',
  WITHDRAWN: 'Withdrawn',
}

export const LANE_LABEL: Record<Lane, string> = {
  ESCALATED: 'Escalated',
  STANDARD: 'Standard',
  FAST_TRACK: 'Fast track',
}

export const LANE_NOTE: Record<Lane, string> = {
  ESCALATED: 'Tampering or linked-bidder signal. 1 day SLA.',
  STANDARD: 'At least one finding to review. 2 day SLA.',
  FAST_TRACK: 'No findings raised. 3 day SLA.',
}

export const RECOMMENDATION_LABEL: Record<Recommendation, string> = {
  RECOMMEND_APPROVAL: 'Eligible on recorded evidence',
  RECOMMEND_REVIEW: 'Review before qualification',
  RECOMMEND_REJECTION: 'Mandatory requirement not evidenced',
}

export const SEVERITY_LABEL: Record<Severity, string> = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low', INFO: 'Info' }

export const SOURCE_LABEL: Record<FindingSource, string> = {
  DOCUMENT: 'Document forensics',
  CROSS_CHECK: 'Cross-document check',
  REQUIREMENT: 'Tender requirement',
  CARTEL: 'Linked bidder analysis',
}

export const FINDING_TITLE: Record<string, string> = {
  OVERLAPPING_TEXT: 'Value typed over the original',
  FIELD_FONT_OUTLIER: 'Field printed in a different font',
  MODIFIED_AFTER_SIGNING: 'Document changed after digital signing',
  SIGNATURE_BROKEN: 'Digital signature is broken',
  INCREMENTAL_UPDATES: 'Document edited after creation',
  EDITOR_TOOL: 'Document metadata differs from expected source',
  TIMESTAMP_INVERSION: 'Document dates are inconsistent',
  CATEGORY_MISMATCH: 'Uploaded under the wrong heading',
  IDENTICAL_FILE_REUSE_CROSS_BIDDER: 'Same file submitted by another bidder',
  COMPRESSION_HOTSPOT: 'Image region pasted in',
  IMAGE_EDITOR: 'Image edited in software',
  NAME_LOOKALIKE: 'Submitted name does not match registry',
  NAME_MISMATCH: 'Submitted name does not match registry',
  EXPIRED_AT_BID_DATE: 'Expired before bid submission',
  GSTIN_CHECKSUM: 'GSTIN check digit is invalid',
  GSTIN_PAN_MISMATCH: 'GSTIN does not contain the PAN',
  PAN_HOLDER_TYPE: 'PAN holder type does not match entity',
  CIN_YEAR_VS_INCORPORATION: 'CIN year does not match incorporation date',
  REQUIREMENT_NOT_MET: 'Mandatory requirement not met',
  LINKED_BIDDER_RING: 'Linked bidder relationship detected',
  POSSIBLE_COVER_BID: 'Possible cover bid pattern',
}

export const findingTitle = (code: string, fallback: string) => FINDING_TITLE[code] ?? fallback

export const LINK_LABEL: Record<string, string> = {
  SHARED_DEVICE: 'Same device',
  SHARED_IP: 'Same IP address',
  SHARED_NETWORK: 'Same /24 network',
  SHARED_DIRECTOR: 'Common director (DIN)',
  SHARED_PHONE: 'Same phone number',
  SHARED_EMAIL: 'Same email address',
  SHARED_EMAIL_DOMAIN: 'Same private mail domain',
  SHARED_ADDRESS: 'Same registered address',
  SHARED_DOCUMENT_AUTHOR: 'Same PDF author',
  IDENTICAL_FILE: 'Byte-identical file',
  SYNCHRONIZED_SUBMISSION: 'Bids minutes apart',
}

export const LINK_GROUP: Record<string, 'Submission telemetry' | 'Declared details' | 'Documents' | 'Timing'> = {
  SHARED_DEVICE: 'Submission telemetry',
  SHARED_IP: 'Submission telemetry',
  SHARED_NETWORK: 'Submission telemetry',
  SHARED_DIRECTOR: 'Declared details',
  SHARED_PHONE: 'Declared details',
  SHARED_EMAIL: 'Declared details',
  SHARED_EMAIL_DOMAIN: 'Declared details',
  SHARED_ADDRESS: 'Declared details',
  SHARED_DOCUMENT_AUTHOR: 'Documents',
  IDENTICAL_FILE: 'Documents',
  SYNCHRONIZED_SUBMISSION: 'Timing',
}

export const linkLabel = (t: LinkType) => LINK_LABEL[t] ?? humanise(t)

export const CHECK_LABEL: Record<string, string> = {
  SIGNATURE_INTEGRITY: 'Digital signature integrity',
  REVISION_HISTORY: 'Revision history',
  METADATA_TIMELINE: 'Metadata timeline',
  PRODUCER_TOOL: 'Producing software',
  FIELD_FONT_CONSISTENCY: 'Font consistency on key fields',
  OVERLAPPING_TEXT: 'Overlapping text layers',
  COMPRESSION_CONSISTENCY: 'Image compression consistency',
  DOCUMENT_TYPE: 'Document matches its heading',
  IDENTIFIER_STRUCTURE: 'Identifier structure',
  VALIDITY_TODAY: 'Validity today',
}

export const PRICE_SCREEN_LABEL: Record<string, string> = {
  COVER_BID_GAP: 'Gap between the two lowest bids',
  LOW_PRICE_DISPERSION: 'Prices unusually close together',
  PRICE_LADDER: 'Fixed-step price ladder',
  IDENTICAL_PRICES: 'Identical prices',
  ABNORMALLY_LOW_BID: 'Abnormally low bid',
}

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  LOGIN: 'Signed in',
  CASE_TRANSITION: 'Case stage changed',
  CASE_SCREENED: 'Case screened',
  FINDING_DISPOSITION: 'Finding ruled on',
  FINAL_DECISION: 'Final decision recorded',
  CLARIFICATION_ANSWERED: 'Clarification answered',
  AI_ANALYSIS: 'Ask Bidmark question',
  WORKFLOW_STARTED: 'Verification started',
  WORKFLOW_COMPLETED: 'Verification completed',
  OCR_EXTRACTION: 'Documents read',
  CROSS_DOCUMENT_VERIFICATION: 'Cross-document checks',
  SCORE_CHANGE: 'Compliance score computed',
  DOCUMENT_UPLOAD: 'Document uploaded',
  BID_SUBMITTED: 'Bid submitted',
  USER_CREATED: 'User created',
  USER_UPDATED: 'User updated',
  TENDER_CREATED: 'Tender created',
  REQUIREMENT_ADDED: 'Requirement added',
}

export const auditActionLabel = (a: string) => AUDIT_ACTION_LABEL[a] ?? humanise(a)

// The backend rationale names rule codes; show them as titles.
export const readableRationale = (text: string | null | undefined) =>
  (text ?? '').replace(/\b[A-Z][A-Z_]{5,}\b/g, code => (FINDING_TITLE[code] ? FINDING_TITLE[code].toLowerCase()
    : (RECOMMENDATION_LABEL as Record<string, string>)[code] ?? code))
