import type { HTMLAttributes, ReactNode } from 'react'
import { AlertTriangle, Info, Loader2, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin', className)} />
}

export function FullPageSpinner({ label }: { label?: string }) {
  return (
    <div className="flex h-64 w-full flex-col items-center justify-center gap-2 text-slate-500">
      <Spinner className="h-6 w-6" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  )
}

export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: 'info' | 'warning' | 'danger'
  title?: string
  children?: ReactNode
  className?: string
}) {
  const toneStyles = {
    info: 'bg-blue-50 border-blue-200 text-blue-900',
    warning: 'bg-amber-50 border-amber-200 text-amber-900',
    danger: 'bg-red-50 border-red-200 text-red-900',
  }[tone]
  const Icon = tone === 'danger' ? ShieldAlert : tone === 'warning' ? AlertTriangle : Info
  return (
    <div className={cn('flex gap-2 rounded-md border px-3 py-2.5 text-sm', toneStyles, className)}>
      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <div>
        {title && <p className="font-medium">{title}</p>}
        {children && <div className="text-xs opacity-90">{children}</div>}
      </div>
    </div>
  )
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 px-6 py-10 text-center">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {description && <p className="text-xs text-slate-500">{description}</p>}
    </div>
  )
}

export function ProgressBar({ value, className, colorClass }: { value: number; className?: string; colorClass?: string }) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-slate-100', className)}>
      <div className={cn('h-full rounded-full bg-blue-600 transition-all', colorClass)} style={{ width: `${clamped}%` }} />
    </div>
  )
}

export function Section({ title, description, children, className, actions }: { title: string; description?: string; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {description && <p className="text-xs text-slate-500">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

export function DataRow({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-4 py-1.5 text-sm', className)}>
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-900 text-right">{value}</span>
    </div>
  )
}

export function PageHeader({ title, description, actions, ...rest }: { title: string; description?: string; actions?: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 pb-2')} {...rest}>
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
