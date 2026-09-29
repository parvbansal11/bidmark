import { apiClient, openBlobInNewTab, unwrap } from './client'
import type { AIRecommendation, ComplianceReport } from '@/types'

export function evaluateCompliance(bidderId: string, tenderId: string) {
  return unwrap<ComplianceReport>(apiClient.post(`/api/v1/compliance/evaluate/${bidderId}/${tenderId}`))
}

export function getComplianceReport(bidderId: string, tenderId: string) {
  return unwrap<ComplianceReport>(apiClient.get(`/api/v1/compliance/report/${bidderId}/${tenderId}`))
}

export function getAIRecommendation(bidderId: string, tenderId: string) {
  return unwrap<AIRecommendation>(apiClient.post(`/api/v1/compliance/recommendation/${bidderId}/${tenderId}`))
}

// Downloadable/exportable PDF version of the compliance report — opens
// in-browser (same RBAC boundary as the JSON report).
export function openComplianceReportPdf(bidderId: string, tenderId: string) {
  return openBlobInNewTab(`/api/v1/compliance/report/${bidderId}/${tenderId}/pdf`, `compliance-report-${bidderId}-${tenderId}.pdf`)
}
