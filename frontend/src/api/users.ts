// Admin-only user management client. See app/api/v1/users.py — this is the
// only place a Procurement Officer or Admin account gets created.
import { apiClient, unwrap } from './client'
import type { AdminUser, UserRole } from '@/types'

export interface AdminUserCreatePayload {
  email: string
  password: string
  full_name: string
  role: UserRole
  company_name?: string
}

export function listUsers() {
  return unwrap<AdminUser[]>(apiClient.get('/api/v1/users'))
}

export function createUser(payload: AdminUserCreatePayload) {
  return unwrap<AdminUser>(apiClient.post('/api/v1/users', payload))
}

export function updateUserStatus(userId: string, payload: { is_active?: boolean; role?: UserRole }) {
  return unwrap<AdminUser>(apiClient.patch(`/api/v1/users/${userId}`, payload))
}
