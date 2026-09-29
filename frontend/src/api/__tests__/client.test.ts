import { AxiosError, AxiosHeaders } from 'axios'
import { describe, expect, it } from 'vitest'
import { apiErrorMessage } from '@/api/client'

function makeAxiosError(data: unknown, status = 400): AxiosError {
  return new AxiosError('Request failed', String(status), undefined, undefined, {
    status,
    statusText: 'Bad Request',
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
    data,
  })
}

describe('apiErrorMessage', () => {
  it('prefers the structured error.message envelope used by the backend', () => {
    const err = makeAxiosError({ error: { code: 'VALIDATION_ERROR', message: 'Invalid document category' } })
    expect(apiErrorMessage(err)).toBe('Invalid document category')
  })

  it('falls back to a plain FastAPI `detail` string (e.g. HTTPException)', () => {
    const err = makeAxiosError({ detail: 'You are not eligible to bid on this tender' })
    expect(apiErrorMessage(err)).toBe('You are not eligible to bid on this tender')
  })

  it('falls back to a generic message for a non-axios error', () => {
    expect(apiErrorMessage(new Error('network down'))).toBe('network down')
  })

  it('never crashes on a completely unexpected shape', () => {
    expect(apiErrorMessage('just a string')).toBe('Something went wrong')
    expect(apiErrorMessage(undefined)).toBe('Something went wrong')
  })
})
