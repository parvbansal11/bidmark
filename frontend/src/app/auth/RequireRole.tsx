import type { ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { ROLE_HOME, ROLE_LABEL } from '@/app/lib/labels'
import type { Role } from '@/app/services/bidmark/types'
import { ErrorState } from '@/app/components/ui/states'
import { Wordmark } from '@/app/components/gov/Brand'
import { useAuth } from './AuthContext'

export function FullPageStatus({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4">
      <div className="flex w-full max-w-md flex-col items-center gap-6">
        <Wordmark />
        {children}
      </div>
    </div>
  )
}

export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { status, user, restoreError, retryRestore, logout, signedOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  if (status === 'restoring') {
    return (
      <FullPageStatus>
        <p className="text-[13px] text-ink-3" role="status">Restoring your session</p>
      </FullPageStatus>
    )
  }
  if (status === 'unreachable' && restoreError) {
    return (
      <FullPageStatus>
        <ErrorState error={restoreError} onRetry={retryRestore} what="your session" className="w-full bg-surface" />
      </FullPageStatus>
    )
  }
  if (status !== 'authenticated' || !user) {
    return <Navigate to={signedOut ? '/' : `/?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  }
  if (!roles.includes(user.role)) {
    return (
      <FullPageStatus>
        <div className="card w-full p-8 text-center">
          <div className="mx-auto mb-3 grid size-10 place-items-center rounded-full border border-line bg-subtle text-ink-3">
            <Lock className="size-4" aria-hidden />
          </div>
          <h1 className="text-[16px] font-semibold">This area is not part of your role</h1>
          <p className="mt-1.5 text-[13px] text-ink-3">
            You are signed in as {ROLE_LABEL[user.role]}. This section is reserved for {roles.map(r => ROLE_LABEL[r]).join(' or ')}.
          </p>
          <div className="mt-5 flex items-center justify-center gap-3">
            <Link to={ROLE_HOME[user.role]} className="inline-flex h-9 items-center rounded-md bg-navy px-4 text-[13.5px] font-medium text-white hover:bg-navy-700">
              Go to your workspace
            </Link>
            <button onClick={() => { navigate('/', { replace: true }); logout() }} className="inline-flex h-9 items-center rounded-md border border-line-strong px-4 text-[13.5px] font-medium text-ink-2 hover:bg-subtle">
              Sign out
            </button>
          </div>
        </div>
      </FullPageStatus>
    )
  }
  return <>{children}</>
}
