import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUp, ChevronRight, CornerDownRight, RotateCcw } from 'lucide-react'
import { toApiError, type ApiError } from '@/app/lib/api'
import { cn } from '@/app/lib/cn'
import { findingTitle, readableRationale } from '@/app/lib/labels'
import { findingDocumentId, findingPins } from '@/app/lib/bidmarkStatus'
import { useResource } from '@/app/lib/useResource'
import { cases, copilot, type CopilotAnswer, type Finding } from '@/app/services/bidmark'
import { Drawer, Skeleton } from '@/app/components/ui/primitives'
import { SeverityTag } from '@/app/components/bidmark/Status'
import { BidmarkGlyph } from '@/app/components/gov/Brand'

export interface CopilotSubject {
  caseId: string
  bidderId: string
  tenderId: string
  bidderName: string
  tenderNumber?: string
  findings: Finding[]
}

interface CopilotValue {
  available: boolean
  open: () => void
  setSubject: (s: CopilotSubject | null) => void
}

const CopilotContext = createContext<CopilotValue>({ available: false, open: () => {}, setSubject: () => {} })

export const useCopilot = () => useContext(CopilotContext)

// The page in view registers the case it shows; the panel answers about that case.
export function useCopilotSubject(subject: CopilotSubject | null) {
  const { setSubject } = useCopilot()
  const key = subject ? `${subject.caseId}:${subject.findings.length}:${subject.bidderName}:${subject.tenderNumber ?? ''}` : ''
  useEffect(() => {
    setSubject(subject)
    return () => setSubject(null)
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
}

export function CopilotProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [pageSubject, setPageSubject] = useState<CopilotSubject | null>(null)
  const value = useMemo<CopilotValue>(() => ({ available: enabled, open: () => setOpen(true), setSubject: setPageSubject }), [enabled])
  return (
    <CopilotContext.Provider value={value}>
      {children}
      {enabled && <AskBidmarkPanel open={open} onClose={() => setOpen(false)} pageSubject={pageSubject} />}
    </CopilotContext.Provider>
  )
}

const SUGGESTIONS = [
  'Why does this bidder require review?',
  'What compliance checks failed?',
  'Show evidence for the OEM finding.',
  'Why are these bidders linked?',
  'Which mandatory checks are pending?',
  'Summarise this bidder for decision review.',
]

interface Turn { question: string; answer?: CopilotAnswer; error?: ApiError }

function AskBidmarkPanel({ open, onClose, pageSubject }: { open: boolean; onClose: () => void; pageSubject: CopilotSubject | null }) {
  const [chosen, setChosen] = useState<CopilotSubject | null>(null)
  const subject = pageSubject ?? chosen
  const status = useResource(open ? 'copilot-status' : null, () => copilot.status())
  const navigate = useNavigate()

  function cite(f: Finding) {
    if (!subject) return
    onClose()
    const base = `/officer/cases/${subject.caseId}`
    const doc = findingDocumentId(f) ?? findingPins(f)[0]?.document_id
    if (doc) navigate(`${base}?tab=documents&finding=${encodeURIComponent(f.id)}&doc=${doc}`)
    else if (f.source === 'CARTEL') navigate(`${base}?tab=connections`)
    else navigate(`${base}?tab=findings&finding=${encodeURIComponent(f.id)}`)
  }

  return (
    <Drawer open={open} onClose={onClose} width="w-[min(460px,100vw)]"
      title={<span className="flex items-center gap-2"><BidmarkGlyph className="size-5" /> Ask Bidmark</span>}
      subtitle={subject ? <>About <span className="text-ink-2">{subject.bidderName}</span>{subject.tenderNumber ? `, ${subject.tenderNumber}` : ''}</> : 'Choose the bid you want to ask about'}>
      {subject
        ? <Conversation key={subject.caseId} subject={subject} onCite={cite} canChange={!pageSubject} onChange={() => setChosen(null)} mode={status.data?.mode} model={status.data?.model} />
        : <CasePicker onPick={setChosen} />}
    </Drawer>
  )
}

function CasePicker({ onPick }: { onPick: (s: CopilotSubject) => void }) {
  const queue = useResource('queue:all', () => cases.queue())
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<ApiError | null>(null)

  async function pick(caseId: string, bidderName: string, tenderNumber: string) {
    setLoading(caseId)
    setError(null)
    try {
      const c = await cases.get(caseId)
      onPick({ caseId, bidderId: c.bidder_id, tenderId: c.tender_id, bidderName, tenderNumber, findings: c.findings })
    } catch (e) {
      setError(toApiError(e))
    } finally {
      setLoading(null)
    }
  }

  if (queue.error) return <p className="text-[14px] text-ink-2" role="alert">Bids could not be loaded. {queue.error.kind === 'unavailable' ? 'The verification service is unavailable.' : queue.error.message}</p>
  if (!queue.data) return <div className="space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-12" />)}</div>
  const rows = queue.data.filter(r => r.stage !== 'DRAFT')
  return (
    <div>
      <p className="mb-3 text-[13.5px] text-ink-3">Answers are grounded in one bid at a time. Open a bid, or choose one here.</p>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {rows.map(r => (
          <li key={r.case_id}>
            <button onClick={() => void pick(r.case_id, r.bidder_name, r.tender_number)} disabled={!!loading}
              className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-subtle disabled:opacity-60">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-ink">{r.bidder_name}</span>
                <span className="block text-[12.5px] text-ink-3">{r.tender_number}</span>
              </span>
              {loading === r.case_id ? <span className="text-[12.5px] text-ink-3">Opening</span> : <ChevronRight className="size-4 text-ink-4" aria-hidden />}
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="mt-3 text-[13px] text-finding" role="alert">{error.message}</p>}
    </div>
  )
}

function Conversation({ subject, onCite, canChange, onChange, mode, model }: {
  subject: CopilotSubject; onCite: (f: Finding) => void; canChange: boolean; onChange: () => void; mode?: 'llm' | 'templated'; model?: string | null
}) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' }) }, [turns])

  const ask = useCallback(async (question: string) => {
    const text = question.trim()
    if (!text || busy) return
    setQ('')
    setBusy(true)
    setTurns(t => [...t, { question: text }])
    try {
      const answer = await copilot.ask(subject.bidderId, subject.tenderId, text)
      setTurns(t => t.map((x, i) => (i === t.length - 1 ? { ...x, answer } : x)))
    } catch (e) {
      setTurns(t => t.map((x, i) => (i === t.length - 1 ? { ...x, error: toApiError(e) } : x)))
    } finally {
      setBusy(false)
    }
  }, [busy, subject.bidderId, subject.tenderId])

  function submit(e: FormEvent) {
    e.preventDefault()
    void ask(q)
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1 space-y-5">
        {canChange && (
          <button onClick={onChange} className="inline-flex items-center gap-1.5 text-[13px] text-navy-600 hover:underline">
            <RotateCcw className="size-3.5" aria-hidden /> Choose a different bid
          </button>
        )}
        {turns.length === 0 && (
          <div>
            <p className="eyebrow mb-2">Suggested questions</p>
            <ul className="space-y-1.5">
              {SUGGESTIONS.map(s => (
                <li key={s}>
                  <button onClick={() => void ask(s)} className="flex w-full items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-left text-[14px] text-ink-2 hover:border-navy-600 hover:text-ink">
                    <CornerDownRight className="size-3.5 shrink-0 text-ink-4" aria-hidden />{s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className="space-y-2 animate-rise-in">
            <p className="ml-auto w-fit max-w-[85%] rounded-lg rounded-br-sm bg-navy px-3 py-2 text-[14px] text-white">{t.question}</p>
            {t.answer ? <AnswerBody answer={t.answer} findings={subject.findings} onCite={onCite} />
              : t.error ? <AnswerError error={t.error} />
                : (
                  <p className="flex items-center gap-2 text-[13px] text-ink-3" role="status">
                    <span className="flex gap-1" aria-hidden>{[0, 1, 2].map(d => <span key={d} className="size-1.5 animate-pulse rounded-full bg-ink-4" style={{ animationDelay: `${d * 150}ms` }} />)}</span>
                    Reading the recorded findings
                  </p>
                )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-0 -mx-5 -mb-4 mt-4 border-t border-line bg-surface px-5 pb-4 pt-3">
        <form onSubmit={submit} className="flex items-end gap-2">
          <label htmlFor="ask-bidmark" className="sr-only">Ask about this bid</label>
          <textarea id="ask-bidmark" value={q} onChange={e => setQ(e.target.value)} rows={1}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(q) } }}
            placeholder="Ask about this bid" className="max-h-32 min-h-10 flex-1 resize-none rounded-md border border-line-strong bg-surface px-3 py-2 text-[14px] focus:border-navy-600 focus:outline-none focus:ring-3 focus:ring-navy-100" />
          <button type="submit" disabled={!q.trim() || busy} aria-label="Ask"
            className="grid size-10 shrink-0 place-items-center rounded-md bg-navy text-white hover:bg-navy-700 disabled:opacity-40">
            <ArrowUp className="size-4" />
          </button>
        </form>
        <p className="mt-2 text-[12px] leading-snug text-ink-3">
          {mode === 'llm' ? `Answers are written by ${model ?? 'the configured model'} from findings recorded on this bid, with citations.`
            : mode === 'templated' ? 'Answers are assembled from findings recorded on this bid. No language model is configured.'
              : 'Answers cite findings recorded on this bid.'} Decision support only. Questions are logged in the audit trail.
        </p>
      </div>
    </div>
  )
}

function AnswerError({ error }: { error: ApiError }) {
  const down = error.kind === 'unavailable'
  return (
    <div className="rounded-lg border border-dashed border-line-strong bg-subtle px-3.5 py-3 text-[14px] text-ink-2" role="alert">
      <p className="font-medium text-ink">{down ? 'Bidmark Assistant is temporarily unavailable.' : error.message}</p>
      {down && <p className="mt-1 text-[13px] text-ink-3">No answer was produced. Verification, findings and decisions continue to work without it.</p>}
    </div>
  )
}

function AnswerBody({ answer, findings, onCite }: { answer: CopilotAnswer; findings: Finding[]; onCite: (f: Finding) => void }) {
  const byId = new Map(findings.map(f => [f.id, f]))
  const order: string[] = []
  const parts: ReactNode[] = []
  const re = /\[([^\]]+)\]/g
  let last = 0
  let m: RegExpExecArray | null
  let n = 0
  while ((m = re.exec(answer.answer))) {
    parts.push(readableRationale(answer.answer.slice(last, m.index)))
    const f = byId.get(m[1])
    if (f) {
      if (!order.includes(f.id)) order.push(f.id)
      const num = order.indexOf(f.id) + 1
      parts.push(
        <button key={`c${n++}`} onClick={() => onCite(f)} title={findingTitle(f.code, f.title)}
          className="mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded bg-navy-50 px-1 align-[1px] text-[12px] font-semibold text-navy-600 ring-1 ring-navy-100 hover:bg-navy-100">
          {num}
        </button>,
      )
    }
    last = re.lastIndex
  }
  parts.push(readableRationale(answer.answer.slice(last)))
  const cited = answer.evidence.map(id => byId.get(id)).filter((f): f is Finding => !!f)
  return (
    <div className="rounded-lg border border-line bg-surface">
      <p className="whitespace-pre-line px-3.5 py-3 text-[14px] leading-relaxed text-ink">{parts}</p>
      {cited.length > 0 && (
        <div className="border-t border-line px-3.5 py-2.5">
          <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-3">Evidence cited</p>
          <ul className="space-y-0.5">
            {cited.map(f => (
              <li key={f.id}>
                <button onClick={() => onCite(f)} className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-sunken">
                  <span className="tnum w-4 text-[12px] font-semibold text-navy-600">{order.indexOf(f.id) + 1 || ''}</span>
                  <SeverityTag severity={f.severity} />
                  <span className="min-w-0 flex-1 truncate text-[13px]">{findingTitle(f.code, f.title)}</span>
                  <span className={cn('text-[12px] text-navy-600')}>Open</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
