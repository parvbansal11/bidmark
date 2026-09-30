import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useUser } from '@/app/auth/AuthContext'
import { toApiError, type ApiError } from '@/app/lib/api'
import { cn } from '@/app/lib/cn'
import { firstName, formatDate, greeting, humanise } from '@/app/lib/format'
import { categoryLabel, CATEGORY_LABEL, findingTitle, ROLE_LABEL, STAGE_LABEL } from '@/app/lib/labels'
import { invalidate, useResource } from '@/app/lib/useResource'
import { home, rules, tenders, users, type AdminHome, type Requirement, type Role, type RuleReliability } from '@/app/services/bidmark'
import { PageHeader, Section } from '@/app/features/shell/AppShell'
import { StatusPill } from '@/app/components/bidmark/Status'
import { Button, Dialog, Field, Input, Mono, Select, Skeleton, SkeletonRows } from '@/app/components/ui/primitives'
import { EmptyState, ErrorState, Loadable } from '@/app/components/ui/states'
import { ChainBanner } from '@/app/features/audit/ChainStatus'
import { tenderStatusKind } from '@/app/features/tender/TenderPages'

export function AdminOverview() {
  const user = useUser()
  const res = useResource('home', () => home())
  const data = res.data as AdminHome | undefined
  if (res.error) return <ErrorState error={res.error} onRetry={res.reload} what="administration" />
  if (!data) return <div className="space-y-4"><Skeleton className="h-8 w-72" /><SkeletonRows /></div>
  const s = data.stats
  return (
    <div>
      <PageHeader eyebrow="Administration" title={`${greeting()}, ${firstName(user.full_name)}`}
        description="Governance of tenders, accounts and verification rules. Qualification decisions rest with the procurement officer." />
      <ChainBanner chain={data.audit_chain} className="mb-6" />
      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Tasks">
          {data.tasks.length === 0 ? <EmptyState title="No administrative tasks" /> : (
            <ul className="divide-y divide-line">
              {data.tasks.map((t, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-5 py-3 text-[13px]">
                  <span>{t.label}</span>
                  {t.tender_id && <Link to={`/admin/tenders?requirements=${t.tender_id}`} className="shrink-0 text-[12.5px] font-medium text-navy-600 hover:underline">Add requirements</Link>}
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Platform at a glance">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 px-5 py-4 text-[13px]">
            <div><dt className="text-ink-3">Tenders</dt><dd className="mt-0.5">{Object.entries(s.tenders_by_status).map(([k, v]) => `${v} ${humanise(k).toLowerCase()}`).join(', ')}</dd></div>
            <div><dt className="text-ink-3">Accounts</dt><dd className="mt-0.5">{Object.entries(s.users_by_role).map(([k, v]) => `${v} ${ROLE_LABEL[k as Role] ?? k}`).join(', ')}</dd></div>
            <div className="col-span-2"><dt className="text-ink-3">Cases by stage</dt><dd className="mt-0.5">{Object.entries(s.cases_by_stage).map(([k, v]) => `${v} ${(STAGE_LABEL as Record<string, string>)[k]?.toLowerCase() ?? k}`).join(', ')}</dd></div>
          </dl>
        </Section>
      </div>
      <div className="mt-6"><RulesTable rows={data.rules} title="Least reliable rules" /></div>
    </div>
  )
}

function RulesTable({ rows, title }: { rows: RuleReliability[]; title: string }) {
  return (
    <Section title={title} description="Each officer ruling is a label. A rule officers keep dismissing loses weight in the review queue. Precision starts at 0.5 with no history.">
      {rows.length === 0 ? (
        <EmptyState title="No rulings recorded yet" body="Precision appears once officers uphold or dismiss findings. Nothing is estimated before then." />
      ) : (
        <table className="w-full text-[13px]">
          <thead className="bg-subtle text-left text-[12px] uppercase tracking-[0.05em] text-ink-3">
            <tr><th className="px-5 py-2 font-medium">Rule</th><th className="px-3 py-2 text-right font-medium">Rulings</th><th className="px-3 py-2 text-right font-medium">Upheld</th><th className="px-3 py-2 text-right font-medium">Dismissed</th><th className="px-5 py-2 font-medium">Precision</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(r => (
              <tr key={r.code}>
                <td className="px-5 py-2.5"><p className="font-medium">{findingTitle(r.code, humanise(r.code))}</p><Mono className="text-[12px] text-ink-3">{r.code}</Mono></td>
                <td className="tnum px-3 py-2.5 text-right">{r.reviewed}</td>
                <td className="tnum px-3 py-2.5 text-right">{r.upheld ?? 0}</td>
                <td className="tnum px-3 py-2.5 text-right">{r.dismissed ?? 0}</td>
                <td className="px-5 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-28 overflow-hidden rounded-full bg-sunken"><span className={cn('block h-full rounded-full', r.precision < 0.4 ? 'bg-finding' : r.precision < 0.6 ? 'bg-review' : 'bg-pass')} style={{ width: `${r.precision * 100}%` }} /></span>
                    <span className="tnum text-[12.5px]">{r.precision.toFixed(2)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  )
}

export function RulePerformancePage() {
  const res = useResource('rules', () => rules.reliability())
  return (
    <div>
      <PageHeader eyebrow="Bidmark governance" title="Rule performance" description="How often officers uphold each detection rule, computed from recorded rulings (Beta-Bernoulli with a uniform prior)." />
      <Loadable resource={res} what="rule performance">{rows => <RulesTable rows={rows} title="All rules with rulings" />}</Loadable>
    </div>
  )
}

export function UsersPage() {
  const res = useResource('users', () => users.list())
  const me = useUser()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  async function toggle(id: string, active: boolean) {
    setBusy(id)
    setError(null)
    try { await users.update(id, { is_active: !active }); invalidate('users') } catch (e) { setError(toApiError(e)) } finally { setBusy(null) }
  }
  return (
    <div>
      <PageHeader eyebrow="Administration" title="Users and roles" description="Staff accounts are issued here. Bidders register themselves."
        actions={<Button variant="primary" icon={<Plus className="size-4" aria-hidden />} onClick={() => setOpen(true)}>Add user</Button>} />
      {error && <p className="mb-3 rounded-md border border-finding-line bg-finding-bg px-3 py-2 text-[13px] text-finding" role="alert">{error.message}</p>}
      <Loadable resource={res} what="users">
        {list => (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead className="bg-subtle text-left text-[12px] uppercase tracking-[0.05em] text-ink-3">
                <tr><th className="px-5 py-2.5 font-medium">Name</th><th className="px-3 py-2.5 font-medium">Email</th><th className="px-3 py-2.5 font-medium">Role</th><th className="px-3 py-2.5 font-medium">Created</th><th className="px-3 py-2.5 font-medium">Status</th><th className="px-5 py-2.5" /></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {[...list].sort((a, b) => a.role.localeCompare(b.role)).map(u => (
                  <tr key={u.id}>
                    <td className="px-5 py-2.5 font-medium">{u.full_name}</td>
                    <td className="px-3 py-2.5 text-ink-2">{u.email}</td>
                    <td className="px-3 py-2.5">{ROLE_LABEL[u.role]}</td>
                    <td className="px-3 py-2.5 text-ink-3">{formatDate(u.created_at)}</td>
                    <td className="px-3 py-2.5"><StatusPill size="sm" kind={u.is_active ? 'met' : 'not_required'} label={u.is_active ? 'Active' : 'Deactivated'} /></td>
                    <td className="px-5 py-2.5 text-right">{u.id !== me.id && <Button size="sm" variant="ghost" busy={busy === u.id} onClick={() => toggle(u.id, u.is_active)}>{u.is_active ? 'Deactivate' : 'Reactivate'}</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Loadable>
      <AddUserDialog open={open} onClose={() => setOpen(false)} />
    </div>
  )
}

function AddUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'PROCUREMENT_OFFICER' as Role })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try { await users.create(form); invalidate('users'); onClose() } catch (err) { setError(toApiError(err)) } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onClose={onClose} title="Add user" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="add-user" busy={busy}>Create account</Button></>}>
      <form id="add-user" onSubmit={submit} className="grid gap-4">
        <Field label="Full name" htmlFor="u-name" required><Input id="u-name" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} /></Field>
        <Field label="Email" htmlFor="u-email" required><Input id="u-email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Initial password" htmlFor="u-pass" required><Input id="u-pass" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></Field>
        <Field label="Role" htmlFor="u-role">
          <Select id="u-role" value={form.role} onChange={e => setForm({ ...form, role: e.target.value as Role })}>
            {(['PROCUREMENT_OFFICER', 'AUDITOR', 'ADMIN', 'BIDDER'] as Role[]).map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </Select>
        </Field>
        {error && <p className="text-[13px] text-finding" role="alert">{error.message}</p>}
      </form>
    </Dialog>
  )
}

export function AdminTendersPage() {
  const list = useResource('tenders', () => tenders.list())
  const initial = new URLSearchParams(window.location.search).get('requirements')
  const [target, setTarget] = useState<string | null>(initial)
  return (
    <div>
      <PageHeader eyebrow="Administration" title="Tenders" description="Eligibility requirements drive what Bidmark checks for every bid." />
      <Loadable resource={list} what="tenders">
        {items => (
          <div className="space-y-3">
            {items.map(t => <TenderRequirementsCard key={t.id} tenderId={t.id} title={t.title} number={t.tender_number} status={t.status} deadline={t.deadline} open={target === t.id} onAdd={() => setTarget(t.id)} onClose={() => setTarget(null)} />)}
          </div>
        )}
      </Loadable>
    </div>
  )
}

function TenderRequirementsCard({ tenderId, title, number, status, deadline, open, onAdd, onClose }: {
  tenderId: string; title: string; number: string; status: string; deadline: string | null; open: boolean; onAdd: () => void; onClose: () => void
}) {
  const reqs = useResource(`requirements:${tenderId}`, () => tenders.requirements(tenderId))
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div>
          <p className="flex items-center gap-2 text-[14px] font-semibold">{title}<StatusPill size="sm" kind={tenderStatusKind(status)} label={humanise(status)} /></p>
          <p className="text-[12px] text-ink-3"><Mono className="text-[12px]">{number}</Mono>, bid end {formatDate(deadline)}</p>
        </div>
        <div className="flex gap-2">
          <Link to={`/admin/tenders/${tenderId}`} className="inline-flex h-8 items-center rounded-md px-3 text-[13px] text-navy-600 hover:bg-navy-50">Open tender</Link>
          <Button size="sm" icon={<Plus className="size-3.5" aria-hidden />} onClick={onAdd}>Add requirement</Button>
        </div>
      </div>
      {reqs.error ? <div className="p-4"><ErrorState error={reqs.error} onRetry={reqs.reload} compact what="requirements" /></div> : !reqs.data ? <div className="p-4"><SkeletonRows rows={2} /></div>
        : reqs.data.length === 0 ? <p className="px-5 py-3 text-[13px] text-review">No eligibility requirements. Bids on this tender cannot be evaluated until requirements are added.</p> : (
          <ul className="flex flex-wrap gap-1.5 px-5 py-3">
            {reqs.data.map(r => <li key={r.id} className="rounded border border-line bg-subtle px-2 py-0.5 text-[12px]">{categoryLabel(r.requirement_type)}{r.is_mandatory ? '' : ' (optional)'}{r.threshold != null ? `, ${r.threshold} ${r.threshold_unit.toLowerCase()}` : ''}</li>)}
          </ul>
        )}
      <AddRequirementDialog tenderId={tenderId} open={open} onClose={onClose} />
    </section>
  )
}

const REQ_TYPES = ['GST', 'PAN', 'MCA', 'UDYAM', 'OEM_AUTHORIZATION', 'TURNOVER', 'LOCAL_CONTENT', 'EXPERIENCE_CERTIFICATE', 'EPFO', 'ESIC', 'NSIC', 'DEBARMENT']
const EVIDENCE_FOR: Record<string, string> = { TURNOVER: 'FINANCIAL', DEBARMENT: 'OTHER', LOCAL_CONTENT: 'LOCAL_CONTENT' }

function AddRequirementDialog({ tenderId, open, onClose }: { tenderId: string; open: boolean; onClose: () => void }) {
  const [type, setType] = useState('GST')
  const [description, setDescription] = useState('')
  const [mandatory, setMandatory] = useState(true)
  const [threshold, setThreshold] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const unit = type === 'TURNOVER' ? 'CRORE' : type === 'LOCAL_CONTENT' ? 'PERCENT' : 'NONE'
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const body: Omit<Requirement, 'id' | 'tender_id'> = {
        requirement_type: type, description: description || categoryLabel(type), is_mandatory: mandatory,
        threshold: threshold ? Number(threshold) : null, threshold_unit: unit, weight: 1, evidence_type: EVIDENCE_FOR[type] ?? type,
      }
      await tenders.addRequirement(tenderId, body)
      invalidate(`requirements:${tenderId}`)
      invalidate('home')
      setDescription('')
      setThreshold('')
      onClose()
    } catch (err) { setError(toApiError(err)) } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onClose={onClose} title="Add eligibility requirement" description="Bidmark evaluates every bid against it using the evidence category shown."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form={`req-${tenderId}`} busy={busy}>Add requirement</Button></>}>
      <form id={`req-${tenderId}`} onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Requirement" htmlFor={`rt-${tenderId}`}>
          <Select id={`rt-${tenderId}`} value={type} onChange={e => setType(e.target.value)}>{REQ_TYPES.map(t => <option key={t} value={t}>{categoryLabel(t)}</option>)}</Select>
        </Field>
        <Field label="Evidence category" htmlFor={`re-${tenderId}`}><Input id={`re-${tenderId}`} value={CATEGORY_LABEL[EVIDENCE_FOR[type] ?? type] ?? type} readOnly /></Field>
        <div className="sm:col-span-2"><Field label="Description shown to bidders" htmlFor={`rd-${tenderId}`}><Input id={`rd-${tenderId}`} value={description} onChange={e => setDescription(e.target.value)} placeholder={categoryLabel(type)} /></Field></div>
        {unit !== 'NONE' && <Field label={`Threshold (${unit === 'CRORE' ? 'crore' : 'percent'})`} htmlFor={`rth-${tenderId}`}><Input id={`rth-${tenderId}`} type="number" value={threshold} onChange={e => setThreshold(e.target.value)} /></Field>}
        <label className="flex items-center gap-2 self-end pb-2 text-[13px]"><input type="checkbox" checked={mandatory} onChange={e => setMandatory(e.target.checked)} className="size-4 accent-[var(--color-navy)]" /> Mandatory</label>
        {error && <p className="sm:col-span-2 text-[13px] text-finding" role="alert">{error.message}</p>}
      </form>
    </Dialog>
  )
}
