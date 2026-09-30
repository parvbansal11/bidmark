import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Download, FileText, FlaskConical, Maximize2, ShieldCheck, ZoomIn, ZoomOut } from 'lucide-react'
import { cn } from '@/app/lib/cn'
import { formatDateTime, shortHash } from '@/app/lib/format'
import { CHECK_LABEL, categoryLabel, findingTitle } from '@/app/lib/labels'
import { findingDocumentId, findingPins, sortFindings } from '@/app/lib/bidmarkStatus'
import { useResource } from '@/app/lib/useResource'
import { evidence, type CaseDetail, type DocumentEvidence, type DocumentRecord, type Finding } from '@/app/services/bidmark'
import { EvidenceCrop, EvidencePage, type PageBox } from '@/app/components/bidmark/EvidencePage'
import { DispositionControl, findingValues, RuleRecord, type FindingContext } from '@/app/components/bidmark/FindingCard'
import { SeverityTag, StatusText, type StatusKind } from '@/app/components/bidmark/Status'
import { Button, Mono, Skeleton } from '@/app/components/ui/primitives'
import { EmptyState, ErrorState } from '@/app/components/ui/states'

const CHECK_KIND: Record<string, { kind: StatusKind; label: string }> = {
  PASS: { kind: 'pass', label: 'Passed' },
  FLAG: { kind: 'finding', label: 'Flagged' },
  UNMEASURED: { kind: 'unchecked', label: 'Not measured' },
}

export function ForensicsTab({ caseDetail, documents, ctx, canRule, selectedFindingId, selectedDocId, onSelect }: {
  caseDetail: CaseDetail
  documents: DocumentRecord[]
  ctx: FindingContext
  canRule: boolean
  selectedFindingId: string | null
  selectedDocId: string | null
  onSelect: (sel: { finding?: string | null; doc?: string | null }) => void
}) {
  const findingsByDoc = useMemo(() => {
    const map = new Map<string, Finding[]>()
    for (const f of caseDetail.findings) {
      const ids = new Set([findingDocumentId(f), ...findingPins(f).map(p => p.document_id)].filter(Boolean) as string[])
      for (const id of ids) map.set(id, [...(map.get(id) ?? []), f])
    }
    return map
  }, [caseDetail.findings])

  const orderedDocs = useMemo(() => [...documents].sort((a, b) => (findingsByDoc.get(b.id)?.length ?? 0) - (findingsByDoc.get(a.id)?.length ?? 0)), [documents, findingsByDoc])
  // With nothing chosen, open on the most serious finding so the evidence is on screen at once.
  const firstFinding = !selectedFindingId && !selectedDocId && orderedDocs[0] ? sortFindings(findingsByDoc.get(orderedDocs[0].id) ?? [])[0] ?? null : null
  const selectedFinding = caseDetail.findings.find(f => f.id === selectedFindingId) ?? firstFinding
  const docId = selectedDocId ?? (selectedFinding && findingDocumentId(selectedFinding)) ?? orderedDocs[0]?.id ?? null

  if (!documents.length) {
    return <EmptyState title="No documents on file" body="This bidder has not uploaded any documents for evaluation." icon={<FileText className="size-4" />} />
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_360px] lg:grid-cols-[200px_minmax(0,1fr)]">
      <nav aria-label="Documents" className="card h-fit overflow-hidden lg:sticky lg:top-[76px]">
        <p className="eyebrow border-b border-line px-3.5 py-2.5">Documents ({documents.length})</p>
        <ul className="max-h-[70vh] overflow-y-auto scroll-thin p-1.5">
          {orderedDocs.map(d => {
            const fs = findingsByDoc.get(d.id) ?? []
            const high = fs.filter(f => f.severity === 'HIGH').length
            const active = d.id === docId
            return (
              <li key={d.id}>
                <button onClick={() => onSelect({ doc: d.id, finding: null })}
                  className={cn('w-full rounded-md px-2.5 py-2 text-left transition-colors', active ? 'bg-navy-50 ring-1 ring-navy-100' : 'hover:bg-sunken')}
                  aria-current={active || undefined}>
                  <span className="flex items-center justify-between gap-2">
                    <span className={cn('truncate text-[12.5px] font-medium', active ? 'text-navy' : 'text-ink')}>{categoryLabel(d.category)}</span>
                    {high > 0 ? <span className="tnum rounded-full bg-finding px-1.5 text-[12px] font-bold leading-4 text-white">{high}</span>
                      : fs.length > 0 ? <span className="tnum rounded-full bg-review-bg px-1.5 text-[12px] font-semibold leading-4 text-review">{fs.length}</span> : null}
                  </span>
                  <span className="mt-0.5 block truncate font-mono text-[12px] text-ink-3">{d.original_filename}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      {docId ? (
        <DocumentWorkspace key={docId} documentId={docId} caseDetail={caseDetail} docFindings={findingsByDoc.get(docId) ?? []}
          selectedFinding={selectedFinding && (findingsByDoc.get(docId) ?? []).includes(selectedFinding) ? selectedFinding : null}
          ctx={ctx} canRule={canRule} onSelectFinding={id => onSelect({ doc: docId, finding: id })}
          record={documents.find(d => d.id === docId)} />
      ) : null}
    </div>
  )
}

function DocumentWorkspace({ documentId, caseDetail, docFindings, selectedFinding, ctx, canRule, onSelectFinding, record }: {
  documentId: string
  caseDetail: CaseDetail
  docFindings: Finding[]
  selectedFinding: Finding | null
  ctx: FindingContext
  canRule: boolean
  onSelectFinding: (id: string | null) => void
  record?: DocumentRecord
}) {
  const ev = useResource(`evidence:${documentId}`, () => evidence.document(documentId))
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [field, setField] = useState<string | null>(null)
  const [technical, setTechnical] = useState(false)

  const pinForSelected = selectedFinding ? findingPins(selectedFinding).find(p => p.document_id === documentId) : undefined
  useEffect(() => {
    if (pinForSelected) setPage(pinForSelected.page)
  }, [pinForSelected?.page, selectedFinding?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (ev.error) return <div className="xl:col-span-2"><ErrorState error={ev.error} onRetry={ev.reload} what="the document evidence" /></div>
  if (!ev.data) {
    return (
      <>
        <div className="card p-6"><Skeleton className="mx-auto aspect-[1/1.41] h-auto w-full max-w-[520px]" /></div>
        <div className="card hidden space-y-3 p-4 xl:block"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-24" /><Skeleton className="h-40" /></div>
      </>
    )
  }
  const data = ev.data
  const pages = Math.max(1, data.pages)

  const boxes: PageBox[] = []
  for (const f of docFindings) {
    for (const [i, p] of findingPins(f).entries()) {
      if (p.document_id === documentId && p.page === page) {
        boxes.push({ id: `${f.id}#${i}`, bbox: p.bbox, tone: f.severity === 'HIGH' ? 'finding' : 'review', label: findingTitle(f.code, f.title), active: selectedFinding?.id === f.id })
      }
    }
  }
  const fieldInfo = field ? data.fields[field] : null
  if (fieldInfo?.bbox && fieldInfo.page === page) {
    boxes.push({ id: `field:${field}`, bbox: fieldInfo.bbox, tone: 'field', label: fieldInfo.label ?? field ?? undefined, active: !selectedFinding })
  }

  async function download() {
    const blob = await evidence.file(documentId)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = data.document.filename
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
  }

  return (
    <>
      <div className="card min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3.5 py-2">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold">{categoryLabel(data.document.category)}</p>
            <p className="truncate font-mono text-[12px] text-ink-3">{data.document.filename}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="size-4" /></Button>
            <span className="tnum min-w-16 text-center text-[12px] text-ink-2">Page {page} of {pages}</span>
            <Button size="sm" variant="ghost" aria-label="Next page" disabled={page >= pages} onClick={() => setPage(p => p + 1)}><ChevronRight className="size-4" /></Button>
            <span className="mx-1 h-5 w-px bg-line" aria-hidden />
            <Button size="sm" variant="ghost" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom(z => Math.max(1, z - 0.5))}><ZoomOut className="size-4" /></Button>
            <Button size="sm" variant="ghost" aria-label="Zoom in" disabled={zoom >= 2.5} onClick={() => setZoom(z => Math.min(2.5, z + 0.5))}><ZoomIn className="size-4" /></Button>
            <Button size="sm" variant="ghost" aria-label="Fit page" disabled={zoom === 1} onClick={() => setZoom(1)}><Maximize2 className="size-3.5" /></Button>
            <Button size="sm" variant="ghost" aria-label="Download original file" onClick={download}><Download className="size-3.5" /></Button>
          </div>
        </div>
        {data.simulated && (
          <div className="flex items-start gap-2 border-b border-review-line bg-review-bg px-3.5 py-2 text-[12.5px] text-review">
            <FlaskConical className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            The file had no readable text. Fields shown were filled from the bidder profile and are marked simulated. They are not evidence.
          </div>
        )}
        <div className="max-h-[78vh] overflow-auto bg-sunken/70 p-4 scroll-thin sm:p-6">
          <div className="mx-auto transition-[width] duration-300" style={{ width: `${Math.min(100, 88 * zoom)}%`, minWidth: zoom > 1 ? `${360 * zoom}px` : undefined }}>
            <EvidencePage documentId={documentId} page={page} pageSize={data.page_sizes[page - 1]} boxes={boxes}
              onBoxClick={id => { if (!id.startsWith('field:')) onSelectFinding(id.split('#')[0]) }} />
          </div>
          {!boxes.length && docFindings.length > 0 && (
            <p className="mx-auto mt-3 max-w-md text-center text-[12px] text-ink-3">
              The findings on this document are file-level (metadata, revisions or signatures), so none has a position on this page.
            </p>
          )}
        </div>
      </div>

      <aside className="min-w-0 space-y-3 lg:col-span-2 xl:col-span-1" aria-label="Finding">
        {selectedFinding ? (
          <div className="card overflow-hidden animate-rise-in" key={selectedFinding.id}>
            <div className="flex items-start gap-2.5 border-b border-line px-4 py-3">
              <SeverityTag severity={selectedFinding.severity} className="mt-0.5" />
              <p className="min-w-0 flex-1 text-[15px] font-semibold leading-snug">{findingTitle(selectedFinding.code, selectedFinding.title)}</p>
              <button className="text-[13px] text-ink-3 hover:text-ink" onClick={() => onSelectFinding(null)}>Clear</button>
            </div>
            <div className="space-y-3 px-4 py-3">
              {pinForSelected && (
                <EvidenceCrop documentId={documentId} page={pinForSelected.page} pageSize={data.page_sizes[pinForSelected.page - 1]} bbox={pinForSelected.bbox}
                  tone={selectedFinding.severity === 'HIGH' ? 'finding' : 'review'} />
              )}
              <InspectorFacts finding={selectedFinding} ctx={ctx} source={`${categoryLabel(data.document.category)}${pinForSelected ? `, page ${pinForSelected.page}` : ', whole file'}`} />
              <DispositionControl caseId={caseDetail.id} finding={selectedFinding} disabled={!canRule} />
            </div>
          </div>
        ) : null}

        <section className="card overflow-hidden">
          <p className="border-b border-line px-4 py-2.5 text-[14px] font-semibold">Findings in this document ({docFindings.length})</p>
          <div className="px-3 py-2">
            {docFindings.length ? (
              <ul className="space-y-0.5">
                {sortFindings(docFindings).map(f => (
                  <li key={f.id}>
                    <button onClick={() => onSelectFinding(f.id)}
                      className={cn('flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-sunken', selectedFinding?.id === f.id && 'bg-navy-50')}>
                      <SeverityTag severity={f.severity} className="mt-px" />
                      <span className="min-w-0 text-[14px] leading-snug text-ink">{findingTitle(f.code, f.title)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="px-1 py-1 text-[14px] text-ink-3">No findings were raised on this document.</p>}
          </div>
        </section>

        <button onClick={() => setTechnical(t => !t)} aria-expanded={technical} className="inline-flex items-center gap-1.5 px-1 text-[14px] font-medium text-navy-600 hover:underline">
          <ChevronDown className={cn('size-4 transition-transform', technical && 'rotate-180')} aria-hidden /> {technical ? 'Hide technical details' : 'View technical details'}
        </button>
        {technical && (
          <div className="space-y-3 animate-fade-in">
            <Panel title="Integrity checks" defaultOpen>
              <ul className="space-y-1.5">
                {data.checks.map(c => {
                  const k = CHECK_KIND[c.status] ?? CHECK_KIND.UNMEASURED
                  return (
                    <li key={c.code} className="flex items-start justify-between gap-3 text-[13px]">
                      <span className="min-w-0">
                        <span className="text-ink">{CHECK_LABEL[c.code] ?? c.code}</span>
                        {c.note && <span className="block text-[12px] text-ink-3">{c.note}</span>}
                      </span>
                      <StatusText kind={k.kind} label={k.label} className="shrink-0 text-[12.5px]" />
                    </li>
                  )
                })}
              </ul>
              <p className="mt-2.5 border-t border-line pt-2 text-[12px] text-ink-3">Not measured means the check could not run on this file. It is not a pass.</p>
            </Panel>
            <SignaturePanel data={data} />
            <ProvenancePanel data={data} record={record} />
            <Panel title={`Extracted fields (${Object.keys(data.fields).length})`}>
              {Object.keys(data.fields).length ? (
                <ul className="-mx-1 space-y-0.5">
                  {Object.entries(data.fields).map(([name, fld]) => (
                    <li key={name}>
                      <button onClick={() => { setField(name === field ? null : name); if (fld.page) setPage(fld.page); onSelectFinding(null) }}
                        disabled={!fld.bbox}
                        className={cn('w-full rounded-md px-2 py-1.5 text-left enabled:hover:bg-sunken', field === name && 'bg-navy-50')}>
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="text-[12.5px] text-ink-3">{fld.label ?? name}</span>
                          <span className="text-[12px] text-ink-4">{fld.simulated ? 'simulated' : fld.source === 'ocr' ? 'OCR' : fld.page ? `p.${fld.page}` : ''}</span>
                        </span>
                        <span className="block truncate font-mono text-[12.5px] text-ink">{fld.raw ?? String(fld.value ?? '')}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-[13px] text-ink-3">No fields could be read from this file.</p>}
            </Panel>
            {selectedFinding && <p className="px-1 text-[12.5px] text-ink-4"><RuleRecord finding={selectedFinding} /></p>}
          </div>
        )}
      </aside>
    </>
  )
}

function Panel({ title, children, defaultOpen }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen)
  return (
    <section className="card overflow-hidden">
      <button className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-subtle" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="text-[13px] font-semibold">{title}</span>
        <ChevronDown className={cn('size-4 text-ink-4 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && <div className="border-t border-line px-4 py-3">{children}</div>}
    </section>
  )
}

function SignaturePanel({ data }: { data: DocumentEvidence }) {
  const sigs = data.structure?.signatures ?? []
  return (
    <Panel title={sigs.length ? `Digital signature (${sigs.length})` : 'Digital signature'} defaultOpen={sigs.length > 0}>
      {sigs.length === 0 ? (
        <p className="flex items-center gap-2 text-[12.5px] text-ink-3"><StatusText kind="unchecked" label="Not signed" className="text-[12px]" /> No digital signature in this file.</p>
      ) : sigs.map(s => {
        const modified = s.modification_level && s.modification_level !== 'NONE' && s.modification_level !== 'LTA_UPDATES'
        return (
          <div key={s.field} className="space-y-1.5 text-[12.5px]">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-navy-600" aria-hidden />
              <span className="font-medium">{s.signer}</span>
            </div>
            <dl className="grid grid-cols-[110px_1fr] gap-x-2 gap-y-1">
              <dt className="text-ink-3">Signed at</dt><dd>{s.signed_at}</dd>
              <dt className="text-ink-3">Integrity</dt><dd><StatusText kind={s.intact ? 'pass' : 'finding'} label={s.intact ? 'Intact' : 'Broken'} className="text-[12px]" /></dd>
              <dt className="text-ink-3">Trust</dt><dd><StatusText kind={s.trusted ? 'verified' : 'review'} label={s.trusted ? 'Trusted root' : 'Untrusted root'} className="text-[12px]" /></dd>
              <dt className="text-ink-3">After signing</dt><dd><StatusText kind={modified ? 'finding' : 'pass'} label={modified ? 'Content changed' : 'No changes'} className="text-[12px]" /></dd>
            </dl>
            {modified && <p className="rounded-md bg-finding-bg px-2.5 py-1.5 text-[12px] text-finding">The signature covers an earlier revision only. What the officer sees now is not what the issuer signed.</p>}
          </div>
        )
      })}
    </Panel>
  )
}

function ProvenancePanel({ data, record }: { data: DocumentEvidence; record?: DocumentRecord }) {
  const m = (data.structure?.metadata ?? {}) as Record<string, string>
  const parsePdfDate = (v?: string) => {
    const x = v?.match(/D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/)
    return x ? `${x[3]}/${x[2]}/${x[1]} ${x[4]}:${x[5]}` : v || 'Not recorded'
  }
  const rows: [string, ReactNode][] = [
    ['Producer', m.producer || 'Not recorded'],
    ['Creator', m.creator || 'Not recorded'],
    ['Author', m.author || 'Not recorded'],
    ['Created', parsePdfDate(m.creationdate)],
    ['Modified', parsePdfDate(m.moddate)],
    ['Revisions', data.structure?.revisions ?? 'Not recorded'],
    ['SHA-256', <Mono key="h" className="text-[12px]" title={data.document.sha256}>{shortHash(data.document.sha256, 16)}</Mono>],
    ['Uploaded', record ? formatDateTime(record.uploaded_at) : 'Not recorded'],
  ]
  return (
    <Panel title="File provenance">
      <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-2 gap-y-1 text-[12.5px]">
        {rows.map(([k, v]) => (<Fragment key={k}><dt className="text-ink-3">{k}</dt><dd className="min-w-0 break-words">{v}</dd></Fragment>))}
      </dl>
      {data.structure?.fonts && (
        <p className="mt-2 border-t border-line pt-2 text-[12px] text-ink-3">
          Fonts: {Object.entries(data.structure.fonts).map(([f, n]) => `${f} (${n})`).join(', ')}
        </p>
      )}
    </Panel>
  )
}

function InspectorFacts({ finding, ctx, source }: { finding: Finding; ctx: FindingContext; source: string }) {
  const v = findingValues(finding, ctx)
  const rows: [string, string, boolean?][] = [
    ['Observed', v.observed, true],
    ['Expected or recovered', v.expected],
    ['Evidence source', source],
  ]
  return (
    <dl className="divide-y divide-line rounded-md border border-line">
      {rows.map(([k, val, strong]) => (
        <div key={k} className="grid grid-cols-[120px_minmax(0,1fr)] gap-2 px-3 py-2 text-[13.5px]">
          <dt className="text-ink-3">{k}</dt>
          <dd className={cn('min-w-0 break-words', strong ? 'font-semibold text-finding' : 'text-ink')}>{val}</dd>
        </div>
      ))}
    </dl>
  )
}
