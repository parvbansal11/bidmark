import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ChevronRight, LogOut, Menu, MessageSquareText, X } from 'lucide-react'
import { useAuth, useUser } from '@/app/auth/AuthContext'
import { health } from '@/app/lib/api'
import { ROLE_LABEL } from '@/app/lib/labels'
import { cn } from '@/app/lib/cn'
import { BidmarkGlyph, CpclLogo, GemMark, TricolourRule } from '@/app/components/gov/Brand'
import { GovUtilityBar } from '@/app/components/gov/GovUtilityBar'
import { CopilotProvider, useCopilot } from '@/app/features/copilot/AskBidmark'
import { NAV } from './nav'

export function AppShell() {
  const user = useUser()
  return (
    <CopilotProvider enabled={user.role === 'PROCUREMENT_OFFICER'}>
      <ShellFrame />
    </CopilotProvider>
  )
}

function ShellFrame() {
  const user = useUser()
  const copilot = useCopilot()
  const { logout } = useAuth()
  const navigate = useNavigate()
  // Leave for a clean sign-in page: no ?next= from this session should steer the next account.
  const signOut = () => { navigate('/', { replace: true }); logout() }
  const [navOpen, setNavOpen] = useState(false)
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => { setNavOpen(false) }, [location.pathname])

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <GovUtilityBar dark />
      <header className="sticky top-0 z-30 bg-navy text-white">
        <div className="mx-auto flex h-14 max-w-[1680px] items-center gap-4 px-4 sm:px-6">
          <button className="rounded-md p-1.5 hover:bg-white/10 lg:hidden" onClick={() => setNavOpen(o => !o)} aria-label={navOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={navOpen}>
            {navOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
          <Link to="/" className="shrink-0 rounded-md focus-visible:outline-white"><GemMark inverted /></Link>
          <span className="hidden h-7 w-px bg-white/15 md:block" aria-hidden />
          <div className="hidden min-w-0 items-center gap-2.5 md:flex">
            <CpclLogo className="size-8 shrink-0" />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[13px] font-medium text-white/90">Chennai Petroleum Corporation Limited</p>
              <p className="truncate text-[12px] text-white/55">{user.role === 'BIDDER' ? 'Seller workspace, bids to CPCL' : 'A Government of India Enterprise'}</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <IntegrationIndicator />
            {copilot.available && (
              <button onClick={copilot.open} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-white px-3 text-[13px] font-medium text-navy transition-colors hover:bg-white/90">
                <MessageSquareText className="size-3.5" aria-hidden /> <span className="hidden sm:inline">Ask Bidmark</span>
              </button>
            )}
            <span className="hidden h-7 w-px bg-white/15 sm:block" aria-hidden />
            <div className="hidden text-right leading-tight sm:block">
              <p className="max-w-[240px] truncate text-[13px] font-medium">{user.full_name.split(',')[0].replace(/\s*\(bid desk\)$/, '')}</p>
              <p className="text-[12px] text-white/60">{ROLE_LABEL[user.role]}</p>
            </div>
            <button onClick={signOut} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/20 px-2.5 text-[12.5px] text-white/90 transition-colors hover:bg-white/10" aria-label="Sign out">
              <LogOut className="size-3.5" aria-hidden /><span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
        <TricolourRule className="opacity-90" />
      </header>

      <div className="mx-auto flex w-full max-w-[1680px] flex-1">
        <aside className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 shrink-0 lg:w-56 border-r border-line bg-surface pt-4 transition-transform duration-200 lg:sticky lg:top-[calc(3.5rem+3px)] lg:z-0 lg:h-[calc(100vh-3.5rem-3px)] lg:translate-x-0 lg:bg-transparent lg:pt-6',
          navOpen ? 'translate-x-0 shadow-overlay' : '-translate-x-full',
        )} aria-label="Primary">
          <nav className="flex h-full flex-col gap-6 overflow-y-auto px-3 pb-6 scroll-thin">
            {NAV[user.role].map(group => (
              <div key={group.label}>
                <p className={cn('mb-1.5 flex items-center gap-1.5 px-2.5 text-[12px] font-semibold uppercase tracking-[0.08em]', group.bidmark ? 'text-navy-600' : 'text-ink-4')}>
                  {group.bidmark && <BidmarkGlyph className="size-3.5" />}
                  {group.label}
                </p>
                <ul className="space-y-0.5">
                  {group.items.map(item => {
                    const Icon = item.icon
                    return (
                      <li key={item.to}>
                        <NavLink to={item.to} end={item.end}
                          className={({ isActive }) => cn(
                            'group relative flex h-10 items-center gap-2.5 rounded-md px-2.5 text-[14px] transition-colors',
                            isActive ? 'bg-surface font-medium text-ink shadow-card ring-1 ring-line' : 'text-ink-2 hover:bg-sunken hover:text-ink',
                          )}>
                          {({ isActive }) => (
                            <>
                              {isActive && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-navy" aria-hidden />}
                              <Icon className={cn('size-4', isActive ? 'text-navy' : 'text-ink-3 group-hover:text-ink-2')} aria-hidden />
                              {item.label}
                            </>
                          )}
                        </NavLink>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>
        {navOpen && <div className="fixed inset-0 z-30 bg-ink/30 lg:hidden" onClick={() => setNavOpen(false)} aria-hidden />}

        <main id="main" ref={mainRef} className="min-w-0 flex-1 px-4 pb-16 pt-7 sm:px-6 lg:px-10" tabIndex={-1}>
          <div key={location.pathname} className="animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

function IntegrationIndicator() {
  const [up, setUp] = useState<boolean | null>(null)
  useEffect(() => {
    let alive = true
    const check = () => void health().then(ok => { if (alive) setUp(ok) })
    check()
    const t = window.setInterval(check, 30_000)
    return () => { alive = false; window.clearInterval(t) }
  }, [])
  return (
    <div className="hidden items-center gap-2 rounded-md border border-white/15 bg-white/[0.04] px-2.5 py-1 xl:flex" role="status" aria-live="polite">
      <BidmarkGlyph className="size-4 [&_rect:first-child]:fill-white/15" />
      <span className="text-[12px] leading-tight">
        <span className="block text-white/60">Bidmark verification</span>
        <span className="flex items-center gap-1.5 font-medium">
          <span className={cn('size-1.5 rounded-full', up === null ? 'bg-white/40' : up ? 'bg-[#5fd08e]' : 'bg-[#ff8a80]')} aria-hidden />
          {up === null ? 'Checking' : up ? 'Connected' : 'Unavailable'}
        </span>
      </span>
    </div>
  )
}

export function PageHeader({ eyebrow, title, description, actions, crumbs, meta }: {
  eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode; crumbs?: { label: string; to?: string }[]; meta?: ReactNode
}) {
  return (
    <div className="mb-7">
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-3">
          <ol className="flex flex-wrap items-center gap-1 text-[13px] text-ink-3">
            {crumbs.map((c, i) => (
              <li key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="size-3.5 text-ink-4" aria-hidden />}
                {c.to ? <Link to={c.to} className="hover:text-ink hover:underline underline-offset-2">{c.label}</Link> : <span aria-current="page" className="text-ink-2">{c.label}</span>}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.025em] text-ink sm:text-[28px]">{title}</h1>
          {description && <div className="mt-1.5 max-w-3xl text-[15px] text-ink-3">{description}</div>}
          {meta && <div className="mt-3">{meta}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}

export function Section({ title, description, actions, children, className, id }: {
  title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; id?: string
}) {
  return (
    <section className={cn('card', className)} id={id} aria-label={typeof title === 'string' ? title : undefined}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="text-[16px] font-semibold tracking-tight text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}
