import { apiClient, openBlobInNewTab, unwrap } from './client'
import type { Bidder, BidSubmission, Requirement, Tender } from '@/types'

export interface RequirementPayload {
  requirement_type: string
  description: string
  is_mandatory: boolean
  threshold?: number | null
  threshold_unit?: string | null
  weight?: number
  evidence_type: string
}

export interface TenderPayload {
  tender_number: string
  gem_tender_id: string
  title: string
  department?: string
  organization?: string
  tender_type: string
  tender_category: string
  tender_mode: string
  bid_system: string
  location: string
  bid_validity_days: number
  published_at: string
  deadline: string
  description?: string
  estimated_value?: number
  status?: string
  requirements?: RequirementPayload[]
}

export function listTenders(params?: { status?: string; q?: string }) {
  return unwrap<Tender[]>(apiClient.get('/api/v1/tenders', { params }))
}

export function getTender(tenderId: string) {
  return unwrap<Tender>(apiClient.get(`/api/v1/tenders/${tenderId}`))
}

export function createTender(payload: TenderPayload) {
  return unwrap<Tender>(apiClient.post('/api/v1/tenders', payload))
}

export function updateTender(tenderId: string, payload: Partial<TenderPayload>) {
  return unwrap<Tender>(apiClient.put(`/api/v1/tenders/${tenderId}`, payload))
}

export function addRequirement(tenderId: string, payload: RequirementPayload) {
  return unwrap<Requirement>(apiClient.post(`/api/v1/tenders/${tenderId}/requirements`, payload))
}

export function flagTender(tenderId: string, is_flagged: boolean, reason?: string) {
  return unwrap<Tender>(apiClient.post(`/api/v1/tenders/${tenderId}/flag`, { is_flagged, reason }))
}

export function listRequirements(tenderId: string) {
  return unwrap<Requirement[]>(apiClient.get(`/api/v1/tenders/${tenderId}/requirements`))
}

export function addBidderToTender(tenderId: string, bidderId: string) {
  return unwrap<{ tender_id: string; bidder_id: string }>(apiClient.post(`/api/v1/tenders/${tenderId}/bidders/${bidderId}`))
}

export function listTenderBidders(tenderId: string) {
  return unwrap<Bidder[]>(apiClient.get(`/api/v1/tenders/${tenderId}/bidders`))
}

export function submitBid(
  tenderId: string,
  bidderId: string,
  payload: { quoted_price?: number; local_content_percent?: number; declared_turnover_crore?: number; submitted_at?: string; status?: string },
) {
  return unwrap<BidSubmission>(apiClient.post(`/api/v1/tenders/${tenderId}/bidders/${bidderId}/bid-submission`, payload))
}

export function getBidSubmission(tenderId: string, bidderId: string) {
  return unwrap<BidSubmission>(apiClient.get(`/api/v1/tenders/${tenderId}/bidders/${bidderId}/bid-submission`))
}

// Downloadable bid submission receipt — opens as a PDF in-browser.
export function openBidReceiptPdf(tenderId: string, bidderId: string) {
  return openBlobInNewTab(
    `/api/v1/tenders/${tenderId}/bidders/${bidderId}/bid-submission/receipt.pdf`,
    `bid-receipt-${tenderId}-${bidderId}.pdf`,
  )
}
