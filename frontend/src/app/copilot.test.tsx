import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/app/lib/api'
import { clearCache } from '@/app/lib/useResource'
import type { Finding } from '@/app/services/bidmark/types'

const svc = vi.hoisted(() => ({ ask: vi.fn(), status: vi.fn() }))

vi.mock('@/app/services/bidmark', async importOriginal => {
  const real = await importOriginal<typeof import('@/app/services/bidmark')>()
  return { ...real, copilot: { ask: svc.ask, status: svc.status } }
})

import { CopilotProvider, useCopilot, useCopilotSubject } from '@/app/features/copilot/AskBidmark'

const finding: Finding = {
  id: 'doc:d1:OVERLAPPING_TEXT', code: 'OVERLAPPING_TEXT', severity: 'HIGH', source: 'DOCUMENT', title: 'Text typed over other text', detail: 'd',
  document_id: 'd1', category: 'OEM_AUTHORIZATION', page: 1, bbox: [1, 2, 3, 4], evidence: {}, reliability: { precision: 0.5, reviewed: 0 }, disposition: null,
}

function CasePageStub() {
  const { open } = useCopilot()
  useCopilotSubject({ caseId: 'c1', bidderId: 'b1', tenderId: 't1', bidderName: 'Coastal Hydraulics Ltd', tenderNumber: 'CPCL/2026/PUMP/089', findings: [finding] })
  return <button onClick={open}>Ask Bidmark</button>
}

function Where() {
  const l = useLocation()
  return <p data-testid="where">{l.pathname + l.search}</p>
}

function renderPanel() {
  render(
    <MemoryRouter initialEntries={['/officer/cases/c1']}>
      <CopilotProvider enabled>
        <Routes><Route path="*" element={<><CasePageStub /><Where /></>} /></Routes>
      </CopilotProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  clearCache()
  svc.status.mockResolvedValue({ mode: 'deterministic', model: null })
})

describe('Ask Bidmark', () => {
  it('shows the answer composed by the backend with clickable sources', async () => {
    svc.ask.mockResolvedValue({
      intent: 'FINDING_EVIDENCE', answer: 'OEM authorisation: a value is typed over the original (high), in OEM.pdf, page 1.',
      evidence: [finding.id], question: 'q', disclaimer: '', provider: 'bidmark:deterministic', suggestions: [],
      citations: [
        { type: 'finding', id: finding.id, label: 'OEM authorisation: a value is typed over the original', document_id: 'd1', page: 1 },
        { type: 'check', id: 'DEBARMENT', requirement_type: 'DEBARMENT', label: 'Debarment check' },
      ],
    })
    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'Ask Bidmark' }))
    await userEvent.click(await screen.findByRole('button', { name: /Show evidence for the OEM finding/ }))
    expect(await screen.findByText(/typed over the original \(high\)/)).toBeInTheDocument()
    expect(screen.getByText(/No external AI service is used/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /OEM authorisation: a value is typed over the original, page 1/ }))
    expect(screen.getByTestId('where').textContent).toBe(`/officer/cases/c1?tab=documents&finding=${encodeURIComponent(finding.id)}&doc=d1`)
  })

  it('offers suggestions instead of guessing when the question is out of scope', async () => {
    svc.ask.mockResolvedValue({
      intent: 'UNKNOWN', answer: "I can answer questions about this bidder's compliance checks, findings, evidence, linked bidders, decision status and audit history.",
      evidence: [], question: 'q', disclaimer: '', citations: [], suggestions: ['What is blocking the final decision?'],
    })
    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'Ask Bidmark' }))
    await userEvent.type(await screen.findByLabelText('Ask about this bid'), 'Weather tomorrow?{Enter}')
    expect(await screen.findByText(/I can answer questions about this bidder/)).toBeInTheDocument()
    expect(screen.queryByText('Sources')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'What is blocking the final decision?' })).toBeInTheDocument()
  })

  it('reports a failed request honestly', async () => {
    svc.ask.mockRejectedValue(new ApiError('unavailable', 'Verification service unavailable', null, null))
    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'Ask Bidmark' }))
    await userEvent.click(await screen.findByRole('button', { name: /Why was this bidder flagged/ }))
    expect(await screen.findByText('Bidmark Assistant is temporarily unavailable.')).toBeInTheDocument()
    expect(screen.queryByText('Sources')).not.toBeInTheDocument()
  })
})
