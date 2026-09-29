import { Badge } from '@/components/ui/Badge'
import type { RiskLevel } from '@/types'
import { cn } from '@/lib/utils'

const toneByLevel: Record<string, 'success' | 'warning' | 'danger' | 'muted'> = {
  LOW: 'success',
  MEDIUM: 'warning',
  HIGH: 'danger',
  PENDING: 'muted',
}

export function RiskBadge({ level, className }: { level: RiskLevel | 'PENDING' | string; className?: string }) {
  return (
    <Badge tone={toneByLevel[level] ?? 'muted'} className={cn('uppercase tracking-wide', className)}>
      {level}
    </Badge>
  )
}

const toneByStatus: Record<string, 'success' | 'warning' | 'danger' | 'muted' | 'info'> = {
  VERIFIED: 'success',
  COMPLIANT: 'success',
  MATCH: 'success',
  QUALIFIED: 'success',
  FAILED: 'danger',
  NON_COMPLIANT: 'danger',
  MAJOR_MISMATCH: 'danger',
  DISQUALIFIED: 'danger',
  MISMATCH: 'danger',
  EXPIRED: 'warning',
  REQUIRES_REVIEW: 'warning',
  MINOR_VARIATION: 'warning',
  PENDING_REVIEW: 'warning',
  MISSING_INFORMATION: 'warning',
  PENDING: 'muted',
  NOT_APPLICABLE: 'muted',
  UPLOADED: 'info',
  EXTRACTED: 'info',
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge tone={toneByStatus[status] ?? 'muted'} className={cn('uppercase tracking-wide', className)}>
      {status.replace(/_/g, ' ')}
    </Badge>
  )
}
