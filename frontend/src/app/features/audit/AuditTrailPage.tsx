import { useMemo, useState } from 'react'
import { ChevronRight, RefreshCw, Search } from 'lucide-react'
import { formatDateTime, formatTime, humanise } from '@/app/lib/format'
import { auditActionLabel, ROLE_LABEL } from '@/app/lib/labels'
import { invalidate, useResource } from '@/app/lib/useResource'
import { audit, tenders, type AuditEntry } from '@/app/services/bidmark'
import { PageHeader } from '@/app/features/shell/AppShell'
import { StatusText } from '@/app/components/bidmark/Status'
import { Button, Drawer, Input, Mono, Select, SkeletonRows } from '@/app/components/ui/primitives'
import { EmptyState, ErrorState } from '@/app/components/ui/states'
import { ChainBanner } from './ChainStatus'

// Audit trail: what happened, who did it and when?
export function AuditTrailPage({ title = 'Audit Trail', eyebrow = 'Bidmark' }: { title?: string; eyebrow?: string }) {
  const [action, setAction] = useState('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<AuditEntry | null>(null)
  const chain = useResource('audit:chain', () => audit.chain())
  const feed = useResource(`audit:feed:${action}`, () => audit.feed({ limit: 300, action: action || undefined }))
  const tenderList = useResource('tenders', () => tenders.list())
  const tenderName = useMemo(() => Object.fromEntries((tenderList.data ?? []).map(t => [t.id, t.tender_number])), [tenderList.data])
  const [checkedAt, setCheckedAt] = useState(() => formatTime(new Date().toISOString()))
  const all = useResource('audit:feed:', () => audit.feed({ limit: 300 }))
  const actions = useMemo(() => [...new Set((all.data ?? []).map(e => e.action))].sort(), [all.data])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = feed.data ?? []
    return needle ? list.filter(e => `${e.description} ${auditActionLabel(e.action)} ${e.actor_role ?? ''}`.toLowerCase().includes(needle)) : list
  }, [feed.data, q])

  // An entry is intact when the chain verifies, or when it precedes the break.
  const intact = (e: AuditEntry) => chain.data ? chain.data.intact || (chain.data.broken_at != null && e.seq < chain.data.broken_at) : null

  function entity(e: AuditEntry) {
    const t = e.tender_id ? tenderName[e.tender_id] : null
    const kind = e.entity_type === 'CopilotQuery' ? 'Ask Bidmark' : e.entity_type ? humanise(e.entity_type.replace(/([a-z])([A-Z])/g, '$1_$2')) : null
    return [kind, t].filter(Boolean).join(', ') || '-'
  }

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={eyebrow} title={title}
        actions={<Button icon={<RefreshCw className="size-4" aria-hidden />} onClick={() => { invalidate('audit:chain'); setCheckedAt(formatTime(new Date().toISOString())) }}>Verify again</Button>} />

      {chain.error ? <ErrorState error={chain.error} onRetry={chain.reload} what="the integrity check" compact />
        : chain.data ? <ChainBanner chain={chain.data} checkedAt={checkedAt} /> : <SkeletonRows rows={1} />}

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-4" aria-hidden />
          <label htmlFor="audit-q" className="sr-only">Search</label>
          <Input id="audit-q" value={q} onChange={e => setQ(e.target.value)} placeholder="Search actions and descriptions" className="pl-9" />
        </div>
        <label htmlFor="audit-a" className="sr-only">Action</label>
        <Select id="audit-a" value={action} onChange={e => setAction(e.target.value)} className="w-auto min-w-56">
          <option value="">All actions</option>
          {actions.map(a => <option key={a} value={a}>{auditActionLabel(a)}</option>)}
        </Select>
      </div>

      <section className="card overflow-hidden">
        {feed.error ? <div className="p-5"><ErrorState error={feed.error} onRetry={feed.reload} what="the audit trail" /></div>
          : !feed.data ? <div className="p-5"><SkeletonRows rows={8} /></div>
            : rows.length === 0 ? <EmptyState title="No entries match" />
              : (
                <div className="max-h-[70vh] overflow-auto scroll-thin">
                  <table className="data-table">
                    <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th><th>Integrity</th><th aria-label="Details" /></tr></thead>
                    <tbody>
                      {rows.map(e => {
                        const ok = intact(e)
                        return (
                          <tr key={e.seq} className="row-link" onClick={() => setOpen(e)}>
                            <td className="whitespace-nowrap">{formatDateTime(e.created_at)}</td>
                            <td className="whitespace-nowrap">{e.actor_role ? ROLE_LABEL[e.actor_role] : 'System'}</td>
                            <td className="whitespace-nowrap font-medium text-ink">{auditActionLabel(e.action)}</td>
                            <td className="max-w-[260px] truncate">{entity(e)}</td>
                            <td>{ok == null ? '-' : <StatusText kind={ok ? 'verified' : 'finding'} label={ok ? 'Integrity verified' : 'After break'} className="text-[13px]" />}</td>
                            <td className="w-28 whitespace-nowrap text-right text-[13px] text-navy-600">View details<ChevronRight className="ml-0.5 inline size-3.5" aria-hidden /></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
      </section>
      <Drawer open={!!open} onClose={() => setOpen(null)} title={open ? auditActionLabel(open.action) : ''} subtitle={open ? formatDateTime(open.created_at) : undefined}>
        {open && <EntryDetail e={open} entity={entity(open)} intact={intact(open)} />}
      </Drawer>
    </div>
  )
}

function EntryDetail({ e, entity, intact }: { e: AuditEntry; entity: string; intact: boolean | null }) {
  const meta = Object.entries(e.metadata ?? {}).filter(([, v]) => v != null && typeof v !== 'object')
  const rows: [string, React.ReactNode][] = [
    ['When', formatDateTime(e.created_at)],
    ['Actor', e.actor_role ? ROLE_LABEL[e.actor_role] : 'System'],
    ['Action', auditActionLabel(e.action)],
    ['Entity', entity],
    ['Record', e.description],
    ...meta.slice(0, 8).map(([k, v]) => [humanise(k), String(v)] as [string, React.ReactNode]),
    ['Integrity', intact == null ? 'Not checked' : intact ? 'Verified' : 'After the break in the chain'],
    ['Entry', String(e.seq)],
    ['Event hash', <Mono key="h" className="break-all text-[12.5px]">{e.row_hash}</Mono>],
    ['Previous hash', <Mono key="p" className="break-all text-[12.5px]">{e.prev_hash}</Mono>],
  ]
  return (
    <dl className="divide-y divide-line text-[14px]">
      {rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 py-2.5"><dt className="text-ink-3">{k}</dt><dd className="min-w-0 break-words text-ink">{v}</dd></div>
      ))}
    </dl>
  )
}
