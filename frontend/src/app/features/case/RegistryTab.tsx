import type { ReactNode } from 'react'
import { FlaskConical } from 'lucide-react'
import { humanise } from '@/app/lib/format'
import { categoryLabel } from '@/app/lib/labels'
import type { Resource } from '@/app/lib/useResource'
import type { Bidder, BidderEvaluation, CaseDetail, Finding, RegistryResult, Role } from '@/app/services/bidmark'
import { Section } from '@/app/features/shell/AppShell'
import { StatusPill, StatusText, type StatusKind } from '@/app/components/bidmark/Status'
import { Mono, SkeletonRows } from '@/app/components/ui/primitives'
import { ErrorState } from '@/app/components/ui/states'
import { canEvaluate } from './data'

const IDENTIFIER_CODES: Record<string, string[]> = {
  GSTIN: ['GSTIN_CHECKSUM', 'GSTIN_PAN_MISMATCH', 'GSTIN_STATE_MISMATCH'],
  PAN: ['PAN_HOLDER_TYPE', 'PAN_NAME_INITIAL', 'GSTIN_PAN_MISMATCH'],
  CIN: ['CIN_YEAR_VS_INCORPORATION', 'CIN_STATE_MISMATCH', 'CIN_CLASS_MISMATCH'],
}

const IDENTIFIER_CHECKS: Record<string, string> = {
  GSTIN: 'Check digit (mod 36), embedded PAN, state code',
  PAN: 'Holder type (4th character), name initial (5th character)',
  CIN: 'Listing status, industry code, state, year of incorporation, class',
  Udyam: 'Format and registered name',
}

function registryKind(status: string): { kind: StatusKind; label: string } {
  switch (status) {
    case 'VERIFIED': return { kind: 'verified', label: 'Verified' }
    case 'MATCH': return { kind: 'matched', label: 'Matched' }
    case 'FAILED': return { kind: 'mismatch', label: 'Not matched' }
    case 'EXPIRED': return { kind: 'not_met', label: 'Expired' }
    case 'REQUIRES_REVIEW':
    case 'MISSING_INFORMATION': return { kind: 'review', label: 'Needs review' }
    case 'PENDING': return { kind: 'pending', label: 'Pending' }
    default: return { kind: 'unchecked', label: 'Not checked' }
  }
}

function sourceLabel(r: RegistryResult): { kind: StatusKind; label: string } {
  const lookup = r.details?.lookup as string | undefined
  if (lookup === 'SANDBOX_REGISTRY') return { kind: 'sandbox', label: 'Sandbox registry' }
  if (r.is_mock) return { kind: 'sandbox', label: 'Sandbox gateway' }
  return { kind: 'verified', label: 'Registry response' }
}

export function RegistryTab({ role, c, ctx }: {
  role: Role
  c: CaseDetail
  ctx: { bidder: Resource<Bidder>; evaluation: Resource<BidderEvaluation> }
}) {
  const bidder = ctx.bidder.data
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2.5 rounded-lg border border-dashed border-line-strong bg-subtle px-4 py-3 text-[12.5px] text-ink-2">
        <FlaskConical className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
        <p>
          Registry lookups in this environment answer from a <strong className="font-semibold">sandbox dataset</strong> with a sandbox gateway behind it.
          No live GSTN, MCA21, EPFO or Udyam API is called. Structural checks on identifiers run offline and do not depend on portal access.
        </p>
      </div>

      <Section title="Statutory identifiers" description="Checked offline from the structure of the number itself, before any registry is asked.">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-subtle text-left text-[12px] uppercase tracking-[0.05em] text-ink-3">
              <tr><th className="px-5 py-2 font-medium">Identifier</th><th className="px-3 py-2 font-medium">Value on profile</th><th className="px-3 py-2 font-medium">What is checked</th><th className="px-5 py-2 font-medium">Result</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[
                ['GSTIN', bidder?.gstin],
                ['PAN', bidder?.pan_number],
                ['CIN', bidder?.cin],
                ['Udyam', bidder?.udyam_number],
              ].map(([id, value]) => {
                const hits = c.findings.filter(f => (IDENTIFIER_CODES[id as string] ?? []).includes(f.code))
                return (
                  <tr key={id as string} className="align-top">
                    <td className="px-5 py-2.5 font-medium">{id}</td>
                    <td className="px-3 py-2.5">{value ? <Mono>{value}</Mono> : <span className="text-ink-3">Not declared</span>}</td>
                    <td className="px-3 py-2.5 text-ink-3">{IDENTIFIER_CHECKS[id as string]}</td>
                    <td className="px-5 py-2.5">
                      {!value ? <StatusText kind="unchecked" label="Not checked" />
                        : hits.length ? <IdentifierHits hits={hits} />
                          : id === 'Udyam' ? <StatusText kind="unchecked" label="No structural check" />
                            : <StatusText kind="pass" label="No issue raised" />}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {!canEvaluate(role) ? (
        <div className="card p-5 text-[13px] text-ink-3">Registry lookups and requirement evaluation are shown to the Procurement Officer and Administrator. The Auditor sees the resulting findings, rulings and decision.</div>
      ) : ctx.evaluation.error ? (
        <ErrorState error={ctx.evaluation.error} onRetry={ctx.evaluation.reload} what="registry and requirement checks" />
      ) : !ctx.evaluation.data ? (
        <SkeletonRows rows={6} />
      ) : (
        <EvaluationSections ev={ctx.evaluation.data} />
      )}
    </div>
  )
}

function IdentifierHits({ hits }: { hits: Finding[] }) {
  return (
    <div className="space-y-1">
      {hits.map(f => (
        <div key={f.id}>
          <StatusText kind={f.severity === 'HIGH' ? 'finding' : 'review'} label="Finding" />
          <p className="mt-0.5 max-w-sm text-[12px] text-ink-2">{f.detail}</p>
        </div>
      ))}
    </div>
  )
}

function EvaluationSections({ ev }: { ev: BidderEvaluation }) {
  const reqStatus = (s: string) => {
    switch (s) {
      case 'VERIFIED': return { kind: 'met' as StatusKind, label: 'Met' }
      case 'FAILED': return { kind: 'not_met' as StatusKind, label: 'Not met' }
      case 'REQUIRES_REVIEW': return { kind: 'review' as StatusKind, label: 'Review' }
      case 'NOT_APPLICABLE': return { kind: 'not_required' as StatusKind, label: 'Optional, not submitted' }
      default: return { kind: 'pending' as StatusKind, label: 'Pending' }
    }
  }
  return (
    <>
      <Section title="Registry lookups" description="What the registry adapter returned for each submitted certificate.">
        {ev.government_verification.length ? (
          <ul className="divide-y divide-line">
            {ev.government_verification.map((r, i) => {
              const k = registryKind(r.status)
              const src = sourceLabel(r)
              const details = Object.entries(r.details ?? {}).filter(([key]) => !['lookup', 'outcome'].includes(key))
              return (
                <li key={i} className="grid gap-2 px-5 py-3 md:grid-cols-[200px_140px_minmax(0,1fr)]">
                  <div>
                    <p className="text-[13px] font-medium">{categoryLabel(r.verification_type)}</p>
                    {r.reference_id && <Mono className="text-[12px] text-ink-3">{r.reference_id}</Mono>}
                  </div>
                  <div className="flex flex-col items-start gap-1">
                    <StatusPill kind={k.kind} label={k.label} size="sm" />
                    <StatusPill kind={src.kind} label={src.label} size="sm" />
                  </div>
                  <div className="text-[12.5px] text-ink-2">
                    {details.length ? (
                      <dl className="grid grid-cols-[130px_minmax(0,1fr)] gap-x-2 gap-y-0.5">
                        {details.map(([key, v]) => (
                          <DetailRow key={key} label={humanise(key)}>{Array.isArray(v) ? v.join(', ') : String(v)}</DetailRow>
                        ))}
                      </dl>
                    ) : <span className="text-ink-3">Document-level verification. No registry record fields returned.</span>}
                  </div>
                </li>
              )
            })}
          </ul>
        ) : <p className="px-5 py-4 text-[13px] text-ink-3">No registry lookups were run for this bid.</p>}
      </Section>

      <Section title="Tender requirements" description="Evaluated against the documents that were read, not the figures typed into the bid form.">
        <ul className="divide-y divide-line">
          {ev.compliance_report?.requirement_evaluations.map(r => {
            const k = reqStatus(r.status)
            return (
              <li key={r.requirement_type} className="grid gap-2 px-5 py-3 md:grid-cols-[200px_160px_minmax(0,1fr)]">
                <p className="text-[13px] font-medium">{categoryLabel(r.requirement_type)}</p>
                <div><StatusPill kind={k.kind} label={k.label} size="sm" /></div>
                <div className="text-[12.5px] text-ink-2">
                  <p>{r.explanation}</p>
                  {r.evidence.filter(Boolean).map((e, i) => <p key={i} className="mt-0.5 text-ink-3">{e.replace('MOCK_GOVERNMENT_API (mock)', 'sandbox registry').replace(/\(mock registry\)/g, '(sandbox registry)')}</p>)}
                </div>
              </li>
            )
          }) ?? <li className="px-5 py-4 text-[13px] text-ink-3">No requirement evaluation on record.</li>}
        </ul>
        <p className="border-t border-line bg-subtle px-5 py-2.5 text-[12px] text-ink-3">
          A requirement marked Met can still carry a document finding. Check the Findings tab before relying on it.
        </p>
      </Section>

      <Section title="Cross-document checks" description="The same fact compared across the profile, the bid and each certificate.">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-subtle text-left text-[12px] uppercase tracking-[0.05em] text-ink-3">
              <tr><th className="px-5 py-2 font-medium">Fact</th><th className="px-3 py-2 font-medium">Compared across</th><th className="px-3 py-2 font-medium">Values</th><th className="px-5 py-2 font-medium">Result</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ev.cross_document_checks.map((x, i) => {
                const k = x.status === 'MATCH' ? { kind: 'matched' as StatusKind, label: 'Matched' }
                  : x.status === 'MISMATCH' ? { kind: 'mismatch' as StatusKind, label: 'Mismatch' }
                    : x.requires_review ? { kind: 'review' as StatusKind, label: 'Review' } : { kind: 'unchecked' as StatusKind, label: humanise(x.status) }
                const unique = [...new Set(x.values.map(v => String(v)))]
                return (
                  <tr key={i} className="align-top">
                    <td className="px-5 py-2.5 font-medium">{humanise(x.field)}</td>
                    <td className="px-3 py-2.5 text-ink-3">{x.sources.map(s => categoryLabel(s === 'BIDDER_PROFILE' ? 'Profile' : s === 'BID_SUBMISSION' ? 'Bid form' : s)).join(', ')}</td>
                    <td className="px-3 py-2.5 text-ink-2">{unique.length === 1 ? unique[0] : unique.join(' / ')}</td>
                    <td className="px-5 py-2.5"><StatusText kind={k.kind} label={k.label} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  )
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (<><dt className="text-ink-3">{label}</dt><dd className="min-w-0 break-words">{children}</dd></>)
}
