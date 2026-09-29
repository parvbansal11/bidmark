import { apiClient, unwrap } from './client'
import type { User, UserRole } from '@/types'

export interface LoginResponse {
  access_token: string
  token_type: string
  user: User
}

export function login(email: string, password: string) {
  return unwrap<LoginResponse>(apiClient.post('/api/v1/auth/login', { email, password }))
}

// DEMO-ONLY: public self-registration can create a Bidder account with any
// email, or an Admin/Procurement Officer account when the email ends with
// the backend-configured privileged domain (see getAuthConfig below and
// app/api/v1/auth.py::register). This is a format check only — no mailbox
// verification, no OTP, no DNS lookup.
export function register(email: string, password: string, full_name: string, role: UserRole, companyName?: string) {
  return unwrap<LoginResponse>(apiClient.post('/api/v1/auth/register', { email, password, full_name, role, company_name: companyName }))
}

export function me() {
  return unwrap<User>(apiClient.get('/api/v1/auth/me'))
}

export interface AuthConfig {
  privileged_role_email_domain: string
}

// Fetches the demo-only privileged-role email domain from the backend so the
// frontend never hardcodes it — matches settings.PRIVILEGED_ROLE_EMAIL_DOMAIN.
export function getAuthConfig() {
  return unwrap<AuthConfig>(apiClient.get('/api/v1/auth/config'))
}
