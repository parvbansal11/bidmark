import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, session } from '@/app/lib/api'
import { clearCache } from '@/app/lib/useResource'
import type { CaseDetail, Finding, User } from '@/app/services/bidmark/types'

const svc = vi.hoisted(() => ({
  login: vi.fn(),
  me: vi.fn(),
  decide: vi.fn(),
  dispose: vi.fn(),
}))

vi.mock('@/app/services/bidmark', async importOriginal => {
  const real = await importOriginal<typeof import('@/app/services/bidmark')>()
  return {
    ...real,
    auth: { ...real.auth, login: svc.login, me: svc.me },
    cases: { ...real.cases, decide: svc.decide, dispose: svc.dispose },
  }
})
vi.mock('@/app/lib/api', async importOriginal => {
  const real = await importOriginal<typeof import('@/app/lib/api')>()
  return { ...real, health: vi.fn().mockResolvedValue(true) }
})

import { AuthProvider } from '@/app/auth/AuthContext'
import { RequireRole } from '@/app/auth/RequireRole'
import { LandingPage } from '@/app/features/landing/LandingPage'
import { DecisionTab } from '@/app/features/case/DecisionTab'
import { Loadable } from '@/app/components/ui/states'

const officer: User = { id: 'u1', email: 'officer@cpcl.gov.in', full_name: 'Rajesh Kumar, Procurement Officer', role: 'PROCUREMENT_OFFICER', is_active: true }
const bidder: User = { id: 'u2', email: 'alpha@alphaindia.in', full_name: 'Alpha', role: 'BIDDER', is_active: true }

function renderAt(path: string, extra?: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/officer" element={<RequireRole roles={['PROCUREMENT_OFFICER']}><p>Officer workspace</p></RequireRole>} />
          <Route path="/seller" element={<RequireRole roles={['BIDDER']}><p>Seller workspace</p></RequireRole>} />
          {extra}
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  session.clear()
  clearCache()
})

describe('sign in', () => {
  it('authenticates against the backend and opens the role workspace', async () => {
    svc.login.mockResolvedValue({ access_token: 't', token_type: 'bearer', user: officer })
    renderAt('/')
    await userEvent.click(screen.getByRole('button', { name: /Use test account/ }))
    await userEvent.click(screen.getByRole('menuitem', { name: /^Procurement Officer/ }))
    await userEvent.click(screen.getByRole('button', { name: /Sign in as Procurement Officer/ }))
    expect(svc.login).toHaveBeenCalledWith('officer@cpcl.gov.in', 'Officer@123', expect.any(Object))
    expect(await screen.findByText('Opening Procurement Workspace')).toBeInTheDocument()
    expect(await screen.findByText('Officer workspace', {}, { timeout: 2000 })).toBeInTheDocument()
  })

  it('shows incorrect credentials and does not sign in', async () => {
    svc.login.mockRejectedValue(new ApiError('unauthorised', 'Invalid email or password', 401, 'HTTP_ERROR'))
    renderAt('/')
    await userEvent.type(screen.getByLabelText('Email'), 'officer@cpcl.gov.in')
    await userEvent.type(screen.getByLabelText('Password'), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: /Sign in as/ }))
    expect(await screen.findByText('Email or password is incorrect.')).toBeInTheDocument()
    expect(session.get()).toBeNull()
  })

  it('says the service is unavailable instead of pretending to sign in', async () => {
    svc.login.mockRejectedValue(new ApiError('unavailable', 'Verification service unavailable', null, null))
    renderAt('/')
    await userEvent.type(screen.getByLabelText('Email'), 'officer@cpcl.gov.in')
    await userEvent.type(screen.getByLabelText('Password'), 'Officer@123')
    await userEvent.click(screen.getByRole('button', { name: /Sign in as/ }))
    expect(await screen.findByText(/Your credentials were not checked/)).toBeInTheDocument()
  })
})

describe('role routing', () => {
  it('a bidder session cannot open the officer workspace', async () => {
    session.set('token')
    svc.me.mockResolvedValue(bidder)
    renderAt('/officer')
    expect(await screen.findByText('This area is not part of your role')).toBeInTheDocument()
    expect(screen.queryByText('Officer workspace')).not.toBeInTheDocument()
  })

  it('an expired session returns to sign in with a notice', async () => {
    session.set('token')
    svc.me.mockRejectedValue(new ApiError('unauthorised', 'expired', 401, null))
    renderAt('/officer')
    expect(await screen.findByText(/Your session has expired/)).toBeInTheDocument()
  })
})

describe('backend failure', () => {
  it('shows an error and never renders data when the service is down', () => {
    const resource = { data: undefined, error: new ApiError('unavailable', 'Verification service unavailable', null, null), loading: false, reload: vi.fn() }
    render(<Loadable resource={resource} what="the queue">{() => <p>data rendered</p>}</Loadable>)
    expect(screen.getByText('Verification service unavailable')).toBeInTheDocument()
    expect(screen.queryByText('data rendered')).not.toBeInTheDocument()
  })
})

const high = (id: string, disposed = false): Finding => ({
  id, code: 'OVERLAPPING_TEXT', severity: 'HIGH', source: 'DOCUMENT', title: 'Text typed over other text', detail: 'detail', document_id: 'd',
  category: 'OEM_AUTHORIZATION', page: 1, bbox: [1, 2, 3, 4], evidence: {}, reliability: { precision: 0.5, reviewed: 0 },
  disposition: disposed ? { outcome: 'UPHELD', note: '', officer_id: 'u1', at: '2026-09-29T10:00:00Z' } : null,
})

const caseWith = (findings: Finding[]): CaseDetail => ({
  id: 'c1', tender_id: 't', bidder_id: 'b', stage: 'IN_REVIEW', lane: 'ESCALATED', priority: 1, assigned_officer_id: null,
  summary: { counts: { HIGH: findings.length, MEDIUM: 0, LOW: 0, INFO: 0 } }, findings,
  undisposed_high: findings.filter(f => !f.disposition).map(f => f.id), screened_at: null, sla_due_at: null, sla_breached: false,
  decision: null, decision_reason: null, decided_by: null, decided_at: null, ai_recommendation: 'RECOMMEND_REVIEW', audit_anchor: null,
  allowed_transitions: ['DECIDED'], clarifications: [],
})

async function renderDecision(c: CaseDetail) {
  session.set('token')
  svc.me.mockResolvedValue(officer)
  render(
    <MemoryRouter>
      <AuthProvider>
        <RequireRole roles={['PROCUREMENT_OFFICER']}>
          <DecisionTab c={c} role="PROCUREMENT_OFFICER" onOpenFinding={() => undefined} onReload={() => undefined} />
        </RequireRole>
      </AuthProvider>
    </MemoryRouter>,
  )
  await screen.findByRole('radiogroup', { name: 'Action' })
}

describe('decision gate', () => {
  it('locks the decision while a high finding has no ruling', async () => {
    await renderDecision(caseWith([high('f1'), high('f2', true)]))
    expect(screen.getByText('1 high finding requires disposition')).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /^Qualify/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /^Disqualify/ })).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Request clarification/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Send to bidder/ })).toBeDisabled()
  })

  it('records a disposition through the backend', async () => {
    svc.dispose.mockResolvedValue({})
    await renderDecision(caseWith([high('f1')]))
    await userEvent.click(screen.getByRole('button', { name: /Uphold finding/ }))
    await userEvent.click(screen.getByRole('button', { name: /Record: upheld/ }))
    expect(svc.dispose).toHaveBeenCalledWith('c1', 'f1', 'UPHELD', '')
  })

  it('a dismissal needs a written reason', async () => {
    await renderDecision(caseWith([high('f1')]))
    await userEvent.click(screen.getByRole('button', { name: /Dismiss with reason/ }))
    expect(screen.getByRole('button', { name: /Record: dismissed/ })).toBeDisabled()
  })

  it('allows the decision once every high finding has a ruling', async () => {
    svc.decide.mockResolvedValue({})
    await renderDecision(caseWith([high('f1', true)]))
    expect(screen.getByText('No blockers. A decision can be recorded.')).toBeInTheDocument()
    expect(screen.getByText('Final procurement decision')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: /Disqualify/ }))
    await userEvent.type(screen.getByLabelText(/Reason for the record/), 'OEM validity retyped; finding upheld.')
    await userEvent.click(screen.getByRole('button', { name: /Record decision/ }))
    await waitFor(() => expect(svc.decide).toHaveBeenCalledWith('c1', 'DISQUALIFIED', 'OEM validity retyped; finding upheld.'))
  })
})
