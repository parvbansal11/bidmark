import axios, { type AxiosRequestConfig } from 'axios'

export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? ''

const TOKEN_KEY = 'bidmark.session'

export type ApiErrorKind = 'unavailable' | 'unauthorised' | 'forbidden' | 'not_found' | 'conflict' | 'invalid' | 'server'

export class ApiError extends Error {
  kind: ApiErrorKind
  status: number | null
  code: string | null
  detail: string | null

  constructor(kind: ApiErrorKind, message: string, status: number | null, code: string | null, detail: string | null = null) {
    super(message)
    this.kind = kind
    this.status = status
    this.code = code
    this.detail = detail
  }
}

export const session = {
  get: () => {
    try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
  },
  set: (token: string) => {
    try { localStorage.setItem(TOKEN_KEY, token) } catch { /* private mode: session lasts for the tab */ }
  },
  clear: () => {
    try { localStorage.removeItem(TOKEN_KEY) } catch { /* nothing stored */ }
  },
}

export const SESSION_EXPIRED_EVENT = 'bidmark:session-expired'

const http = axios.create({ baseURL: `${API_BASE_URL}/api/v1`, timeout: 45_000 })

http.interceptors.request.use(config => {
  const token = session.get()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

function kindFor(status: number): ApiErrorKind {
  if (status === 401) return 'unauthorised'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not_found'
  if (status === 409) return 'conflict'
  if (status === 400 || status === 422) return 'invalid'
  return 'server'
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return new ApiError('unavailable', 'Verification service unavailable', null, null, error.message)
    }
    const { status, data } = error.response
    const body = data as { error?: { code?: string; message?: string }; detail?: unknown } | undefined
    let message = body?.error?.message ?? null
    if (!message && typeof body?.detail === 'string') message = body.detail
    if (!message && Array.isArray(body?.detail)) {
      message = (body.detail as { msg?: string }[]).map(d => d.msg).filter(Boolean).join('. ')
    }
    if (status >= 500 || status === 502 || status === 504) {
      return new ApiError('unavailable', 'Verification service unavailable', status, body?.error?.code ?? null, message)
    }
    return new ApiError(kindFor(status), message || `Request failed (${status})`, status, body?.error?.code ?? null)
  }
  return new ApiError('server', error instanceof Error ? error.message : 'Unexpected error', null, null)
}

http.interceptors.response.use(
  response => response,
  error => {
    const apiError = toApiError(error)
    const url: string = error?.config?.url ?? ''
    if (apiError.kind === 'unauthorised' && !url.includes('/auth/login') && session.get()) {
      session.clear()
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
    }
    return Promise.reject(apiError)
  },
)

interface Envelope<T> {
  success: boolean
  data: T
  message?: string
}

export async function get<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
  const res = await http.get<Envelope<T>>(path, config)
  return res.data.data
}

export async function post<T>(path: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const res = await http.post<Envelope<T>>(path, body, config)
  return res.data.data
}

export async function put<T>(path: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const res = await http.put<Envelope<T>>(path, body, config)
  return res.data.data
}

export async function patch<T>(path: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const res = await http.patch<Envelope<T>>(path, body, config)
  return res.data.data
}

export async function getBlob(path: string): Promise<Blob> {
  const res = await http.get<Blob>(path, { responseType: 'blob' })
  return res.data
}

export async function health(): Promise<boolean> {
  try {
    await axios.get(`${API_BASE_URL}/health`, { timeout: 5_000 })
    return true
  } catch {
    return false
  }
}
