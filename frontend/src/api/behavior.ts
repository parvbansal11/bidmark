import { apiClient, unwrap } from './client'
import type { BehavioralRiskReport } from '@/types'

export function analyzeBehavior(bidderId: string, tenderId: string) {
  return unwrap<BehavioralRiskReport>(apiClient.post(`/api/v1/behavior/analyze/${bidderId}/${tenderId}`))
}

export function getBehaviorReport(bidderId: string, tenderId: string) {
  return unwrap<BehavioralRiskReport>(apiClient.get(`/api/v1/behavior/report/${bidderId}/${tenderId}`))
}
