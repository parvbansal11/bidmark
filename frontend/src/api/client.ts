import axios from 'axios'
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''
export const apiClient = axios.create({ baseURL: API_BASE_URL, timeout: 60000 })
const TOKEN_KEY = 'gem_compliance_token'
export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (token: string) => localStorage.setItem(TOKEN_KEY, token)
export const clearToken = () => localStorage.removeItem(TOKEN_KEY)
apiClient.interceptors.request.use(config => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})
apiClient.interceptors.response.use(response => response, error => {
  if (error.response?.status === 401 && !error.config?.url?.includes('/auth/login')) {
    clearToken()
    window.dispatchEvent(new Event('bidmark:session-expired'))
  }
  return Promise.reject(error)
})
export function unwrap<T>(promise: Promise<{ data: { data: T } }>): Promise<T> { return promise.then(res => res.data.data) }
export async function openBlobInNewTab(path: string, filename: string) {
  const res = await apiClient.get(path, { responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
export function apiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'Verification service unavailable. The request could not be completed.'
    const body = error.response.data
    if (body?.error?.message) return body.error.message
    if (typeof body?.detail === 'string') return body.detail
    if (Array.isArray(body?.detail)) return body.detail.map((d: {msg: string}) => d.msg).join('. ')
  }
  return error instanceof Error ? error.message : 'Something went wrong'
}
