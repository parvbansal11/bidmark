import { apiClient, openBlobInNewTab, unwrap } from './client'
import type { DocumentExtraction, DocumentItem, VerificationResult } from '@/types'

export function listBidderDocuments(bidderId: string) {
  return unwrap<DocumentItem[]>(apiClient.get(`/api/v1/bidders/${bidderId}/documents`))
}

export function getDocument(documentId: string) {
  return unwrap<DocumentItem>(apiClient.get(`/api/v1/documents/${documentId}`))
}

export function uploadDocument(bidderId: string, category: string, file: File, tenderId?: string) {
  const form = new FormData()
  form.append('category', category)
  if (tenderId) form.append('tender_id', tenderId)
  form.append('file', file)
  return unwrap<DocumentItem>(
    apiClient.post(`/api/v1/bidders/${bidderId}/documents`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  )
}

// Opens the original uploaded file (PDF/image) in a new browser tab for
// in-line preview, falling back to a download if pop-ups are blocked.
export function viewDocumentFile(doc: Pick<DocumentItem, 'id' | 'original_filename'>) {
  return openBlobInNewTab(`/api/v1/documents/${doc.id}/file`, doc.original_filename)
}

export function deleteDocument(documentId: string) {
  return unwrap<{ id: string }>(apiClient.delete(`/api/v1/documents/${documentId}`))
}

export function extractDocument(documentId: string) {
  return unwrap<DocumentExtraction>(apiClient.post(`/api/v1/documents/${documentId}/extract`))
}

export function verifyDocument(documentId: string) {
  return unwrap<VerificationResult>(apiClient.post(`/api/v1/documents/${documentId}/verify`))
}

export interface MockGovernmentResult {
  success: boolean
  status: string
  source: string
  is_mock: boolean
  registry: string
  reference_id: string
  verified_at: string
  data: Record<string, unknown>
}

export function verifyDirectlyWithRegistry(
  registrySlug: string,
  identifier: string,
  opts?: { context?: Record<string, unknown>; bidder_id?: string; document_id?: string },
) {
  return unwrap<MockGovernmentResult>(
    apiClient.post(`/api/v1/verify/${registrySlug}`, { identifier, ...opts }),
  )
}

export function listRegistries() {
  return unwrap<string[]>(apiClient.get('/api/v1/verify/registries'))
}
