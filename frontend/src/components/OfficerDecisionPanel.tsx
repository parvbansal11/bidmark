import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Select, Textarea, Label } from '@/components/ui/Input'
import { StatusBadge } from '@/components/RiskBadge'
import { useAuth } from '@/context/AuthContext'
import type { DecisionValue, OfficerDecision } from '@/types'
import { formatDate } from '@/lib/utils'
import { Gavel } from 'lucide-react'

export function OfficerDecisionPanel({
  current,
  onSubmit,
  submitting,
}: {
  current: OfficerDecision | null | undefined
  onSubmit: (decision: DecisionValue, reason: string) => void | Promise<void>
  submitting?: boolean
}) {
  const { user } = useAuth()
  const [decision, setDecision] = useState<DecisionValue>('PENDING_REVIEW')
  const [reason, setReason] = useState('')
  const canDecide = user?.role === 'PROCUREMENT_OFFICER' || user?.role === 'ADMIN'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Gavel className="h-4 w-4" /> Officer Decision (Human-in-the-Loop)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {current ? (
          <div className="rounded-md bg-slate-50 px-3 py-2 text-sm">
            <div className="flex items-center justify-between">
              <StatusBadge status={current.decision} />
              <span className="text-xs text-slate-400">{formatDate(current.decided_at)}</span>
            </div>
            <p className="mt-1 text-xs text-slate-600">{current.reason}</p>
          </div>
        ) : (
          <p className="text-sm text-slate-500">No final decision has been recorded yet. The AI recommendation above is decision-support only.</p>
        )}

        {canDecide && (
          <form
            className="space-y-2 border-t border-slate-100 pt-3"
            onSubmit={(e) => {
              e.preventDefault()
              onSubmit(decision, reason)
            }}
          >
            <div>
              <Label>New decision</Label>
              <Select value={decision} onChange={(e) => setDecision(e.target.value as DecisionValue)}>
                <option value="QUALIFIED">QUALIFIED</option>
                <option value="DISQUALIFIED">DISQUALIFIED</option>
                <option value="PENDING_REVIEW">PENDING_REVIEW</option>
              </Select>
            </div>
            <div>
              <Label>Reason (required)</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Officer's rationale for this decision..." required />
            </div>
            <Button type="submit" disabled={submitting || !reason.trim()}>
              {submitting ? 'Recording…' : 'Record decision'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
