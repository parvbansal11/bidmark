import { useState, type ReactNode } from 'react'
import { ChevronDown, CircleSlash, Inbox, Lock, RefreshCw, ServerCrash } from 'lucide-react'
import type { ApiError } from '@/app/lib/api'
import type { Resource } from '@/app/lib/useResource'
import { cn } from '@/app/lib/cn'
import { Button, SkeletonRows } from './primitives'

export function EmptyState({ title, body, icon, action, className }: {
  title: string; body?: ReactNode; icon?: ReactNode; action?: ReactNode; className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <div className="mb-3 grid size-10 place-items-center rounded-full border border-line bg-subtle text-ink-3">
        {icon ?? <Inbox className="size-4.5" aria-hidden />}
      </div>
      <p className="text-[14px] font-semibold text-ink">{title}</p>
      {body && <div className="mt-1 max-w-sm text-[13px] text-ink-3">{body}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry, what = 'this information', className, compact }: {
  error: ApiError; onRetry?: () => void; what?: string; className?: string; compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const unavailable = error.kind === 'unavailable'
  const forbidden = error.kind === 'forbidden'
  const Icon = unavailable ? ServerCrash : forbidden ? Lock : CircleSlash
  const title = unavailable
    ? 'Verification service unavailable'
    : forbidden
      ? 'Not available to your role'
      : error.kind === 'not_found'
        ? 'Record not found'
        : `Could not load ${what}`
  const body = unavailable
    ? `Bidmark could not reach the verification service, so ${what} could not be loaded. Nothing on this screen has been assumed or filled in.`
    : forbidden
      ? `Your account does not have access to ${what}. Access is enforced by the verification service.`
      : error.message
  return (
    <div role="alert" className={cn(
      'rounded-lg border border-dashed border-line-strong bg-subtle',
      compact ? 'flex items-start gap-3 px-4 py-3' : 'flex flex-col items-center px-6 py-10 text-center',
      className,
    )}>
      <div className={cn('grid shrink-0 place-items-center rounded-full border border-line bg-surface text-ink-3', compact ? 'size-8' : 'mb-3 size-10')}>
        <Icon className="size-4" aria-hidden />
      </div>
      <div className={cn(compact ? 'min-w-0 flex-1' : 'max-w-md')}>
        <p className="text-[14px] font-semibold text-ink">{title}</p>
        <p className="mt-1 text-[13px] text-ink-3">{body}</p>
        {(error.detail || error.status) && (
          <div className="mt-2">
            <button onClick={() => setOpen(o => !o)} className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink" aria-expanded={open}>
              Technical detail <ChevronDown className={cn('size-3 transition-transform', open && 'rotate-180')} aria-hidden />
            </button>
            {open && (
              <pre className="mt-2 whitespace-pre-wrap rounded-md border border-line bg-surface p-2 text-left font-mono text-[12px] text-ink-2">
                {[error.status && `HTTP ${error.status}`, error.code, error.detail ?? error.message].filter(Boolean).join('\n')}
              </pre>
            )}
          </div>
        )}
        {onRetry && !forbidden && (
          <Button size="sm" className={compact ? 'mt-2' : 'mt-4'} onClick={onRetry} icon={<RefreshCw className="size-3.5" aria-hidden />}>
            Retry
          </Button>
        )}
      </div>
    </div>
  )
}

// Renders loading, error and success for one resource. On error the data is never shown.
export function Loadable<T>({ resource, children, skeleton, what, compactError }: {
  resource: Resource<T>; children: (data: T) => ReactNode; skeleton?: ReactNode; what?: string; compactError?: boolean
}) {
  if (resource.error) return <ErrorState error={resource.error} onRetry={resource.reload} what={what} compact={compactError} />
  if (resource.data === undefined) return <>{skeleton ?? <SkeletonRows />}</>
  return <>{children(resource.data)}</>
}
