// Bidder Portal API client — every call here is self-scoped to the logged-in
// bidder's own account on the backend (no bidder_id is ever passed).
import { apiClient, unwrap } from './client'
import type {
  Bidder,
  PortalActionItems,
  PortalComplianceDetail,
  PortalComplianceStatus,
  PortalDashboard,
  PortalDocument,
  PortalNotification,
  PortalSubmission,
  PortalTenderSummary,
} from '@/types'

export function getDashboard() {
  return unwrap<PortalDashboard>(apiClient.get('/api/v1/portal/dashboard'))
}

export function getMyTenders(status?: string) {
  return unwrap<PortalTenderSummary[]>(apiClient.get('/api/v1/portal/tenders', { params: status ? { status } : undefined }))
}

export function getMyDocuments() {
  return unwrap<PortalDocument[]>(apiClient.get('/api/v1/portal/documents'))
}

export function getComplianceStatus() {
  return unwrap<PortalComplianceStatus>(apiClient.get('/api/v1/portal/compliance'))
}

export function getComplianceDetail(tenderId: string) {
  return unwrap<PortalComplianceDetail>(apiClient.get(`/api/v1/portal/compliance/${tenderId}`))
}

export function getActionItems() {
  return unwrap<PortalActionItems>(apiClient.get('/api/v1/portal/action-items'))
}

export function getSubmissions() {
  return unwrap<PortalSubmission[]>(apiClient.get('/api/v1/portal/submissions'))
}

export function getNotifications(unreadOnly?: boolean) {
  return unwrap<PortalNotification[]>(apiClient.get('/api/v1/portal/notifications', { params: unreadOnly ? { unread_only: true } : undefined }))
}

export function markNotificationRead(notificationId: string) {
  return unwrap<{ id: string; is_read: boolean }>(apiClient.post(`/api/v1/portal/notifications/${notificationId}/read`))
}

export function markAllNotificationsRead() {
  return unwrap<{ marked_read: number }>(apiClient.post('/api/v1/portal/notifications/read-all'))
}

export function getProfile() {
  return unwrap<Bidder>(apiClient.get('/api/v1/portal/profile'))
}

export function requestProfileCorrection(payload: { field: string; current_value?: string | null; requested_value: string; reason?: string }) {
  return unwrap<{ field: string }>(apiClient.post('/api/v1/portal/profile/request-correction', payload))
}
