import { apiClient, unwrap } from './client'
import type { Bidder } from '@/types'

export interface BidderPayload {
  company_name: string
  legal_name?: string
  pan_number?: string
  gstin?: string
  cin?: string
  udyam_number?: string
  registered_address?: string
  incorporation_date?: string
  contact_email?: string
  contact_phone?: string
  website?: string
}

export function listBidders(params?: { q?: string; gstin?: string; pan?: string }) {
  return unwrap<Bidder[]>(apiClient.get('/api/v1/bidders', { params }))
}

export function getBidder(bidderId: string) {
  return unwrap<Bidder>(apiClient.get(`/api/v1/bidders/${bidderId}`))
}

export function createBidder(payload: BidderPayload) {
  return unwrap<Bidder>(apiClient.post('/api/v1/bidders', payload))
}

export function updateBidder(bidderId: string, payload: Partial<BidderPayload & { status: string }>) {
  return unwrap<Bidder>(apiClient.put(`/api/v1/bidders/${bidderId}`, payload))
}

export interface CorrectionRequestPayload {
  field: string
  current_value?: string | null
  requested_value: string
  reason?: string
}

export function requestBidderCorrection(bidderId: string, payload: CorrectionRequestPayload) {
  return unwrap<{ bidder_id: string; field: string }>(apiClient.post(`/api/v1/bidders/${bidderId}/request-correction`, payload))
}

// Bidder moderation — Officer/Admin only. See app/api/v1/bidders.py.
export type ModerationAction = 'flag' | 'suspend' | 'ban' | 'reactivate'

export function moderateBidder(bidderId: string, action: ModerationAction, reason?: string) {
  return unwrap<Bidder>(apiClient.post(`/api/v1/bidders/${bidderId}/${action}`, { reason }))
}
