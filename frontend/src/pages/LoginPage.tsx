import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import * as authApi from '@/api/auth'
import { Button } from '@/components/ui/Button'
import { Input, Label, Select } from '@/components/ui/Input'
import { Alert } from '@/components/ui/Misc'
import { apiErrorMessage } from '@/api/client'
import type { UserRole } from '@/types'
import { ShieldAlert, Info } from 'lucide-react'

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'BIDDER', label: 'Bidder' },
  { value: 'PROCUREMENT_OFFICER', label: 'Procurement Officer' },
  { value: 'ADMIN', label: 'Admin' },
]

// Fallback only — the real value always comes from the backend
// (settings.PRIVILEGED_ROLE_EMAIL_DOMAIN via GET /api/v1/auth/config), so
// this rule stays centralized in one place and can be changed without
// touching this page.
const FALLBACK_PRIVILEGED_DOMAIN = 'cpcl.gov.in'

export function LoginPage() {
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('officer@cpcl.gov.in')
  const [password, setPassword] = useState('Officer@123')
  const [fullName, setFullName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [role, setRole] = useState<UserRole>('BIDDER')
  const [privilegedDomain, setPrivilegedDomain] = useState(FALLBACK_PRIVILEGED_DOMAIN)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    authApi
      .getAuthConfig()
      .then((cfg) => setPrivilegedDomain(cfg.privileged_role_email_domain))
      .catch(() => {
        /* keep the fallback — the backend is the real source of truth and re-validates on submit regardless */
      })
  }, [])

  const requiresPrivilegedDomain = mode === 'register' && role !== 'BIDDER'
  const domainSuffix = `@${privilegedDomain}`
  const emailMatchesDomain = email.toLowerCase().endsWith(domainSuffix.toLowerCase())
  const domainValidationMessage = `Admin and Procurement Officer accounts require an ${domainSuffix} email address.`

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (requiresPrivilegedDomain && !emailMatchesDomain) {
      setError(domainValidationMessage)
      return
    }
    setLoading(true)
    try {
      if (mode === 'login') {
        await login(email, password)
      } else {
        await register(email, password, fullName, role, role === 'BIDDER' ? companyName || undefined : undefined)
      }
      navigate('/dashboard')
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  function switchMode(next: 'login' | 'register') {
    setMode(next)
    setError(null)
    setRole('BIDDER')
    if (next === 'register') {
      setEmail('')
      setPassword('')
    } else {
      setEmail('officer@cpcl.gov.in')
      setPassword('Officer@123')
    }
  }

  const registerButtonLabel = useMemo(() => {
    if (role === 'ADMIN') return 'Create Admin account'
    if (role === 'PROCUREMENT_OFFICER') return 'Create Procurement Officer account'
    return 'Create Bidder account'
  }, [role])

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <ShieldAlert className="h-8 w-8 text-blue-600" />
          <h1 className="text-lg font-semibold text-slate-900">GeM Bid Compliance Verification Platform</h1>
          <p className="text-xs text-slate-500">PS 26100 — Ministry of Petroleum &amp; Natural Gas / CPCL prototype</p>
        </div>

        <div className="mb-4 flex rounded-md bg-slate-100 p-1 text-sm">
          <button className={`flex-1 rounded py-1.5 font-medium ${mode === 'login' ? 'bg-white shadow-sm' : 'text-slate-500'}`} onClick={() => switchMode('login')}>
            Sign in
          </button>
          <button className={`flex-1 rounded py-1.5 font-medium ${mode === 'register' ? 'bg-white shadow-sm' : 'text-slate-500'}`} onClick={() => switchMode('register')}>
            Create account
          </button>
        </div>

        {mode === 'register' && (
          <div className="mb-3 flex items-start gap-2 rounded-md bg-blue-50 px-3 py-2 text-[11px] text-blue-800">
            <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span>
              This is a demo environment. A Bidder account can register with any email. An Admin or Procurement Officer
              account can also be created here, but only with an <strong>{domainSuffix}</strong> email address — no
              inbox verification is performed.
            </span>
          </div>
        )}

        <form className="space-y-3" onSubmit={handleSubmit}>
          {mode === 'register' && (
            <>
              <div>
                <Label>Account type</Label>
                <Select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Full name</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>
              {role === 'BIDDER' && (
                <div>
                  <Label>Company / organization name (optional)</Label>
                  <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Defaults to your full name" />
                </div>
              )}
            </>
          )}
          <div>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder={requiresPrivilegedDomain ? `name${domainSuffix}` : undefined} />
            {requiresPrivilegedDomain && email.length > 0 && !emailMatchesDomain && (
              <p className="mt-1 text-[11px] text-red-600">{domainValidationMessage}</p>
            )}
          </div>
          <div>
            <Label>Password</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </div>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : registerButtonLabel}
          </Button>
        </form>

        <div className="mt-5 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
          <p className="font-semibold text-slate-700 mb-2">Quick Demo Login (Click to auto-fill & login):</p>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              className="rounded border border-blue-200 bg-blue-50 px-2 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors"
              onClick={() => {
                setEmail('officer@cpcl.gov.in')
                setPassword('Officer@123')
                setMode('login')
              }}
            >
              Procurement Officer
            </button>
            <button
              type="button"
              className="rounded border border-purple-200 bg-purple-50 px-2 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-100 transition-colors"
              onClick={() => {
                setEmail('admin@cpcl.gov.in')
                setPassword('Admin@123')
                setMode('login')
              }}
            >
              System Admin
            </button>
            <button
              type="button"
              className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
              onClick={() => {
                setEmail('bidder@example.com')
                setPassword('Bidder@123')
                setMode('login')
              }}
            >
              Participating Bidder
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
