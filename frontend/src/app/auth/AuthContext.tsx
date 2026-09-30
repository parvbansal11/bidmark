import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiError, SESSION_EXPIRED_EVENT, session, toApiError } from '@/app/lib/api'
import { clearCache } from '@/app/lib/useResource'
import type { FormSignals } from '@/app/lib/telemetry'
import { auth, type User } from '@/app/services/bidmark'

type AuthStatus = 'restoring' | 'anonymous' | 'authenticated' | 'unreachable'

interface AuthValue {
  status: AuthStatus
  user: User | null
  expired: boolean
  signedOut: boolean
  restoreError: ApiError | null
  login: (email: string, password: string, signals?: FormSignals) => Promise<User>
  logout: () => void
  retryRestore: () => void
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(() => (session.get() ? 'restoring' : 'anonymous'))
  const [user, setUser] = useState<User | null>(null)
  const [expired, setExpired] = useState(false)
  // True after an explicit sign-out, so the route guard does not carry the old page into the next sign-in.
  const [signedOut, setSignedOut] = useState(false)
  const [restoreError, setRestoreError] = useState<ApiError | null>(null)

  const restore = useCallback(async () => {
    if (!session.get()) {
      setStatus('anonymous')
      return
    }
    setStatus('restoring')
    setRestoreError(null)
    try {
      const me = await auth.me()
      setUser(me)
      setStatus('authenticated')
    } catch (e) {
      const err = toApiError(e)
      if (err.kind === 'unavailable') {
        setRestoreError(err)
        setStatus('unreachable')
      } else {
        session.clear()
        setUser(null)
        setExpired(err.kind === 'unauthorised')
        setStatus('anonymous')
      }
    }
  }, [])

  useEffect(() => { void restore() }, [restore])

  useEffect(() => {
    function onExpired() {
      clearCache()
      setUser(null)
      setExpired(true)
      setStatus('anonymous')
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired)
  }, [])

  const login = useCallback(async (email: string, password: string, signals?: FormSignals) => {
    const result = await auth.login(email, password, signals)
    session.set(result.access_token)
    clearCache()
    setExpired(false)
    setSignedOut(false)
    setUser(result.user)
    setStatus('authenticated')
    return result.user
  }, [])

  const logout = useCallback(() => {
    session.clear()
    clearCache()
    setUser(null)
    setExpired(false)
    setSignedOut(true)
    setStatus('anonymous')
  }, [])

  const value = useMemo<AuthValue>(
    () => ({ status, user, expired, signedOut, restoreError, login, logout, retryRestore: restore }),
    [status, user, expired, signedOut, restoreError, login, logout, restore],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

export function useUser(): User {
  const { user } = useAuth()
  if (!user) throw new Error('useUser needs an authenticated route')
  return user
}
