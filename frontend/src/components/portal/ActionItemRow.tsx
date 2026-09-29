import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import type { PortalActionItem } from '@/types'
import { UploadCloud, RefreshCw, PenLine, Eye } from 'lucide-react'

const ACTION_META: Record<PortalActionItem['action'], { label: string; icon: typeof UploadCloud; to: string }> = {
  UPLOAD: { label: 'Upload', icon: UploadCloud, to: '/my-documents' },
  REPLACE: { label: 'Replace', icon: RefreshCw, to: '/my-documents' },
  CORRECT: { label: 'Correct', icon: PenLine, to: '/my-documents' },
  REVIEW: { label: 'View', icon: Eye, to: '/my-documents' },
}

export function ActionItemRow({ item }: { item: PortalActionItem }) {
  const meta = ACTION_META[item.action]
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Badge tone={item.priority === 'CRITICAL' ? 'danger' : 'warning'}>{item.priority === 'CRITICAL' ? 'Critical' : 'Needs attention'}</Badge>
          <p className="truncate text-sm font-medium text-slate-800">{item.title}</p>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">{item.description}</p>
        <p className="mt-0.5 text-[11px] text-slate-400">{item.tender_title}</p>
      </div>
      <Link to={meta.to}>
        <Button size="sm" variant="outline">
          <meta.icon className="h-3.5 w-3.5" /> {meta.label}
        </Button>
      </Link>
    </div>
  )
}
