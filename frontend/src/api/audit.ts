import { apiClient, unwrap } from './client'
import type { AuditLogEntry } from '@/types'

export function getAuditTrail(bidderId: string, tenderId: string) {
  return unwrap<AuditLogEntry[]>(apiClient.get(`/api/v1/audit/${bidderId}/${tenderId}`))
}

export function getBidderAuditTrail(bidderId: string) {
  return unwrap<AuditLogEntry[]>(apiClient.get(`/api/v1/audit/bidder/${bidderId}`))
}
