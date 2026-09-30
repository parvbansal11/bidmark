import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
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

function renderPanel() {
  render(<MemoryRouter><CopilotProvider enabled><CasePageStub /></CopilotProvider></MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
  clearCache()
  svc.status.mockResolvedValue({ mode: 'llm', model: 'claude-opus-5-5' })
})

describe('Ask Bidmark', () => {
  it('says the assistant is unavailable and shows no answer when the provider fails', async () => {
    svc.ask.mockRejectedValue(new ApiError('unavailable', 'Verification service unavailable', 503, 'COPILOT_UNAVAILABLE'))
    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'Ask Bidmark' }))
    await userEvent.click(await screen.findByRole('button', { name: /Why does this bidder require review/ }))
    expect(await screen.findByText('Bidmark Assistant is temporarily unavailable.')).toBeInTheDocument()
    expect(screen.queryByText('Evidence cited')).not.toBeInTheDocument()
    expect(svc.ask).toHaveBeenCalledWith('b1', 't1', 'Why does this bidder require review?')
  })

  it('renders cited findings as links to the evidence', async () => {
    svc.ask.mockResolvedValue({ answer: `The value was retyped [${finding.id}].`, evidence: [finding.id], question: 'q', disclaimer: '', provider: 'anthropic:claude-opus-5-5' })
    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'Ask Bidmark' }))
    await userEvent.click(await screen.findByRole('button', { name: /What compliance checks failed/ }))
    expect(await screen.findByText('Evidence cited')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Value typed over the original/ })).toBeInTheDocument()
    expect(screen.getByText(/written by claude-opus-5-5/)).toBeInTheDocument()
  })
})
