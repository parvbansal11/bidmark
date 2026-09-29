// Exercises the exact RBAC gate used in production routing (router/index.tsx)
// to lock in the Admin/Officer/Bidder permission boundaries described in the
// README: a role outside a route's allow-list is redirected away rather than
// shown the page, even for a moment.
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ADMIN_ONLY, BIDDER_ONLY, OFFICER_AND_ADMIN, RoleRoute } from '@/router'
import type { User } from '@/types'

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }))

vi.mock('@/context/AuthContext', () => ({
  useAuth: useAuthMock,
}))

function renderProtected(user: User | null, roles: User['role'][]) {
  useAuthMock.mockReturnValue({ user, loading: false, login: vi.fn(), register: vi.fn(), logout: vi.fn() })
  return render(
    <MemoryRouter initialEntries={['/protected']}>
      <Routes>
        <Route path="/protected" element={<RoleRoute roles={roles}><div>Protected content</div></RoleRoute>} />
        <Route path="/dashboard" element={<div>Dashboard fallback</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

function makeUser(role: User['role']): User {
  return { id: 'u1', email: 'x@example.com', full_name: 'Test User', role, is_active: true }
}

describe('RoleRoute (Admin/Officer/Bidder permission boundaries)', () => {
  it('lets a matching role through', () => {
    renderProtected(makeUser('ADMIN'), ADMIN_ONLY)
    expect(screen.getByText('Protected content')).toBeInTheDocument()
  })

  it('redirects a Bidder away from an Admin-only route (e.g. User Management)', () => {
    renderProtected(makeUser('BIDDER'), ADMIN_ONLY)
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
    expect(screen.getByText('Dashboard fallback')).toBeInTheDocument()
  })

  it('redirects a Procurement Officer away from an Admin-only route (tender creation is Admin-only)', () => {
    renderProtected(makeUser('PROCUREMENT_OFFICER'), ADMIN_ONLY)
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
    expect(screen.getByText('Dashboard fallback')).toBeInTheDocument()
  })

  it('allows both Officer and Admin into a shared Officer+Admin route', () => {
    renderProtected(makeUser('PROCUREMENT_OFFICER'), OFFICER_AND_ADMIN)
    expect(screen.getByText('Protected content')).toBeInTheDocument()
  })

  it('redirects a Bidder away from an Officer+Admin route', () => {
    renderProtected(makeUser('BIDDER'), OFFICER_AND_ADMIN)
    expect(screen.getByText('Dashboard fallback')).toBeInTheDocument()
  })

  it('redirects an Admin away from a Bidder-only portal route', () => {
    renderProtected(makeUser('ADMIN'), BIDDER_ONLY)
    expect(screen.getByText('Dashboard fallback')).toBeInTheDocument()
  })

  it('renders nothing (no flash of protected content) while the user is not yet loaded', () => {
    renderProtected(null, ADMIN_ONLY)
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
    expect(screen.queryByText('Dashboard fallback')).not.toBeInTheDocument()
  })
})
