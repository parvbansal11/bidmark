import { forwardRef, useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { LoaderCircle, X } from 'lucide-react'
import { cn } from '@/app/lib/cn'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet'
type ButtonSize = 'sm' | 'md' | 'lg'

const buttonBase =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:translate-y-px disabled:opacity-50 disabled:active:translate-y-0 select-none'

const buttonVariant: Record<ButtonVariant, string> = {
  primary: 'bg-navy text-white hover:bg-navy-700 shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-subtle hover:border-ink-4',
  ghost: 'text-ink-2 hover:bg-sunken hover:text-ink',
  quiet: 'text-navy-600 hover:bg-navy-50',
  danger: 'bg-finding text-white hover:bg-[#8f1d15]',
}

const buttonSize: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] rounded-md',
  md: 'h-9 px-3.5 text-[13.5px] rounded-md',
  lg: 'h-11 px-5 text-[14.5px] rounded-md',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  busy?: boolean
  icon?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', busy, icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button ref={ref} className={cn(buttonBase, buttonVariant[variant], buttonSize[size], className)} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  )
})

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton h-4', className)} aria-hidden />
}

export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={cn('h-10', i % 3 === 2 && 'w-4/5')} />
      ))}
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line-strong bg-subtle px-1.5 py-0.5 font-mono text-[12px] text-ink-3">{children}</kbd>
}

export function Mono({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return <span className={cn('font-mono text-[12.5px] tracking-tight', className)} title={title}>{children}</span>
}

export function Field({ label, hint, error, children, htmlFor, required }: {
  label: string; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string; required?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-ink-2">
        {label}
        {required && <span className="text-ink-4"> (required)</span>}
      </label>
      {children}
      {error ? (
        <p className="text-[12.5px] text-finding" role="alert">{error}</p>
      ) : hint ? (
        <p className="text-[12.5px] text-ink-3">{hint}</p>
      ) : null}
    </div>
  )
}

const inputBase =
  'w-full rounded-md border border-line-strong bg-surface px-3 text-[14px] text-ink placeholder:text-ink-4 transition-[border-color,box-shadow] focus:border-navy-600 focus:outline-none focus:ring-3 focus:ring-navy-100 disabled:bg-sunken aria-[invalid=true]:border-finding'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(inputBase, 'h-10', className)} {...rest} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(inputBase, 'min-h-[84px] py-2 leading-relaxed', className)} {...rest} />
})

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(inputBase, 'h-10 pr-8', className)} {...rest}>
      {children}
    </select>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange, className, label }: {
  tabs: { id: T; label: string; count?: number | null; tone?: 'finding' | 'review' }[]
  value: T
  onChange: (id: T) => void
  className?: string
  label: string
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null)
  const activeIndex = tabs.findIndex(t => t.id === value)
  const tabKey = tabs.map(t => `${t.id}:${t.count ?? ''}`).join('|')
  useLayoutEffect(() => {
    const el = refs.current[activeIndex]
    if (el) setBar({ left: el.offsetLeft, width: el.offsetWidth })
  }, [activeIndex, tabKey])
  function onKey(e: React.KeyboardEvent, i: number) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const next = (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
    refs.current[next]?.focus()
    onChange(tabs[next].id)
  }
  return (
    <div role="tablist" aria-label={label} className={cn('relative flex gap-1 overflow-x-auto border-b border-line scroll-thin', className)}>
      {tabs.map((t, i) => {
        const active = t.id === value
        return (
          <button
            key={t.id}
            ref={el => { refs.current[i] = el }}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={e => onKey(e, i)}
            className={cn(
              'relative flex h-11 shrink-0 items-center gap-2 px-3.5 text-[14px] font-medium transition-colors duration-150',
              active ? 'text-ink' : 'text-ink-3 hover:text-ink',
            )}
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className={cn(
                'tnum min-w-5 rounded-full px-1.5 text-[12px] font-semibold leading-5',
                t.tone === 'finding' ? 'bg-finding-bg text-finding' : t.tone === 'review' ? 'bg-review-bg text-review' : 'bg-sunken text-ink-3',
              )}>{t.count}</span>
            )}
          </button>
        )
      })}
      {bar && <span aria-hidden className="pointer-events-none absolute bottom-0 h-0.5 rounded-full bg-navy transition-[left,width] duration-300 ease-[var(--ease-out-soft)]" style={{ left: bar.left, width: bar.width }} />}
    </div>
  )
}

function useModalBehaviour(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!open) return
    restoreRef.current = document.activeElement as HTMLElement
    const panel = panelRef.current
    const focusable = () => panel?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    const first = focusable()?.[0]
    ;(first ?? panel)?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
      if (e.key === 'Tab' && panel) {
        const items = focusable()
        if (!items || items.length === 0) return
        const firstEl = items[0]
        const lastEl = items[items.length - 1]
        if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus() }
        else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      restoreRef.current?.focus?.()
    }
  }, [open, onClose])
  return panelRef
}

export function Dialog({ open, onClose, title, description, children, footer, width = 'max-w-lg' }: {
  open: boolean; onClose: () => void; title: string; description?: ReactNode; children?: ReactNode; footer?: ReactNode; width?: string
}) {
  const panelRef = useModalBehaviour(open, onClose)
  const titleId = useId()
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-[12vh]">
      <div className="fixed inset-0 bg-ink/35 animate-fade-in" onClick={onClose} aria-hidden />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className={cn('relative w-full rounded-xl border border-line bg-surface shadow-overlay animate-rise-in', width)}>
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 id={titleId} className="text-[16px] font-semibold tracking-tight">{title}</h2>
            {description && <div className="mt-1 text-[13px] text-ink-3">{description}</div>}
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-ink-3 hover:bg-sunken hover:text-ink" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        {children && <div className="px-5 py-4">{children}</div>}
        {footer && <div className="flex justify-end gap-2 border-t border-line bg-subtle px-5 py-3 rounded-b-xl">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function Drawer({ open, onClose, title, subtitle, children, footer, width = 'w-[min(560px,100vw)]' }: {
  open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; width?: string
}) {
  const panelRef = useModalBehaviour(open, onClose)
  const titleId = useId()
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-ink/25 animate-fade-in" onClick={onClose} aria-hidden />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className={cn('absolute right-0 top-0 flex h-full flex-col border-l border-line bg-surface shadow-overlay animate-slide-in-right', width)}>
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[16px] font-semibold tracking-tight">{title}</h2>
            {subtitle && <div className="mt-0.5 text-[13px] text-ink-3">{subtitle}</div>}
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-ink-3 hover:bg-sunken hover:text-ink" aria-label="Close panel">
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scroll-thin px-5 py-4">{children}</div>
        {footer && <div className="border-t border-line bg-subtle px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function Tooltip({ label, children, side = 'top' }: { label: ReactNode; children: ReactNode; side?: 'top' | 'bottom' }) {
  const id = useId()
  return (
    <span className="group/tt relative inline-flex" aria-describedby={id}>
      {children}
      <span id={id} role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 z-40 w-max max-w-[260px] -translate-x-1/2 rounded-md bg-ink px-2.5 py-1.5 text-[12px] font-normal leading-snug text-white opacity-0 shadow-raised transition-opacity duration-150 group-hover/tt:opacity-100 group-focus-within/tt:opacity-100',
          side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
        )}>
        {label}
      </span>
    </span>
  )
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn('border-line', className)} />
}
