import { formatDate } from '@/lib/utils'
import type { AuditLogEntry } from '@/types'
import { Clock } from 'lucide-react'

export function AuditTimeline({ entries }: { entries: AuditLogEntry[] }) {
  if (!entries.length) {
    return <p className="text-sm text-slate-500">No audit events recorded yet.</p>
  }
  return (
    <ol className="relative space-y-4 border-l border-slate-200 pl-5">
      {entries.map((e) => (
        <li key={e.id} className="relative">
          <span className="absolute -left-[26px] top-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-100">
            <Clock className="h-2.5 w-2.5 text-blue-600" />
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-blue-700">{e.action.replace(/_/g, ' ')}</span>
            <span className="text-[11px] text-slate-400">{formatDate(e.created_at)}</span>
            {e.actor_role && <span className="text-[11px] text-slate-400">by {e.actor_role}</span>}
          </div>
          <p className="text-sm text-slate-700">{e.description}</p>
        </li>
      ))}
    </ol>
  )
}
