import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { PageHeader, FullPageSpinner, Alert } from '@/components/ui/Misc'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { ComplianceScoreCard } from '@/components/ComplianceScoreCard'
import { RequirementStatusList } from '@/components/RequirementStatusList'
import { AIRecommendationCard } from '@/components/AIRecommendationCard'
import { ForensicRiskCard, BehavioralRiskCard } from '@/components/ForensicBehavioralCards'
import { RedFlagCascade } from '@/components/RedFlagCascade'
import { OfficerDecisionPanel } from '@/components/OfficerDecisionPanel'
import { AuditTimeline } from '@/components/AuditTimeline'
import { StatusBadge } from '@/components/RiskBadge'
import * as dashboardApi from '@/api/dashboard'
import * as complianceApi from '@/api/compliance'
import * as verificationApi from '@/api/verification'
import * as behaviorApi from '@/api/behavior'
import * as decisionsApi from '@/api/decisions'
import * as auditApi from '@/api/audit'
import * as intelligenceApi from '@/api/intelligence'
import type { Bidder360, AuditLogEntry, DecisionValue } from '@/types'
import { apiErrorMessage } from '@/api/client'
import { Download, RefreshCw, Sparkles, Zap } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export function Bidder360Page() {
  const { bidderId, tenderId } = useParams<{ bidderId: string; tenderId: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<Bidder360 | null>(null)
  const [auditEntries, setAuditEntries] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const refresh = useCallback(() => {
    if (!bidderId || !tenderId) return
    setLoading(true)
    Promise.all([dashboardApi.getBidder360(bidderId, tenderId), auditApi.getAuditTrail(bidderId, tenderId)])
      .then(([d, a]) => {
        setData(d)
        setAuditEntries(a)
      })
      .catch((err) => setError(apiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [bidderId, tenderId])

  useEffect(refresh, [refresh])

  async function handleRunFullVerification() {
    if (!bidderId || !tenderId) return
    setRunning(true)
    setError(null)
    try {
      await verificationApi.runFullWorkflow(bidderId, tenderId)
      refresh()
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setRunning(false)
    }
  }

  async function handleRecompute(step: 'compliance' | 'crosscheck' | 'behavior') {
    if (!bidderId || !tenderId) return
    setRunning(true)
    setError(null)
    try {
      if (step === 'compliance') await complianceApi.evaluateCompliance(bidderId, tenderId)
      if (step === 'crosscheck') await verificationApi.runCrossCheck(bidderId, tenderId)
      if (step === 'behavior') await behaviorApi.analyzeBehavior(bidderId, tenderId)
      refresh()
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setRunning(false)
    }
  }

  async function handleDecision(decision: DecisionValue, reason: string) {
    if (!bidderId || !tenderId) return
    try {
      await decisionsApi.submitDecision(bidderId, tenderId, decision, reason)
      refresh()
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  async function handleAsk() {
    if (!bidderId || !tenderId || !question.trim()) return
    setAsking(true)
    setAnswer(null)
    try {
      const res = await intelligenceApi.askCopilot(bidderId, tenderId, question)
      setAnswer(res.answer)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setAsking(false)
    }
  }

  async function handleDownloadReport() {
    if (!bidderId || !tenderId) return
    setDownloading(true)
    setError(null)
    try {
      await complianceApi.openComplianceReportPdf(bidderId, tenderId)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setDownloading(false)
    }
  }

  if (loading || !data) return <FullPageSpinner label="Loading Bidder 360°…" />

  return (
    <div className="space-y-6">
      <PageHeader
        title={data.bidder.company_name}
        description={`Bidder 360° investigation view — ${data.tender.title} (${data.tender.tender_number})`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleDownloadReport} disabled={downloading}>
              <Download className="h-4 w-4" /> {downloading ? 'Preparing…' : 'Download compliance report'}
            </Button>
            <Button onClick={handleRunFullVerification} disabled={running}>
              <RefreshCw className={`h-4 w-4 ${running ? 'animate-spin' : ''}`} /> {running ? 'Running…' : 'Run full verification'}
            </Button>
            <Button
              variant="outline"
              className="border-blue-300 text-blue-700 hover:bg-blue-50"
              onClick={() => navigate(`/bidders/${bidderId}/bidmark/${tenderId}`)}
            >
              <Zap className="h-4 w-4" /> BIDMARK Analysis
            </Button>
          </div>
        }
      />

      {error && <Alert tone="danger">{error}</Alert>}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="documents">Government & Documents</TabsTrigger>
          <TabsTrigger value="cross-checks">Cross-Checks</TabsTrigger>
          <TabsTrigger value="forensics">Forensics & Behavior</TabsTrigger>
          <TabsTrigger value="redflags">Red Flag Cascade</TabsTrigger>
          <TabsTrigger value="decision">AI & Decision</TabsTrigger>
          <TabsTrigger value="audit">Audit Trail</TabsTrigger>
          <TabsTrigger value="copilot">Copilot</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ComplianceScoreCard report={data.compliance_report as never} />
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Requirement evaluations</CardTitle>
                <Button size="sm" variant="outline" onClick={() => handleRecompute('compliance')} disabled={running}>
                  Re-evaluate
                </Button>
              </CardHeader>
              <CardContent>
                <RequirementStatusList evaluations={(data.compliance_report?.requirement_evaluations ?? []) as never} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="documents" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Government verification results (Mock Gateway)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {!data.government_verification.length && <p className="text-sm text-slate-500">No verifications run yet.</p>}
              {data.government_verification.map((v, i) => (
                <div key={i} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
                  <span className="font-medium text-slate-700">{v.verification_type}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-amber-600 mock-badge rounded px-1.5 py-0.5">MOCK_GOVERNMENT_API</span>
                    <StatusBadge status={v.status} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Documents</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.documents.map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2 text-sm">
                  <span>{d.category} — {d.original_filename}</span>
                  <StatusBadge status={d.status} />
                </div>
              ))}
              {!data.documents.length && <p className="text-sm text-slate-500">No documents uploaded.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cross-checks" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Cross-document verification</CardTitle>
              <Button size="sm" variant="outline" onClick={() => handleRecompute('crosscheck')} disabled={running}>
                Re-run cross-check
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.cross_document_checks.map((c, i) => (
                <div key={i} className="rounded-md border border-slate-100 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-700">{c.field} ({c.relation})</span>
                    <StatusBadge status={c.status} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Sources: {c.sources.join(', ')}</p>
                </div>
              ))}
              {!data.cross_document_checks.length && <p className="text-sm text-slate-500">No cross-checks run yet.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Discrepancies</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.discrepancies.map((d, i) => (
                <div key={i} className="flex items-center justify-between rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">
                  <span>{d.description}</span>
                  <span className="font-medium">{d.score_impact}</span>
                </div>
              ))}
              {!data.discrepancies.length && <p className="text-sm text-slate-500">No discrepancies found.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="forensics" className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ForensicRiskCard analyses={data.forensic_risk} />
          <div className="space-y-3">
            <BehavioralRiskCard report={data.behavioral_risk} />
            <Button size="sm" variant="outline" onClick={() => handleRecompute('behavior')} disabled={running}>
              Re-run behavioral analysis
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="redflags" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Red Flag Cascade — from evidence to officer action</CardTitle>
            </CardHeader>
            <CardContent>
              <RedFlagCascade items={data.red_flag_cascade} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="decision" className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AIRecommendationCard recommendation={data.ai_recommendation} />
          <OfficerDecisionPanel current={data.officer_decision as never} onSubmit={handleDecision} />
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Complete audit trail for this bidder + tender</CardTitle>
            </CardHeader>
            <CardContent>
              <AuditTimeline entries={auditEntries} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="copilot" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> Procurement Officer Copilot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-slate-500">Ask evidence-grounded questions — e.g. "Why is this bidder high risk?" or "Which requirements failed?"</p>
              <div className="flex gap-2">
                <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask the copilot…" onKeyDown={(e) => e.key === 'Enter' && handleAsk()} />
                <Button onClick={handleAsk} disabled={asking || !question.trim()}>
                  {asking ? 'Asking…' : 'Ask'}
                </Button>
              </div>
              {answer && <Alert tone="info">{answer}</Alert>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
