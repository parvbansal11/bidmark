import { apiClient, unwrap } from './client'
import type { DecisionValue, OfficerDecision } from '@/types'

export function submitDecision(bidderId: string, tenderId: string, decision: DecisionValue, reason: string) {
  return unwrap<OfficerDecision>(apiClient.post(`/api/v1/decisions/${bidderId}/${tenderId}`, { decision, reason }))
}

export function getDecisions(bidderId: string, tenderId: string) {
  return unwrap<OfficerDecision[]>(apiClient.get(`/api/v1/decisions/${bidderId}/${tenderId}`))
}
