import { apiClient, unwrap } from './client'
import type { Bidder360, RiskLevel } from '@/types'

export interface DashboardOverview {
  total_tenders: number
  active_tenders: number
  total_bidders: number
  verified_bidders: number
  requires_review: number
  high_risk: number
  pending_documents: number
}

export function getOverview() {
  return unwrap<DashboardOverview>(apiClient.get('/api/v1/dashboard/overview'))
}

export interface TenderDashboardBidderRow {
  bidder_id: string
  company_name: string
  compliance_score: number | null
  risk_level: RiskLevel | 'PENDING'
  documents: number
  compliance_status: { verified: number; failed: number; pending: number; requires_review: number }
  forensic_risk: RiskLevel
  behavior_risk: RiskLevel
  ai_recommendation: string | null
  officer_decision: string | null
}

export interface TenderDashboard {
  tender: {
    id: string
    tender_number: string
    title: string
    department: string
    deadline: string | null
    requirements: number
    total_bidders: number
    average_compliance: number | null
    high_risk_bidders: number
    review_queue: number
  }
  bidders: TenderDashboardBidderRow[]
}

export function getTenderDashboard(tenderId: string) {
  return unwrap<TenderDashboard>(apiClient.get(`/api/v1/dashboard/tenders/${tenderId}`))
}

export function getBidder360(bidderId: string, tenderId: string) {
  return unwrap<Bidder360>(apiClient.get(`/api/v1/dashboard/bidders/${bidderId}/${tenderId}`))
}

export interface ReviewQueueItem {
  bidder_id: string
  bidder_name: string | null
  tender_id: string
  tender_title: string | null
  risk_level: RiskLevel
  overall_score: number
  failed_count: number
  requires_review_count: number
  reason: string
}

export function getReviewQueue() {
  return unwrap<ReviewQueueItem[]>(apiClient.get('/api/v1/dashboard/review-queue'))
}

export interface RiskSummary {
  risk_distribution: Record<RiskLevel, number>
  compliance_score_distribution: Record<string, number>
  requirement_failure_frequency: Record<string, number>
  verification_status_distribution: Record<string, number>
  document_forensic_risk_distribution: Record<RiskLevel, number>
  behavioral_risk_distribution: Record<RiskLevel, number>
}

export function getRiskSummary() {
  return unwrap<RiskSummary>(apiClient.get('/api/v1/dashboard/risk-summary'))
}
