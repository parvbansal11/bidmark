import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CircleCheck, Lock, PlayCircle, Undo2 } from 'lucide-react'
import { useUser } from '@/app/auth/AuthContext'
import { toApiError, type ApiError } from '@/app/lib/api'
import { cn } from '@/app/lib/cn'
import { formatDateTime, shortHash } from '@/app/lib/format'
import { CATEGORY_LABEL, categoryLabel, findingTitle, RECOMMENDATION_LABEL, ROLE_LABEL } from '@/app/lib/labels'
import { findingDocumentId, findingPins } from '@/app/lib/bidmarkStatus'
import { invalidate } from '@/app/lib/useResource'
import { cases, type CaseDetail, type Finding, type Role } from '@/app/services/bidmark'
import { ROLE_BASE } from '@/app/features/shell/nav'
import { DispositionControl } from '@/app/components/bidmark/FindingCard'
import { SeverityTag, StatusPill } from '@/app/components/bidmark/Status'
import { Button, Field, Mono, Select, Textarea } from '@/app/components/ui/primitives'

const DECIDABLE = ['SCREENED', 'IN_REVIEW', 'CLARIFICATION_RECEIVED']

function refresh(caseId: string) {
  for (const k of [`case:${caseId}`, 'board:', 'queue', 'home', 'audit', 'timeline:', 'details:', 'intel', 'debarment']) invalidate(k)
}

function errorText(e: ApiError, action: string) {
  return e.kind === 'unavailable' ? `Verification service unavailable. The ${action} was not recorded.` : e.message
}

// Decision: can I make a decision yet?
export function DecisionTab({ c, role, onOpenFinding, onReload }: {
  c: CaseDetail; role: Role; onOpenFinding: (f: Finding) => void; onReload: () => void
}) {
  const user = useUser()
  const isOfficer = role === 'PROCUREMENT_OFFICER'
  const blockers = c.findings.filter(f => c.undisposed_high.includes(f.id))
  const decided = c.stage === 'DECIDED'

  return (
    <div className="space-y-5">
      {decided ? <DecisionRecord c={c} viewerId={user.id} viewerName={user.full_name} role={role} /> : (
        <>
          <section className={cn('card overflow-hidden', blockers.length ? 'border-finding-line' : 'border-pass-line')} aria-label="Blockers">
            <div className={cn('flex items-center gap-3 px-5 py-3.5', blockers.length ? 'bg-finding-bg/70' : 'bg-pass-bg/70')}>
              {blockers.length ? <Lock className="size-5 text-finding" aria-hidden /> : <CircleCheck className="size-5 text-pass" aria-hidden />}
              <h2 className="text-[16px] font-semibold">
                {blockers.length ? `${blockers.length} high finding${blockers.length === 1 ? '' : 's'} require${blockers.length === 1 ? 's' : ''} disposition` : 'No blockers. A decision can be recorded.'}
              </h2>
            </div>
            {blockers.length > 0 && (
              <ul className="divide-y divide-line">
                {blockers.map(f => (
                  <li key={f.id} className="px-5 py-3.5">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <SeverityTag severity="HIGH" />
                      <span className="text-[15px] font-semibold">{findingTitle(f.code, f.title)}</span>
                      {f.category && <span className="text-[13px] text-ink-3">{categoryLabel(f.category)}</span>}
                      {(findingPins(f).length > 0 || findingDocumentId(f) || f.source === 'CARTEL') && (
                        <button onClick={() => onOpenFinding(f)} className="ml-auto text-[14px] text-navy-600 hover:underline">Review evidence</button>
                      )}
                    </div>
                    {isOfficer ? <div className="mt-2.5"><DispositionControl caseId={c.id} finding={f} onChanged={onReload} /></div>
                      : <p className="mt-1 text-[13px] text-ink-3">Awaiting a ruling from the Procurement Officer.</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {isOfficer ? <ActionForm c={c} locked={blockers.length > 0} /> : (
            <p className="rounded-lg border border-line bg-surface px-5 py-4 text-[14px] text-ink-3">
              The qualification decision is recorded by the Procurement Officer. {ROLE_LABEL[role]} access is read only.
            </p>
          )}
          {c.ai_recommendation && (
            <p className="text-[13.5px] text-ink-3">
              Bidmark recommendation: <span className="text-ink-2">{RECOMMENDATION_LABEL[c.ai_recommendation]}</span>. This is decision support. Final qualification remains with the Procurement Officer.
            </p>
          )}
        </>
      )}
    </div>
  )
}

type Action = 'QUALIFIED' | 'DISQUALIFIED' | 'CLARIFY'

const ACTIONS: { id: Action; label: string; note: string }[] = [
  { id: 'QUALIFIED', label: 'Qualify', note: 'Bid proceeds to financial evaluation' },
  { id: 'DISQUALIFIED', label: 'Disqualify', note: 'Bid is not considered further' },
  { id: 'CLARIFY', label: 'Request clarification', note: 'Ask the bidder before deciding' },
]

function ActionForm({ c, locked }: { c: CaseDetail; locked: boolean }) {
  const [action, setAction] = useState<Action | null>(null)
  const [reason, setReason] = useState('')
  const [category, setCategory] = useState('')
  const [due, setDue] = useState(3)
  const [busy, setBusy] = useState(false)
  const [starting, setStarting] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const decidable = DECIDABLE.includes(c.stage)
  const awaiting = c.stage === 'CLARIFICATION_REQUESTED'
  const disabled = (a: Action) => !decidable || (a !== 'CLARIFY' && locked)
  const shown = ACTIONS.filter(a => !locked || a.id === 'CLARIFY')
  const ready = action && !disabled(action) && reason.trim().length >= 10

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!action) return
    setBusy(true)
    setError(null)
    try {
      if (action === 'CLARIFY') {
        await cases.clarify(c.id, { question: reason.trim(), finding_id: null, requested_category: category || null, due_days: due })
        setSent(true)
      } else {
        await cases.decide(c.id, action, reason.trim())
      }
      refresh(c.id)
    } catch (err) {
      setError(toApiError(err))
    } finally {
      setBusy(false)
    }
  }

  async function startReview() {
    setStarting(true)
    setError(null)
    try { await cases.startReview(c.id); refresh(c.id) } catch (err) { setError(toApiError(err)) } finally { setStarting(false) }
  }

  if (awaiting) {
    return <p className="rounded-lg border border-line bg-surface px-5 py-4 text-[14px] text-ink-2">A clarification is with the bidder. A decision can be recorded once they reply.</p>
  }

  return (
    <form onSubmit={submit} className="card overflow-hidden" aria-label="Record decision">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h2 className="text-[16px] font-semibold">{locked ? 'Before the decision' : 'Final procurement decision'}</h2>
        {c.stage === 'SCREENED' && <Button type="button" size="sm" variant="ghost" busy={starting} icon={<PlayCircle className="size-3.5" aria-hidden />} onClick={startReview}>Assign to me</Button>}
      </div>
      <div className="space-y-4 px-5 py-4">
        {locked && <p className="text-[14px] text-ink-2">Qualify and Disqualify appear here once every high finding has a ruling. You can ask the bidder for a clarification now.</p>}
        <div className={cn('grid gap-2', shown.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')} role="radiogroup" aria-label="Action">
          {shown.map(a => (
            <button key={a.id} type="button" role="radio" aria-checked={action === a.id} disabled={disabled(a.id)} onClick={() => setAction(a.id)}
              className={cn('rounded-lg border px-3.5 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45',
                action === a.id ? 'border-navy bg-navy-50 shadow-[0_0_0_1px_var(--color-navy)]' : 'border-line hover:border-line-strong hover:bg-subtle')}>
              <span className="block text-[14.5px] font-semibold">{a.label}</span>
              <span className="block text-[13px] text-ink-3">{a.note}</span>
            </button>
          ))}
        </div>
        {action && (
          <div className="space-y-4 animate-fade-in">
            <Field label={action === 'CLARIFY' ? 'Question to the bidder' : 'Reason for the record'} htmlFor="decision-reason" required
              hint={action === 'CLARIFY' ? 'The bidder sees your question, not the finding.' : 'At least 10 characters. The bidder sees this reason.'}>
              <Textarea id="decision-reason" value={reason} onChange={e => setReason(e.target.value)}
                placeholder={action === 'CLARIFY' ? 'Please upload the OEM authorisation letter as issued by the manufacturer.' : 'For example: OEM authorisation altered after issue; finding upheld after checking with the manufacturer.'} />
            </Field>
            {action === 'CLARIFY' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Document requested" htmlFor="clar-c">
                  <Select id="clar-c" value={category} onChange={e => setCategory(e.target.value)}>
                    <option value="">No document requested</option>
                    {Object.entries(CATEGORY_LABEL).filter(([k]) => !['TURNOVER', 'DEBARMENT', 'DIGILOCKER'].includes(k)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                </Field>
                <Field label="Reply due in" htmlFor="clar-d">
                  <Select id="clar-d" value={due} onChange={e => setDue(Number(e.target.value))}>
                    {[1, 2, 3, 5, 7].map(d => <option key={d} value={d}>{d} day{d > 1 ? 's' : ''}</option>)}
                  </Select>
                </Field>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-subtle px-5 py-3">
        <p className="text-[13px] text-ink-3">
          {sent ? 'Clarification sent. The case now waits for the bidder.'
            : !decidable ? 'This case cannot be decided in its current stage.'
              : locked ? 'The decision is locked until every high finding has a ruling.' : 'Recorded with your name, the reason and the audit chain head.'}
        </p>
        <Button type="submit" variant="primary" disabled={!ready} busy={busy}>{action === 'CLARIFY' || locked ? 'Send to bidder' : 'Record decision'}</Button>
      </div>
      {error && <p className="border-t border-finding-line bg-finding-bg px-5 py-2.5 text-[13.5px] text-finding" role="alert">{errorText(error, action === 'CLARIFY' ? 'clarification' : 'decision')}</p>}
    </form>
  )
}

function DecisionRecord({ c, viewerId, viewerName, role }: { c: CaseDetail; viewerId: string; viewerName: string; role: Role }) {
  const [hash, setHash] = useState(false)
  const upheld = c.findings.filter(f => f.disposition?.outcome === 'UPHELD').length
  const dismissed = c.findings.filter(f => f.disposition?.outcome === 'DISMISSED').length
  return (
    <section className="card overflow-hidden" aria-label="Decision record">
      <div className={cn('flex items-center justify-between gap-3 px-5 py-4', c.decision === 'QUALIFIED' ? 'bg-pass-bg/70' : 'bg-finding-bg/70')}>
        <p className="text-[20px] font-semibold tracking-tight">{c.decision === 'QUALIFIED' ? 'Qualified' : 'Disqualified'}</p>
        <StatusPill kind={c.decision === 'QUALIFIED' ? 'met' : 'not_met'} label="Recorded by officer" />
      </div>
      <dl className="grid gap-x-6 gap-y-3 px-5 py-4 text-[14px] sm:grid-cols-2">
        <div><dt className="text-ink-3">Officer</dt><dd>{c.decided_by === viewerId ? viewerName.split(',')[0] : 'Procurement Officer'}</dd></div>
        <div><dt className="text-ink-3">Recorded</dt><dd>{formatDateTime(c.decided_at)}</dd></div>
        <div className="sm:col-span-2"><dt className="text-ink-3">Reason</dt><dd>{c.decision_reason}</dd></div>
        <div><dt className="text-ink-3">Bidmark recommendation at the time</dt><dd>{c.ai_recommendation ? RECOMMENDATION_LABEL[c.ai_recommendation] : 'Not assessed'}</dd></div>
        <div><dt className="text-ink-3">Finding rulings</dt><dd>{upheld} upheld, {dismissed} dismissed</dd></div>
        <div className="sm:col-span-2">
          <dt className="text-ink-3">Integrity</dt>
          <dd className="flex flex-wrap items-center gap-3">
            {c.audit_anchor ? <StatusPill kind="verified" label="Anchored in audit trail" /> : 'Not anchored'}
            {c.audit_anchor && <button onClick={() => setHash(h => !h)} className="text-[13.5px] text-navy-600 hover:underline">{hash ? 'Hide hash' : 'View hash'}</button>}
            <Link to={`${ROLE_BASE[role]}/audit`} className="text-[13.5px] text-navy-600 hover:underline">Open audit trail</Link>
          </dd>
          {hash && c.audit_anchor && <Mono className="mt-1.5 block break-all text-[12.5px] text-ink-2" title={c.audit_anchor}>{c.audit_anchor}</Mono>}
          {hash && <p className="mt-1 text-[12.5px] text-ink-3">Hash of the audit entry written for this decision ({shortHash(c.audit_anchor)}).</p>}
        </div>
      </dl>
      {role === 'ADMIN' && <ReopenForm caseId={c.id} />}
    </section>
  )
}

function ReopenForm({ caseId }: { caseId: string }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try { await cases.reopen(caseId, reason.trim()); refresh(caseId) } catch (err) { setError(toApiError(err)) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="space-y-3 border-t border-line px-5 py-4">
      <Field label="Reopen this case" htmlFor="reopen" hint="Returns the case to officer review. The decision stays in the audit trail.">
        <Textarea id="reopen" value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason for reopening, at least 10 characters" />
      </Field>
      <div className="flex justify-end"><Button type="submit" busy={busy} disabled={reason.trim().length < 10} icon={<Undo2 className="size-4" aria-hidden />}>Reopen case</Button></div>
      {error && <p className="text-[13.5px] text-finding" role="alert">{errorText(error, 'reopening')}</p>}
    </form>
  )
}
