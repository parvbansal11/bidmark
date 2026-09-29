import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PageHeader, FullPageSpinner, Section, EmptyState } from '@/components/ui/Misc'
import { Card, CardContent } from '@/components/ui/Card'
import { DataRow } from '@/components/ui/Misc'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Label, Textarea } from '@/components/ui/Input'
import { DocumentUploader } from '@/components/DocumentUploader'
import { DocumentList } from '@/components/DocumentList'
import * as bidderApi from '@/api/bidders'
import * as tendersApi from '@/api/tenders'
import * as documentsApi from '@/api/documents'
import * as forensicsApi from '@/api/forensics'
import type { ModerationAction } from '@/api/bidders'
import type { Bidder, DocumentItem, Tender } from '@/types'
import { apiErrorMessage } from '@/api/client'
import { Flag, ShieldAlert, Ban, RotateCcw } from 'lucide-react'

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'muted'> = {
  ACTIVE: 'success',
  FLAGGED: 'warning',
  SUSPENDED: 'danger',
  BANNED: 'danger',
}

const MODERATION_COPY: Record<ModerationAction, { label: string; verb: string; description: string }> = {
  flag: {
    label: 'Flag bidder',
    verb: 'flag',
    description: 'Marks this bidder for closer attention. Does not block their access — purely a visible marker for other reviewers.',
  },
  suspend: {
    label: 'Suspend bidder',
    verb: 'suspend',
    description: 'Temporarily blocks this bidder from logging in or using the system pending investigation. Reversible.',
  },
  ban: {
    label: 'Permanently ban bidder',
    verb: 'ban',
    description: 'Permanently bars this bidder — use only for confirmed fraud or procurement-rule violations. Blocks access immediately and is recorded in the audit trail.',
  },
  reactivate: {
    label: 'Reactivate bidder',
    verb: 'reactivate',
    description: 'Lifts any flag/suspension/ban and restores normal access.',
  },
}

export function BidderProfilePage() {
  const { bidderId } = useParams<{ bidderId: string }>()
  const [bidder, setBidder] = useState<Bidder | null>(null)
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [linkedTenders, setLinkedTenders] = useState<Tender[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [moderationAction, setModerationAction] = useState<ModerationAction | null>(null)
  const [moderationReason, setModerationReason] = useState('')
  const [moderating, setModerating] = useState(false)

  function refresh() {
    if (!bidderId) return
    setLoading(true)
    Promise.all([bidderApi.getBidder(bidderId), documentsApi.listBidderDocuments(bidderId), tendersApi.listTenders()])
      .then(async ([b, docs, tenders]) => {
        setBidder(b)
        setDocuments(docs)
        const memberships = await Promise.all(
          tenders.map((t) => tendersApi.listTenderBidders(t.id).then((bidders) => (bidders.some((x) => x.id === bidderId) ? t : null))),
        )
        setLinkedTenders(memberships.filter((t): t is Tender => t !== null))
      })
      .finally(() => setLoading(false))
  }

  useEffect(refresh, [bidderId])

  async function handleUpload(category: string, file: File) {
    if (!bidderId) return
    setError(null)
    try {
      await documentsApi.uploadDocument(bidderId, category, file)
      refresh()
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  async function runAction(doc: DocumentItem, action: 'extract' | 'verify' | 'delete' | 'forensics') {
    setBusyId(doc.id)
    setError(null)
    try {
      if (action === 'extract') await documentsApi.extractDocument(doc.id)
      if (action === 'verify') await documentsApi.verifyDocument(doc.id)
      if (action === 'delete') await documentsApi.deleteDocument(doc.id)
      if (action === 'forensics') await forensicsApi.analyzeDocumentForensics(doc.id)
      refresh()
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  async function submitModeration() {
    if (!bidderId || !moderationAction) return
    setModerating(true)
    setError(null)
    try {
      await bidderApi.moderateBidder(bidderId, moderationAction, moderationReason || undefined)
      setModerationAction(null)
      setModerationReason('')
      refresh()
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setModerating(false)
    }
  }

  if (loading || !bidder) return <FullPageSpinner label="Loading bidder…" />

  const isBlocking = bidder.status === 'SUSPENDED' || bidder.status === 'BANNED'

  return (
    <div className="space-y-6">
      <PageHeader
        title={bidder.company_name}
        description={bidder.legal_name ?? undefined}
        actions={
          // Moderation is a Procurement Officer / Admin action, not something a
          // Bidder can trigger on themselves — see app/api/v1/bidders.py.
          <div className="flex flex-wrap justify-end gap-1.5">
            {!isBlocking && (
              <Button size="sm" variant="outline" onClick={() => setModerationAction('flag')}>
                <Flag className="h-3.5 w-3.5" /> Flag
              </Button>
            )}
            {bidder.status !== 'SUSPENDED' && bidder.status !== 'BANNED' && (
              <Button size="sm" variant="outline" onClick={() => setModerationAction('suspend')}>
                <ShieldAlert className="h-3.5 w-3.5" /> Suspend
              </Button>
            )}
            {bidder.status !== 'BANNED' && (
              <Button size="sm" variant="destructive" onClick={() => setModerationAction('ban')}>
                <Ban className="h-3.5 w-3.5" /> Ban
              </Button>
            )}
            {bidder.status !== 'ACTIVE' && (
              <Button size="sm" variant="success" onClick={() => setModerationAction('reactivate')}>
                <RotateCcw className="h-3.5 w-3.5" /> Reactivate
              </Button>
            )}
          </div>
        }
      />

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="py-4">
            <DataRow label="PAN" value={bidder.pan_number ?? '—'} />
            <DataRow label="GSTIN" value={bidder.gstin ?? '—'} />
            <DataRow label="CIN" value={bidder.cin ?? '—'} />
            <DataRow label="Udyam" value={bidder.udyam_number ?? '—'} />
            <DataRow label="Status" value={<Badge tone={STATUS_TONE[bidder.status] ?? 'muted'}>{bidder.status}</Badge>} />
            <DataRow label="Address" value={bidder.registered_address ?? '—'} />
            <DataRow label="Contact" value={bidder.contact_email ?? '—'} />
          </CardContent>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Section title="Tenders" description="Tenders this bidder is participating in">
            {!linkedTenders.length ? (
              <EmptyState title="Not linked to any tender yet" description="Add this bidder from a tender's detail page." />
            ) : (
              <div className="flex flex-wrap gap-2">
                {linkedTenders.map((t) => (
                  <Link
                    key={t.id}
                    to={`/bidders/${bidderId}/tenders/${t.id}`}
                    className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
                  >
                    {t.title} →
                  </Link>
                ))}
              </div>
            )}
          </Section>

          <Section title="Documents" description="Upload and verify supporting documents">
            <DocumentUploader onUpload={handleUpload} />
            <div className="mt-3">
              <DocumentList
                documents={documents}
                busyId={busyId}
                onExtract={(d) => runAction(d, 'extract')}
                onVerify={(d) => runAction(d, 'verify')}
                onDelete={(d) => runAction(d, 'delete')}
                onForensics={(d) => runAction(d, 'forensics')}
              />
            </div>
          </Section>
        </div>
      </div>

      <Dialog
        open={moderationAction !== null}
        onClose={() => setModerationAction(null)}
        title={moderationAction ? MODERATION_COPY[moderationAction].label : ''}
      >
        {moderationAction && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">{MODERATION_COPY[moderationAction].description}</p>
            <div>
              <Label>Reason {moderationAction === 'ban' ? '(required for the audit trail)' : '(optional)'}</Label>
              <Textarea
                value={moderationReason}
                onChange={(e) => setModerationReason(e.target.value)}
                placeholder="Explain why this action is being taken…"
              />
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <Button
              className="w-full"
              variant={moderationAction === 'ban' ? 'destructive' : 'default'}
              disabled={moderating || (moderationAction === 'ban' && !moderationReason.trim())}
              onClick={submitModeration}
            >
              {moderating ? 'Submitting…' : `Confirm ${MODERATION_COPY[moderationAction].verb}`}
            </Button>
          </div>
        )}
      </Dialog>
    </div>
  )
}
