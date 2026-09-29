import { apiClient, unwrap } from './client'
import type { DocumentFingerprint, ForensicAnalysis, FingerprintComparison } from '@/types'

export function analyzeDocumentForensics(documentId: string) {
  return unwrap<ForensicAnalysis>(apiClient.post(`/api/v1/forensics/analyze/${documentId}`))
}

export function generateFingerprint(documentId: string) {
  return unwrap<DocumentFingerprint>(apiClient.post(`/api/v1/forensics/fingerprint/${documentId}`))
}

export function compareDocuments(documentIdA: string, documentIdB: string) {
  return unwrap<FingerprintComparison>(
    apiClient.post('/api/v1/forensics/compare', { document_id_a: documentIdA, document_id_b: documentIdB }),
  )
}

export function compareTenderDocuments(tenderId: string, minScore = 0.6) {
  return unwrap<FingerprintComparison[]>(
    apiClient.get(`/api/v1/forensics/compare/tender/${tenderId}`, { params: { min_score: minScore } }),
  )
}

export interface DocumentForensicsBundle {
  forensic_analysis?: ForensicAnalysis
  fingerprint?: DocumentFingerprint
  comparisons: FingerprintComparison[]
}

export function getDocumentForensics(documentId: string) {
  return unwrap<DocumentForensicsBundle>(apiClient.get(`/api/v1/forensics/document/${documentId}`))
}
