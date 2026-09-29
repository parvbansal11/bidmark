import { apiClient, unwrap } from './client'
import type { CrossCheckResult, Discrepancy } from '@/types'

export interface CrossCheckPayload {
  cross_checks: CrossCheckResult[]
  discrepancies: Discrepancy[]
}

export function runCrossCheck(bidderId: string, tenderId: string) {
  return unwrap<CrossCheckPayload>(apiClient.post(`/api/v1/verification/cross-check/${bidderId}/${tenderId}`))
}

export function getCrossCheck(bidderId: string, tenderId: string) {
  return unwrap<CrossCheckPayload>(apiClient.get(`/api/v1/verification/cross-check/${bidderId}/${tenderId}`))
}

export function runFullWorkflow(bidderId: string, tenderId: string) {
  return unwrap<Record<string, unknown>>(apiClient.post(`/api/v1/verification/run/${bidderId}/${tenderId}`))
}
