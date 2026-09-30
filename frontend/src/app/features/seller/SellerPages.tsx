import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, Bell, CalendarClock, CircleCheck, FileUp, Info, MessageSquareReply, Upload } from 'lucide-react'
import { useUser } from '@/app/auth/AuthContext'
import { toApiError, type ApiError } from '@/app/lib/api'
import { cn } from '@/app/lib/cn'
import { firstName, formatDate, formatDateTime, formatINR, greeting, relativeDays } from '@/app/lib/format'
import { categoryLabel, CATEGORY_LABEL } from '@/app/lib/labels'
import { createFormTracker } from '@/app/lib/telemetry'
import { invalidate, useResource } from '@/app/lib/useResource'
import {
  bidders, bids, cases, clarifications, home, portal, tenders,
  type BidderCase, type BidderHome, type Clarification, type Requirement,
} from '@/app/services/bidmark'
import { PageHeader, Section } from '@/app/features/shell/AppShell'
import { StatusPill, StatusText, type StatusKind } from '@/app/components/bidmark/Status'
import { Button, Field, Input, Mono, Select, Skeleton, SkeletonRows, Textarea } from '@/app/components/ui/primitives'
import { EmptyState, ErrorState, Loadable } from '@/app/components/ui/states'

const UPLOAD_CATEGORIES = ['GST', 'PAN', 'UDYAM', 'MCA', 'OEM_AUTHORIZATION', 'FINANCIAL', 'LOCAL_CONTENT', 'EXPERIENCE_CERTIFICATE', 'EPFO', 'ESIC', 'NSIC', 'STARTUP_INDIA', 'INCOME_TAX', 'OTHER']

function useSellerHome() {
  return useResource('home', () => home() as Promise<BidderHome>)
}

const STAGE: Record<string, { kind: StatusKind; label: string }> = {
  DRAFT: { kind: 'unchecked', label: 'Draft' },
  SUBMITTED: { kind: 'processing', label: 'Submitted' },
  UNDER_EVALUATION: { kind: 'pending', label: 'Under evaluation' },
  CLARIFICATION_REQUESTED: { kind: 'review', label: 'Clarification requested' },
  DECIDED: { kind: 'met', label: 'Decided' },
}

function stageOf(c: BidderCase) {
  if (c.stage === 'DECIDED') return c.decision === 'QUALIFIED' ? { kind: 'met' as StatusKind, label: 'Qualified' } : { kind: 'not_met' as StatusKind, label: 'Not qualified' }
  return STAGE[c.stage] ?? { kind: 'pending' as StatusKind, label: c.stage }
}

function missingLabel(cat: string, reqs?: Requirement[]) {
  const req = reqs?.find(r => r.evidence_type === cat && r.is_mandatory)
  if (cat === 'OTHER' && req) return `Declaration: ${req.description}`
  return categoryLabel(cat)
}

export function SellerDashboard() {
  const user = useUser()
  const res = useSellerHome()
  const data = res.data
  if (res.error) return <ErrorState error={res.error} onRetry={res.reload} what="your dashboard" />
  if (!data) return <div className="space-y-4"><Skeleton className="h-8 w-72" /><SkeletonRows /></div>
  const openClar = data.cases.reduce((n, c) => n + c.open_clarifications, 0)
  return (
    <div>
      <PageHeader eyebrow={data.company_name} title={`${greeting()}, ${firstName(user.full_name).replace(/\s*\(bid desk\)$/, '')}`}
        description="Your bids to Chennai Petroleum Corporation Limited, and anything that needs you." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Section title="Needs your action" description={data.tasks.length ? `${data.tasks.length} item${data.tasks.length > 1 ? 's' : ''}` : undefined}>
            {data.tasks.length === 0 && openClar === 0 ? <EmptyState icon={<CircleCheck className="size-4" />} title="Nothing needs your attention" body="We will notify you if the buyer asks for a clarification." /> : (
              <ul className="divide-y divide-line">
                {data.tasks.map((t, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                    <div className="flex items-start gap-3">
                      <StatusPill size="sm" kind={t.expired ? 'not_met' : 'review'} label={t.code === 'RENEW_DOCUMENT' ? (t.expired ? 'Expired' : 'Expiring') : 'Action'} className="mt-0.5" />
                      <div>
                        <p className="text-[13.5px] font-medium">{t.category ? `${categoryLabel(t.category)} ${t.expired ? 'expired' : 'expires'} on ${formatDate(t.valid_until)}` : t.label}</p>
                        {t.code === 'RENEW_DOCUMENT' && <p className="text-[12px] text-ink-3">Upload the renewed certificate. A certificate must be valid on the bid date.</p>}
                      </div>
                    </div>
                    <Link to={t.case_id ? `/seller/bids/${t.case_id}` : '/seller/documents'} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-navy-600 hover:underline">
                      {t.code === 'RENEW_DOCUMENT' ? 'Upload renewal' : 'Open'} <ArrowRight className="size-3.5" aria-hidden />
                    </Link>
                  </li>
                ))}
                {data.cases.filter(c => c.open_clarifications > 0).map(c => (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                    <div className="flex items-start gap-3"><StatusPill size="sm" kind="review" label="Clarification" className="mt-0.5" /><p className="text-[13.5px] font-medium">The buyer asked a question on {c.tender_title}</p></div>
                    <Link to={`/seller/bids/${c.id}`} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-navy-600 hover:underline">Reply <ArrowRight className="size-3.5" aria-hidden /></Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <MyBidsList cases={data.cases} />
        </div>
        <div className="space-y-4">
          <Section title="Open tenders">
            {data.open_tenders.length === 0 ? <EmptyState title="No open tenders" /> : (
              <ul className="divide-y divide-line">
                {data.open_tenders.map(t => (
                  <li key={t.id}>
                    <Link to={`/seller/tenders/${t.id}`} className="block px-5 py-3 hover:bg-subtle">
                      <p className="text-[13.5px] font-semibold">{t.title}</p>
                      <p className="mt-0.5 text-[12px] text-ink-3"><Mono className="text-[12px]">{t.tender_number}</Mono>, closes {relativeDays(t.deadline)}</p>
                      <p className="mt-1.5 text-[12px]">{t.already_bidding ? <StatusText kind="met" label="Bid submitted" /> : <span className="text-navy-600">Prepare bid</span>}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <div className="rounded-xl border border-line bg-surface p-4 text-[12.5px] leading-relaxed text-ink-3">
            <p className="flex items-center gap-1.5 font-semibold text-ink"><Info className="size-3.5" aria-hidden />About evaluation</p>
            <p className="mt-1">Your documents are verified against the tender's eligibility requirements. The buyer's procurement officer decides and records the reason, which you will see here.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function MyBidsList({ cases: list }: { cases: BidderCase[] }) {
  return (
    <Section title="My bids">
      {list.length === 0 ? <EmptyState title="You have not bid on any tender yet" /> : (
        <ul className="divide-y divide-line">
          {list.map(c => {
            const s = stageOf(c)
            return (
              <li key={c.id}>
                <Link to={`/seller/bids/${c.id}`} className="grid items-center gap-2 px-5 py-3.5 hover:bg-subtle md:grid-cols-[minmax(0,1fr)_200px_auto]">
                  <div className="min-w-0"><p className="truncate text-[13.5px] font-semibold">{c.tender_title}</p><p className="text-[12px] text-ink-3">{c.next_action.label}</p></div>
                  <div><StatusPill size="sm" kind={s.kind} label={s.label} /></div>
                  <ArrowRight className="hidden size-4 text-ink-4 md:block" aria-hidden />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}

export function SellerBidsPage() {
  const res = useResource('seller:cases', () => cases.mine())
  return (
    <div>
      <PageHeader eyebrow="Seller" title="My bids" />
      <Loadable resource={res} what="your bids">{list => <MyBidsList cases={list} />}</Loadable>
    </div>
  )
}

export function SellerBidPage() {
  const { caseId } = useParams()
  const res = useResource(caseId ? `seller:case:${caseId}` : null, () => cases.get(caseId!) as unknown as Promise<BidderCase>)
  const c = res.data
  const reqs = useResource(c ? `requirements:${c.tender_id}` : null, () => tenders.requirements(c!.tender_id))
  const sh = useSellerHome()
  const bid = useResource(c && sh.data ? `bid:${c.tender_id}:${sh.data.bidder_id}` : null, () => bids.get(c!.tender_id, sh.data!.bidder_id))
  if (res.error) return <ErrorState error={res.error} onRetry={res.reload} what="this bid" />
  if (!c) return <SkeletonRows />
  const s = stageOf(c)
  const steps = ['Submitted', 'Under evaluation', 'Decision']
  const at = c.stage === 'DECIDED' ? 2 : c.stage === 'DRAFT' ? -1 : 1
  return (
    <div>
      <PageHeader crumbs={[{ label: 'My bids', to: '/seller/bids' }, { label: c.tender_title ?? 'Bid' }]} eyebrow="Bid status" title={c.tender_title ?? 'Bid'}
        meta={<div className="flex flex-wrap items-center gap-3 text-[12.5px] text-ink-2"><StatusPill kind={s.kind} label={s.label} />
          {bid.data && <><span>Submitted {formatDateTime(bid.data.submitted_at)}</span><span className="tnum">Quoted {formatINR(bid.data.quoted_price)}</span><Mono className="text-[12px]">BID-{bid.data.id.slice(0, 8).toUpperCase()}</Mono></>}</div>} />
      <ol className="mb-6 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-line bg-line" aria-label="Progress">
        {steps.map((st, i) => (
          <li key={st} className={cn('bg-surface px-4 py-3 text-[13px]', i <= at ? 'text-ink' : 'text-ink-4')} aria-current={i === at ? 'step' : undefined}>
            <span className={cn('mr-2 inline-grid size-5 place-items-center rounded-full text-[12px] font-semibold', i < at || (i === at && c.stage === 'DECIDED') ? 'bg-pass text-white' : i === at ? 'bg-navy text-white' : 'border border-line-strong')}>{i + 1}</span>{st}
          </li>
        ))}
      </ol>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          {c.stage === 'DECIDED' && (
            <Section title="Outcome">
              <div className="px-5 py-4"><StatusPill kind={s.kind} label={s.label} /><p className="mt-2 text-[13.5px] text-ink-2">{c.decision_reason}</p></div>
            </Section>
          )}
          {c.clarifications.length > 0 && (
            <Section title="Clarifications from the buyer">
              <ul className="divide-y divide-line">{c.clarifications.map(q => <ClarificationItem key={q.id} q={q} caseId={c.id} />)}</ul>
            </Section>
          )}
          <Section title="Documents for this tender">
            {c.missing_documents.length ? (
              <div className="px-5 py-4">
                <p className="text-[13px] text-ink-2">Mandatory items not yet on file:</p>
                <ul className="mt-2 space-y-1.5">{c.missing_documents.map(m => <li key={m} className="flex items-center gap-2 text-[13px]"><StatusText kind="not_submitted" label="Missing" className="text-[12px]" />{missingLabel(m, reqs.data)}</li>)}</ul>
                <Link to="/seller/documents" className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-navy-600 hover:underline">Upload documents <ArrowRight className="size-3.5" aria-hidden /></Link>
              </div>
            ) : <p className="px-5 py-4 text-[13px] text-ink-3">All mandatory documents are on file.</p>}
          </Section>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4 text-[12.5px] leading-relaxed text-ink-3">
          <p className="font-semibold text-ink">What happens now</p>
          <p className="mt-1">{c.next_action.label}</p>
          <p className="mt-2">If the buyer needs more information, a clarification appears here with a due date.</p>
        </div>
      </div>
    </div>
  )
}

function ClarificationItem({ q, caseId }: { q: Clarification; caseId: string }) {
  const sh = useSellerHome()
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!sh.data) return
    setBusy(true)
    setError(null)
    try {
      let docId: string | null = null
      if (file) docId = (await bidders.upload(sh.data.bidder_id, q.requested_category ?? 'OTHER', file)).id
      await clarifications.answer(q.id, text.trim(), docId)
      invalidate(`seller:case:${caseId}`)
      invalidate('home')
      invalidate('seller:')
    } catch (err) { setError(toApiError(err)) } finally { setBusy(false) }
  }
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill size="sm" kind={q.status === 'OPEN' ? 'review' : 'met'} label={q.status === 'OPEN' ? 'Awaiting your reply' : 'Answered'} />
        <span className="text-[12px] text-ink-3">Asked {formatDateTime(q.asked_at)}{q.status === 'OPEN' && q.due_at ? `, due ${relativeDays(q.due_at)}` : ''}</span>
      </div>
      <p className="mt-2 text-[13.5px] text-ink">{q.question}</p>
      {q.requested_category && <p className="mt-1 text-[12px] text-ink-3">Document requested: {categoryLabel(q.requested_category)}</p>}
      {q.status === 'ANSWERED' ? <p className="mt-2 border-l-2 border-line-strong pl-3 text-[13px] text-ink-2">{q.response_text}</p> : (
        <form onSubmit={submit} className="mt-3 space-y-3 rounded-lg border border-line bg-subtle p-3">
          <Field label="Your reply" htmlFor={`ans-${q.id}`} required><Textarea id={`ans-${q.id}`} value={text} onChange={e => setText(e.target.value)} className="bg-surface" /></Field>
          <Field label="Attach document" htmlFor={`file-${q.id}`} hint="PDF or image, up to 15 MB.">
            <input id={`file-${q.id}`} type="file" accept=".pdf,image/*" onChange={e => setFile(e.target.files?.[0] ?? null)} className="block text-[13px] file:mr-3 file:rounded-md file:border file:border-line-strong file:bg-surface file:px-3 file:py-1.5 file:text-[13px]" />
          </Field>
          <div className="flex justify-end"><Button type="submit" variant="primary" busy={busy} disabled={text.trim().length < 2} icon={<MessageSquareReply className="size-4" aria-hidden />}>Send reply</Button></div>
          {error && <p className="text-[13px] text-finding" role="alert">{error.kind === 'unavailable' ? 'Service unavailable. Your reply was not sent.' : error.message}</p>}
        </form>
      )}
    </li>
  )
}

export function SellerTendersPage() {
  const res = useResource('seller:tenders', () => portal.tenders())
  return (
    <div>
      <PageHeader eyebrow="Seller" title="Tenders" description="Tenders from Chennai Petroleum Corporation Limited open to you." />
      <Loadable resource={res} what="tenders">
        {list => list.length === 0 ? <div className="card"><EmptyState title="No tenders available" /></div> : (
          <div className="card divide-y divide-line">
            {list.map(t => (
              <Link key={t.tender_id} to={`/seller/tenders/${t.tender_id}`} className="grid items-center gap-2 px-5 py-4 hover:bg-subtle md:grid-cols-[minmax(0,1fr)_180px_160px]">
                <div><p className="text-[14px] font-semibold">{t.title}</p><p className="text-[12px] text-ink-3"><Mono className="text-[12px]">{t.tender_number}</Mono> <span aria-hidden>·</span> <Mono className="text-[12px]">{t.gem_tender_id}</Mono></p></div>
                <p className="text-[12.5px] text-ink-2"><CalendarClock className="mr-1 inline size-3.5 align-[-2px] text-ink-3" aria-hidden />Closes {formatDate(t.deadline)}</p>
                <div>{t.bid_submitted ? <StatusPill size="sm" kind="met" label="Bid submitted" /> : <StatusPill size="sm" kind="unchecked" label="Not bid" />}</div>
              </Link>
            ))}
          </div>
        )}
      </Loadable>
    </div>
  )
}

export function SellerTenderPage() {
  const { tenderId } = useParams()
  const navigate = useNavigate()
  const t = useResource(tenderId ? `tender:${tenderId}` : null, () => tenders.get(tenderId!))
  const reqs = useResource(tenderId ? `requirements:${tenderId}` : null, () => tenders.requirements(tenderId!))
  const readiness = useResource(tenderId ? `seller:readiness:${tenderId}` : null, () => portal.compliance(tenderId!))
  const sh = useSellerHome()
  const mine = sh.data?.cases.find(c => c.tender_id === tenderId)
  const docs = useResource(sh.data ? `documents:${sh.data.bidder_id}` : null, () => bidders.documents(sh.data!.bidder_id))
  if (t.error) return <ErrorState error={t.error} onRetry={t.reload} what="this tender" />
  if (!t.data) return <SkeletonRows />
  const have = new Set((docs.data ?? []).map(d => d.category))
  return (
    <div>
      <PageHeader crumbs={[{ label: 'Tenders', to: '/seller/tenders' }, { label: t.data.tender_number }]} eyebrow={t.data.gem_tender_id ?? ''} title={t.data.title}
        meta={<p className="text-[12.5px] text-ink-2">{t.data.department}, closes {formatDateTime(t.data.deadline)}</p>}
        actions={mine ? <Button onClick={() => navigate(`/seller/bids/${mine.id}`)}>View my bid</Button> : undefined} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Section title="Eligibility requirements" description="Documents you need on file before submitting.">
          <Loadable resource={reqs} what="requirements">
            {rs => (
              <ul className="divide-y divide-line">
                {rs.map(r => {
                  const onFile = r.requirement_type === 'DEBARMENT' || have.has(r.evidence_type)
                  const status = readiness.data?.requirements.find(x => x.requirement_type === r.requirement_type)
                  return (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                      <div><p className="text-[13.5px] font-medium">{r.description}</p><p className="text-[12px] text-ink-3">{r.is_mandatory ? 'Mandatory' : 'Optional'}{r.requirement_type !== 'DEBARMENT' ? `, evidence: ${categoryLabel(r.evidence_type)}` : ', checked by the buyer'}</p></div>
                      {mine && status ? <SellerReqStatus status={status.status} /> : onFile ? <StatusText kind="met" label="On file" /> : <StatusText kind="not_submitted" label={r.is_mandatory ? 'Missing' : 'Not uploaded'} />}
                    </li>
                  )
                })}
              </ul>
            )}
          </Loadable>
        </Section>
        {!mine && sh.data ? <SubmitBidForm tenderId={tenderId!} bidderId={sh.data.bidder_id} /> : (
          <div className="card p-5 text-[13px] text-ink-2"><StatusPill kind="met" label="Bid submitted" /><p className="mt-2">Your bid is with the buyer. Track it under My bids.</p></div>
        )}
      </div>
    </div>
  )
}

function SellerReqStatus({ status }: { status: string }) {
  const map: Record<string, [StatusKind, string]> = {
    VERIFIED: ['met', 'Accepted'], FAILED: ['not_met', 'Not accepted'], REQUIRES_REVIEW: ['pending', 'Under review'],
    NOT_APPLICABLE: ['not_required', 'Optional'], PENDING: ['pending', 'Pending'],
  }
  const [k, l] = map[status] ?? ['pending', 'Pending']
  return <StatusText kind={k} label={l} />
}

function SubmitBidForm({ tenderId, bidderId }: { tenderId: string; bidderId: string }) {
  const tracker = useRef(createFormTracker())
  const [form, setForm] = useState({ quoted_price: '', local_content_percent: '', declared_turnover_crore: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [done, setDone] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await bids.submit(tenderId, bidderId, {
        quoted_price: Number(form.quoted_price), local_content_percent: Number(form.local_content_percent), declared_turnover_crore: Number(form.declared_turnover_crore),
      }, tracker.current.snapshot())
      setDone(true)
      invalidate('home')
      invalidate('seller:')
    } catch (err) { setError(toApiError(err)) } finally { setBusy(false) }
  }
  if (done) return <div className="card p-5"><StatusPill kind="met" label="Bid submitted" /><p className="mt-2 text-[13px] text-ink-2">Your bid has been received and is now under evaluation.</p></div>
  return (
    <form onSubmit={submit} onPaste={tracker.current.onPaste} onKeyDown={tracker.current.onKeyDown} className="card overflow-hidden" aria-label="Submit bid">
      <div className="border-b border-line px-5 py-3.5"><h2 className="text-[14.5px] font-semibold">Submit bid</h2><p className="text-[12.5px] text-ink-3">Upload required documents first. Figures must match your certificates.</p></div>
      <div className="space-y-4 px-5 py-4">
        <Field label="Quoted price (₹)" htmlFor="qp" required><Input id="qp" type="number" min={1} value={form.quoted_price} onChange={e => setForm({ ...form, quoted_price: e.target.value })} /></Field>
        <Field label="Local content (%)" htmlFor="lc" required hint="Make in India self-certification."><Input id="lc" type="number" min={0} max={100} value={form.local_content_percent} onChange={e => setForm({ ...form, local_content_percent: e.target.value })} /></Field>
        <Field label="Average annual turnover (₹ crore)" htmlFor="to" required hint="As shown on your CA certificate."><Input id="to" type="number" min={0} step="0.01" value={form.declared_turnover_crore} onChange={e => setForm({ ...form, declared_turnover_crore: e.target.value })} /></Field>
      </div>
      <div className="flex justify-end border-t border-line bg-subtle px-5 py-3">
        <Button type="submit" variant="primary" busy={busy} disabled={!form.quoted_price || !form.local_content_percent || !form.declared_turnover_crore}>Submit bid</Button>
      </div>
      {error && <p className="border-t border-finding-line bg-finding-bg px-5 py-2.5 text-[13px] text-finding" role="alert">{error.kind === 'unavailable' ? 'Service unavailable. Your bid was not submitted.' : error.message}</p>}
    </form>
  )
}

export function SellerDocumentsPage() {
  const sh = useSellerHome()
  const docs = useResource(sh.data ? `documents:${sh.data.bidder_id}` : null, () => bidders.documents(sh.data!.bidder_id))
  const [category, setCategory] = useState('GST')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const expiring = useMemo(() => new Map((sh.data?.expiring_documents ?? []).map(d => [d.document_id, d])), [sh.data])
  async function upload(e: FormEvent) {
    e.preventDefault()
    if (!file || !sh.data) return
    setBusy(true)
    setError(null)
    setOk(null)
    try {
      await bidders.upload(sh.data.bidder_id, category, file)
      setOk(`${file.name} uploaded.`)
      setFile(null)
      invalidate(`documents:${sh.data.bidder_id}`)
      invalidate('home')
    } catch (err) { setError(toApiError(err)) } finally { setBusy(false) }
  }
  if (sh.error) return <ErrorState error={sh.error} onRetry={sh.reload} what="your documents" />
  return (
    <div>
      <PageHeader eyebrow="Seller" title="Documents" description="Certificates on file for your company. They are reused across bids." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Loadable resource={docs} what="your documents" skeleton={<SkeletonRows />}>
          {list => list.length === 0 ? <div className="card"><EmptyState title="No documents uploaded" /></div> : (
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[640px] text-[13px]">
                <thead className="bg-subtle text-left text-[12px] uppercase tracking-[0.05em] text-ink-3"><tr><th className="px-5 py-2.5 font-medium">Document</th><th className="px-3 py-2.5 font-medium">File</th><th className="px-3 py-2.5 font-medium">Uploaded</th><th className="px-5 py-2.5 font-medium">Validity</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {list.map(d => {
                    const x = expiring.get(d.id)
                    return (
                      <tr key={d.id}>
                        <td className="px-5 py-2.5 font-medium">{categoryLabel(d.category)}</td>
                        <td className="px-3 py-2.5"><Mono className="text-[12px]">{d.original_filename}</Mono></td>
                        <td className="px-3 py-2.5 text-ink-2">{formatDate(d.uploaded_at)}</td>
                        <td className="px-5 py-2.5">{x ? <StatusText kind={x.expired ? 'not_met' : 'review'} label={`${x.expired ? 'Expired' : 'Expires'} ${formatDate(x.valid_until)}`} /> : <span className="text-ink-3">On file</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Loadable>
        <form onSubmit={upload} className="card h-fit overflow-hidden" aria-label="Upload document">
          <div className="border-b border-line px-5 py-3.5"><h2 className="flex items-center gap-2 text-[14.5px] font-semibold"><FileUp className="size-4" aria-hidden />Upload a document</h2></div>
          <div className="space-y-4 px-5 py-4">
            <Field label="Document type" htmlFor="cat"><Select id="cat" value={category} onChange={e => setCategory(e.target.value)}>{UPLOAD_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c] ?? c}</option>)}</Select></Field>
            <Field label="File" htmlFor="file" hint="PDF or image, up to 15 MB. Upload the certificate as issued; do not edit it.">
              <input id="file" type="file" accept=".pdf,image/*" onChange={e => setFile(e.target.files?.[0] ?? null)} className="block w-full text-[13px] file:mr-3 file:rounded-md file:border file:border-line-strong file:bg-surface file:px-3 file:py-1.5 file:text-[13px]" />
            </Field>
          </div>
          <div className="flex items-center justify-end gap-3 border-t border-line bg-subtle px-5 py-3">
            {ok && <span className="mr-auto text-[12.5px] text-pass">{ok}</span>}
            <Button type="submit" variant="primary" busy={busy} disabled={!file} icon={<Upload className="size-4" aria-hidden />}>Upload</Button>
          </div>
          {error && <p className="border-t border-finding-line bg-finding-bg px-5 py-2.5 text-[13px] text-finding" role="alert">{error.kind === 'unavailable' ? 'Service unavailable. The file was not uploaded.' : error.message}</p>}
        </form>
      </div>
    </div>
  )
}

export function SellerNotificationsPage() {
  const res = useResource('seller:notifications', () => portal.notifications())
  async function read(id: string) { await portal.markRead(id).catch(() => undefined); invalidate('seller:notifications') }
  return (
    <div>
      <PageHeader eyebrow="Seller" title="Notifications" />
      <Loadable resource={res} what="notifications">
        {list => list.length === 0 ? <div className="card"><EmptyState icon={<Bell className="size-4" />} title="No notifications" /></div> : (
          <ul className="card divide-y divide-line">
            {list.map(n => (
              <li key={n.id} className={cn('flex items-start justify-between gap-3 px-5 py-3.5', !n.is_read && 'bg-navy-50/40')}>
                <div><p className="text-[13.5px] font-medium">{n.title}</p><p className="mt-0.5 text-[13px] text-ink-2">{n.message}</p><p className="mt-1 text-[12px] text-ink-3">{formatDateTime(n.created_at)}</p></div>
                {!n.is_read && <Button size="sm" variant="ghost" onClick={() => read(n.id)}>Mark as read</Button>}
              </li>
            ))}
          </ul>
        )}
      </Loadable>
    </div>
  )
}

export function SellerProfilePage() {
  const res = useResource('seller:profile', () => portal.profile())
  return (
    <div>
      <PageHeader eyebrow="Seller" title="Company profile" description="Official identifiers can only be changed through a correction request, which the buyer reviews." />
      <Loadable resource={res} what="your profile">
        {p => (
          <Section title={p.company_name}>
            <dl className="grid gap-x-8 gap-y-3 px-5 py-4 text-[13px] sm:grid-cols-2">
              {([
                ['Legal name', p.legal_name], ['GSTIN', p.gstin], ['PAN', p.pan_number], ['CIN', p.cin], ['Udyam', p.udyam_number],
                ['Incorporated', p.incorporation_date ? formatDate(p.incorporation_date) : null], ['Registered address', p.registered_address],
                ['Contact email', p.contact_email], ['Contact phone', p.contact_phone],
                ['Directors', p.directors?.map(d => `${d.name} (DIN ${d.din})`).join(', ')],
              ] as [string, string | null | undefined][]).map(([k, v]) => (
                <div key={k}><dt className="text-[12px] text-ink-3">{k}</dt><dd className={cn('mt-0.5', ['GSTIN', 'PAN', 'CIN', 'Udyam'].includes(k) && 'font-mono text-[12.5px]')}>{v || <span className="text-ink-4">Not recorded</span>}</dd></div>
              ))}
            </dl>
          </Section>
        )}
      </Loadable>
    </div>
  )
}
