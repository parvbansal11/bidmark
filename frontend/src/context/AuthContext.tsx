import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import * as authApi from '@/api/auth'
import { clearToken, getToken, setToken } from '@/api/client'
import type { User, UserRole } from '@/types'

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  /**
   * Public self-registration. DEMO-ONLY: creates a Bidder account with any
   * email, or an Admin/Procurement Officer account when the email ends with
   * the backend's configured privileged domain (see api/auth.ts::getAuthConfig)
   * — the backend is the source of truth and re-validates regardless of what
   * the UI allowed through.
   */
  register: (email: string, password: string, fullName: string, role: UserRole, companyName?: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = getToken()
    if (!token) {
      setLoading(false)
      return
    }
    authApi
      .me()
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setLoading(false))
  }, [])

  async function login(email: string, password: string) {
    const res = await authApi.login(email, password)
    setToken(res.access_token)
    setUser(res.user)
  }

  async function register(email: string, password: string, fullName: string, role: UserRole, companyName?: string) {
    const res = await authApi.register(email, password, fullName, role, companyName)
    setToken(res.access_token)
    setUser(res.user)
  }

  function logout() {
    clearToken()
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, loading, login, register, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
