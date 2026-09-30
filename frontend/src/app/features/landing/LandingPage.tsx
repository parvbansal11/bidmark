import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, BadgeCheck, Check, ChevronDown, Fingerprint, Gavel, Landmark, ScrollText, Store, TriangleAlert, UserRoundCheck } from 'lucide-react'
import { useAuth } from '@/app/auth/AuthContext'
import { health, toApiError, type ApiError } from '@/app/lib/api'
import { ROLE_HOME, ROLE_LABEL } from '@/app/lib/labels'
import { createFormTracker } from '@/app/lib/telemetry'
import { cn } from '@/app/lib/cn'
import type { Role } from '@/app/services/bidmark/types'
import { CpclLogo, GemMark, TricolourRule, Wordmark } from '@/app/components/gov/Brand'
import { GovUtilityBar, ProvenanceNote } from '@/app/components/gov/GovUtilityBar'
import { Button, Field, Input } from '@/app/components/ui/primitives'
import { SignInTransition } from './SignInTransition'
import { RegisterDialog } from './RegisterDialog'

const ROLES: { role: Role; title: string; line: string; icon: typeof Gavel }[] = [
  { role: 'PROCUREMENT_OFFICER', title: 'Procurement Officer', line: 'Review evidence and decide', icon: Gavel },
  { role: 'BIDDER', title: 'Bidder', line: 'Submit bids and track status', icon: Store },
  { role: 'AUDITOR', title: 'Auditor', line: 'Inspect decisions and the trail', icon: ScrollText },
  { role: 'ADMIN', title: 'Administrator', line: 'Govern tenders, users and rules', icon: Landmark },
]

// Seeded test accounts (backend/app/seed.py). One bidder only: signing in as several
// bidders from one machine records shared device and network signals between them.
const TEST_ACCOUNTS: { role: Role; label: string; name: string; email: string; password: string }[] = [
  { role: 'PROCUREMENT_OFFICER', label: 'Procurement Officer', name: 'Rajesh Kumar', email: 'officer@cpcl.gov.in', password: 'Officer@123' },
  { role: 'BIDDER', label: 'Bidder', name: 'Alpha Pumps & Engineering', email: 'alpha@alphaindia.in', password: 'Bidder@123' },
  { role: 'AUDITOR', label: 'Auditor', name: 'Priya Natarajan, Vigilance', email: 'auditor@cpcl.gov.in', password: 'Auditor@123' },
  { role: 'ADMIN', label: 'Administrator', name: 'S. Venkatesh', email: 'admin@cpcl.gov.in', password: 'Admin@123' },
]

type ServiceState = 'checking' | 'up' | 'down'

// A deep link survives sign-in only when it belongs to the role that signed in.
// Otherwise a link left by the previous session would send the next user to a page their role cannot open.
function targetFor(role: Role, next: string | null) {
  const home = ROLE_HOME[role]
  return next && (next === home || next.startsWith(`${home}/`) || next.startsWith(`${home}?`)) ? next : home
}

export function LandingPage() {
  const { status, user, expired, login } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [role, setRole] = useState<Role>('PROCUREMENT_OFFICER')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [opening, setOpening] = useState<Role | null>(null)
  const [service, setService] = useState<ServiceState>('checking')
  const [registerOpen, setRegisterOpen] = useState(false)
  const tracker = useRef(createFormTracker())
  const emailRef = useRef<HTMLInputElement>(null)

  const checkService = () => {
    setService('checking')
    void health().then(ok => setService(ok ? 'up' : 'down'))
  }
  useEffect(checkService, [])

  const next = params.get('next')
  const [testMenu, setTestMenu] = useState(false)

  if (status === 'authenticated' && user && !opening) {
    return <Navigate to={targetFor(user.role, next)} replace />
  }

  function pickRole(r: Role) {
    setRole(r)
    setError(null)
    setEmail('')
    setPassword('')
  }

  function pickTestAccount(account: typeof TEST_ACCOUNTS[number]) {
    setRole(account.role)
    setTestMenu(false)
    setEmail(account.email)
    setPassword(account.password)
    setError(null)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email || !password) {
      setError(toApiError(new Error('Enter your email and password.')))
      emailRef.current?.focus()
      return
    }
    setBusy(true)
    setError(null)
    try {
      const signedIn = await login(email.trim(), password, tracker.current.snapshot())
      setOpening(signedIn.role)
      const target = targetFor(signedIn.role, next)
      window.setTimeout(() => navigate(target, { replace: true }), 650)
    } catch (err) {
      setError(toApiError(err))
      setService(s => (toApiError(err).kind === 'unavailable' ? 'down' : s))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-canvas">
      {opening && <SignInTransition role={opening} />}
      <GovUtilityBar />
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-[1536px] items-center justify-between gap-6 px-4 sm:px-8">
          <div className="flex items-center gap-5">
            <GemMark />
            <span className="hidden h-8 w-px bg-line md:block" aria-hidden />
            <div className="hidden items-center gap-2.5 md:flex">
              <CpclLogo className="size-9 ring-1 ring-line" />
              <div className="leading-tight">
                <p className="text-[13.5px] font-medium text-ink">Chennai Petroleum Corporation Limited</p>
                <p className="text-[12px] text-ink-3">A Government of India Enterprise</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <ServiceIndicator state={service} onRetry={checkService} />
            <span className="hidden h-8 w-px bg-line lg:block" aria-hidden />
            <Wordmark subtle className="hidden lg:inline-flex [&_svg]:size-5 [&>span:last-child]:text-[14px]" />
          </div>
        </div>
        <TricolourRule className="opacity-80" />
      </header>

      <main id="main">
        <section className="mx-auto grid max-w-[1536px] gap-8 px-4 pb-12 pt-8 sm:px-8 lg:grid-cols-[minmax(0,55fr)_minmax(0,45fr)] lg:gap-12 lg:pt-10">
          <div className="relative min-w-0 overflow-hidden rounded-2xl bg-navy px-7 pb-0 pt-7 text-white animate-rise-in sm:px-10 sm:pt-9">
            <img src="/assets/cpcl/gem-cppp-identity.png" alt="Government e-Marketplace and Central Public Procurement Portal" className="-ml-2 h-16 w-auto mix-blend-lighten" draggable={false} />
            <p className="mt-8 text-[13px] font-semibold uppercase tracking-[0.1em] text-white/60">Bid Compliance Verification</p>
            <h1 className="mt-3 max-w-[14ch] text-[42px] font-semibold leading-[1.04] tracking-[-0.035em] sm:text-[52px] xl:text-[56px]">
              Every bid. Verified before the decision.
            </h1>
            <p className="mt-4 max-w-[46ch] text-[16px] leading-relaxed text-white/75">Evidence for every finding. The procurement officer decides.</p>
            <ConceptRow />
            <EvidencePreview />
            <div className="pointer-events-none relative -mx-10 mt-8 h-28 overflow-hidden" aria-hidden>
              <img src="/assets/cpcl/refinery.png" alt="" className="absolute inset-0 h-full w-full object-cover opacity-50 mix-blend-luminosity" draggable={false} />
              <div className="absolute inset-0 bg-gradient-to-b from-navy via-navy/40 to-transparent" />
            </div>
          </div>

          <div className="animate-rise-in [animation-delay:80ms]">
            <div className="card shadow-raised" id="sign-in">
              <div className="border-b border-line px-6 pb-4 pt-5">
                <h2 className="text-[20px] font-semibold tracking-tight">Sign in</h2>
                <p className="mt-1 text-[13.5px] text-ink-3">Use your departmental account.</p>
              </div>

              {expired && !error && (
                <div className="mx-6 mt-4 flex items-start gap-2 rounded-md border border-review-line bg-review-bg px-3 py-2 text-[13px] text-review" role="status">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  Your session has expired. Sign in again to continue.
                </div>
              )}

              <form onSubmit={onSubmit} className="space-y-4 px-6 pb-6 pt-4" noValidate
                onPaste={tracker.current.onPaste} onKeyDown={tracker.current.onKeyDown}>
                <fieldset>
                  <legend className="mb-2 text-[13px] font-medium text-ink-2">Role</legend>
                  <div className="grid grid-cols-2 gap-2" role="radiogroup">
                    {ROLES.map(r => {
                      const active = r.role === role
                      const Icon = r.icon
                      return (
                        <button key={r.role} type="button" role="radio" aria-checked={active} onClick={() => pickRole(r.role)}
                          className={cn(
                            'group flex flex-col items-start gap-1 rounded-lg border px-3 py-2.5 text-left transition-[border-color,background-color,box-shadow] duration-150',
                            active ? 'border-navy bg-navy-50 shadow-[0_0_0_1px_var(--color-navy)]' : 'border-line bg-surface hover:border-line-strong hover:bg-subtle',
                          )}>
                          <span className="flex w-full items-center justify-between">
                            <Icon className={cn('size-4', active ? 'text-navy' : 'text-ink-3')} aria-hidden />
                            <span className={cn('size-3.5 rounded-full border transition-colors', active ? 'border-[4px] border-navy bg-white' : 'border-line-strong')} aria-hidden />
                          </span>
                          <span className="text-[14px] font-semibold leading-tight text-ink">{r.title}</span>
                          <span className="text-[12.5px] leading-snug text-ink-3">{r.line}</span>
                        </button>
                      )
                    })}
                  </div>
                </fieldset>

                <Field label="Email" htmlFor="email">
                  <Input id="email" ref={emailRef} type="email" autoComplete="username" value={email}
                    onChange={e => setEmail(e.target.value)} placeholder="name@organisation.gov.in"
                    aria-invalid={error?.kind === 'unauthorised' || undefined} />
                </Field>
                <Field label="Password" htmlFor="password">
                  <Input id="password" type="password" autoComplete="current-password" value={password}
                    onChange={e => setPassword(e.target.value)} aria-invalid={error?.kind === 'unauthorised' || undefined} />
                </Field>

                {error && <SignInError error={error} />}

                <Button type="submit" variant="primary" size="lg" className="w-full" busy={busy}>
                  {busy ? 'Verifying credentials' : `Sign in as ${ROLE_LABEL[role]}`}
                  {!busy && <ArrowRight className="size-4" aria-hidden />}
                </Button>

                <div>
                  <div className="flex justify-center">
                    <button type="button" onClick={() => setTestMenu(o => !o)} aria-expanded={testMenu} aria-controls="test-accounts"
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[13px] text-ink-3 transition-colors hover:text-ink">
                      Use test account <ChevronDown className={cn('size-3.5 transition-transform duration-200', testMenu && 'rotate-180')} aria-hidden />
                    </button>
                  </div>
                  <div className={cn('grid transition-[grid-template-rows] duration-200 ease-out', testMenu ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
                    <div className="min-h-0 overflow-hidden">
                      <ul id="test-accounts" role="menu" aria-label="Test accounts" inert={!testMenu}
                        className="mt-2 divide-y divide-line rounded-lg border border-line bg-subtle">
                        {TEST_ACCOUNTS.map(a => {
                          const chosen = email === a.email
                          return (
                            <li key={a.email} role="none">
                              <button type="button" role="menuitem" onClick={() => pickTestAccount(a)}
                                className={cn('flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-surface', chosen && 'bg-surface')}>
                                <span className="min-w-0 flex-1">
                                  <span className="block text-[13.5px] font-semibold text-ink">{a.label}</span>
                                  <span className="block truncate text-[12.5px] text-ink-3">{a.name}</span>
                                </span>
                                <span className="shrink-0 text-[12px] text-ink-4">{a.email}</span>
                                {chosen && <Check className="size-4 shrink-0 text-navy" aria-label="Selected" />}
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  </div>
                </div>

                {role === 'BIDDER' && (
                  <p className="text-center text-[13px] text-ink-3">
                    New seller?{' '}
                    <button type="button" className="link font-medium" onClick={() => setRegisterOpen(true)}>Register as a bidder</button>
                  </p>
                )}
              </form>
            </div>
          </div>
        </section>

      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto grid max-w-[1536px] gap-6 px-4 py-7 sm:px-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div>
            <p className="eyebrow">Procurement ecosystem</p>
            <ul className="mt-3 flex flex-wrap items-center gap-3">
              {[['gepnic', 'GePNIC, simplified procurement'], ['india-gov', 'india.gov.in, the national portal of India'], ['cpcl-tenders', 'CPCL tenders portal'], ['cppp', 'Central Public Procurement Portal']].map(([k, alt]) => (
                <li key={k}><img src={`/assets/cpcl/ecosystem-${k}.png`} alt={alt} className="h-9 w-auto rounded-[3px]" draggable={false} /></li>
              ))}
            </ul>
          </div>
          <div className="max-w-md lg:text-right">
            <Wordmark subtle className="opacity-80" />
            <ProvenanceNote className="mt-2" />
          </div>
        </div>
      </footer>

      <RegisterDialog open={registerOpen} onClose={() => setRegisterOpen(false)}
        onRegistered={(e) => { setRole('BIDDER'); setEmail(e); setPassword(''); setRegisterOpen(false) }} />
    </div>
  )
}

function SignInError({ error }: { error: ApiError }) {
  const message = error.kind === 'unauthorised'
    ? 'Email or password is incorrect.'
    : error.kind === 'unavailable'
      ? 'Verification service unavailable. Your credentials were not checked. Try again shortly.'
      : error.kind === 'forbidden'
        ? error.message || 'This account is not active.'
        : error.message
  return (
    <div role="alert" className="flex items-start gap-2 rounded-md border border-finding-line bg-finding-bg px-3 py-2 text-[13px] text-finding">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  )
}

function ServiceIndicator({ state, onRetry }: { state: ServiceState; onRetry: () => void }) {
  return (
    <div className="flex items-center gap-2 text-[12px]" role="status" aria-live="polite">
      <span className={cn(
        'relative inline-flex size-2 rounded-full',
        state === 'up' ? 'bg-pass' : state === 'down' ? 'bg-finding' : 'bg-ink-4',
      )} aria-hidden>
        {state === 'up' && <span className="absolute inset-0 rounded-full bg-pass/40 [animation:ping_2.4s_cubic-bezier(0,0,0.2,1)_3]" />}
      </span>
      <span className="text-ink-2">
        {state === 'up' ? 'Verification service connected' : state === 'down' ? 'Verification service unavailable' : 'Checking verification service'}
      </span>
      {state === 'down' && <button onClick={onRetry} className="link text-[12px]">Retry</button>}
    </div>
  )
}

function ConceptRow() {
  const items = [
    { icon: BadgeCheck, title: 'Statutory verification', line: 'GST, PAN, MCA21, Udyam and more, with sources.' },
    { icon: Fingerprint, title: 'Document evidence', line: 'Altered certificates shown on the page.' },
    { icon: UserRoundCheck, title: 'Officer decision', line: 'Every high finding needs a ruling first.' },
  ]
  return (
    <ul className="mt-8 grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-3">
      {items.map(it => {
        const Icon = it.icon
        return (
          <li key={it.title} className="bg-navy px-4 py-3.5">
            <Icon className="size-4 text-[#ffc79d]" aria-hidden />
            <p className="mt-2 text-[14px] font-semibold">{it.title}</p>
            <p className="mt-0.5 text-[13px] leading-snug text-white/65">{it.line}</p>
          </li>
        )
      })}
    </ul>
  )
}

// A static illustration of one finding type Bidmark raises.
function EvidencePreview() {
  const rows = useMemo(() => [
    ['Manufacturer', 'Synthetic Pumps Manufacturing Co'],
    ['Name of Authorized Dealer', 'Coastal Hydraulics Ltd'],
    ['Products Covered', 'Centrifugal process pumps'],
    ['Date of Issue', '15/08/2025'],
  ], [])
  return (
    <figure className="mt-5 grid gap-4 rounded-xl border border-white/10 bg-surface p-4 text-ink shadow-raised md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] md:p-5">
      <div className="relative overflow-hidden rounded-md border border-line bg-[#fdfcf9] px-4 py-3.5 font-[Helvetica,Arial,sans-serif]">
        <p className="text-[12px] font-bold uppercase tracking-wide text-ink-2">Manufacturer's Authorization Letter</p>
        <dl className="mt-2.5 space-y-1.5 text-[12px] text-ink-2">
          {rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[1fr_1.1fr] gap-2"><dt className="text-ink-3">{k}</dt><dd>{v}</dd></div>
          ))}
          <div className="grid grid-cols-[1fr_1.1fr] gap-2">
            <dt className="text-ink-3">Valid Upto</dt>
            <dd className="relative w-fit">
              <span className="font-[Times,serif] text-[12.5px]">15/08/2028</span>
              <span className="pointer-events-none absolute -inset-x-1.5 -inset-y-1 rounded-[3px] border-2 border-finding bg-finding/5 animate-pin-in [animation-delay:600ms]" aria-hidden />
            </dd>
          </div>
        </dl>
      </div>
      <figcaption className="flex flex-col justify-center">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-5 items-center rounded-[4px] bg-finding px-1.5 text-[12px] font-bold uppercase tracking-[0.05em] text-white">High</span>
          <span className="text-[13.5px] font-semibold">Value typed over the original</span>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
          <span className="font-mono text-[12.5px]">15/08/2028</span> is printed on top of <span className="font-mono text-[12.5px]">15/08/2026</span>.
          The original value is still in the file underneath.
        </p>
      </figcaption>
    </figure>
  )
}
