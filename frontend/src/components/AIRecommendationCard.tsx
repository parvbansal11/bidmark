import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Alert } from '@/components/ui/Misc'
import type { AIRecommendation } from '@/types'
import { Bot } from 'lucide-react'

const toneByRecommendation: Record<string, 'success' | 'warning' | 'danger'> = {
  COMPLIANT: 'success',
  REQUIRES_REVIEW: 'warning',
  NON_COMPLIANT: 'danger',
}

export function AIRecommendationCard({ recommendation }: { recommendation: AIRecommendation | null | undefined }) {
  if (!recommendation) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bot className="h-4 w-4" /> AI Recommendation</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-500">Run a compliance evaluation to generate a recommendation.</CardContent>
      </Card>
    )
  }
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Bot className="h-4 w-4" /> AI Recommendation</CardTitle>
        <Badge tone={toneByRecommendation[recommendation.recommendation] ?? 'muted'}>{recommendation.recommendation.replace(/_/g, ' ')}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-slate-500">Confidence: {(recommendation.confidence * 100).toFixed(0)}%</p>
        {recommendation.reasons.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-700">Reasons</p>
            <ul className="ml-4 list-disc space-y-0.5 text-xs text-slate-600">
              {recommendation.reasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
        )}
        {recommendation.recommended_actions.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-700">Recommended actions for the officer</p>
            <ul className="ml-4 list-disc space-y-0.5 text-xs text-slate-600">
              {recommendation.recommended_actions.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
        )}
        <Alert tone="info">{recommendation.disclaimer}</Alert>
      </CardContent>
    </Card>
  )
}
