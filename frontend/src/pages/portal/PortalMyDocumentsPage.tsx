import { useEffect, useState } from 'react'
import { PageHeader, FullPageSpinner, EmptyState, Alert } from '@/components/ui/Misc'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { StatusBadge } from '@/components/RiskBadge'
import * as portalApi from '@/api/portal'
import * as documentsApi from '@/api/documents'
import { DOCUMENT_CATEGORIES } from '@/types'
import type { PortalDocument } from '@/types'
import { formatDateOnly, titleCase } from '@/lib/utils'
import { apiErrorMessage } from '@/api/client'
import { Eye, Search, UploadCloud } from 'lucide-react'

export function PortalMyDocumentsPage() {
  const [documents, setDocuments] = useState<PortalDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>('GST')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewingId, setViewingId] = useState<string | null>(null)

  function refresh() {
    setLoading(true)
    portalApi.getMyDocuments().then(setDocuments).finally(() => setLoading(false))
  }

  useEffect(refresh, [])

  async function handleUpload(file: File) {
    setUploading(true)
    setError(null)
    try {
      const profile = await portalApi.getProfile()
      const doc = await documentsApi.uploadDocument(profile.id, category, file)
      await documentsApi.extractDocument(doc.id)
      await documentsApi.verifyDocument(doc.id)
      refresh()
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  const filtered = documents.filter((d) => d.label.toLowerCase().includes(query.toLowerCase()) || d.original_filename.toLowerCase().includes(query.toLowerCase()))

  async function handleView(doc: PortalDocument) {
    setViewingId(doc.id)
    setError(null)
    try {
      await documentsApi.viewDocumentFile(doc)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setViewingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="My Documents" description="Your document vault — upload once, reuse a verified document across every eligible tender." />

      <Alert tone="info">
        A document marked <strong>Verified</strong> here does not need to be re-uploaded for another tender that requires the same document type — just upload it once from this page (without
        linking it to a specific tender) and it will be recognized automatically.
      </Alert>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input className="pl-8" placeholder="Search documents…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-56">
          {DOCUMENT_CATEGORIES.filter((c) => c !== 'DEBARMENT' && c !== 'DIGILOCKER').map((c) => (
            <option key={c} value={c}>{titleCase(c)}</option>
          ))}
        </Select>
        <input
          type="file"
          className="hidden"
          id="vault-doc-upload"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleUpload(file)
            e.target.value = ''
          }}
        />
        <Button disabled={uploading} onClick={() => document.getElementById('vault-doc-upload')?.click()}>
          <UploadCloud className="h-4 w-4" /> {uploading ? 'Uploading…' : 'Upload Document'}
        </Button>
      </div>

      {loading ? (
        <FullPageSpinner />
      ) : !filtered.length ? (
        <EmptyState title="No documents found" description="Upload your first document to get started." />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((d) => (
            <Card key={d.id}>
              <CardContent className="space-y-2 py-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{d.label}</p>
                  <StatusBadge status={d.status} />
                </div>
                <p className="truncate text-xs text-slate-500">{d.original_filename}</p>
                <p className="text-xs text-slate-400">Uploaded {formatDateOnly(d.uploaded_at)}</p>
                {d.validity_date && <p className="text-xs text-slate-400">Valid until {formatDateOnly(d.validity_date)}</p>}
                {d.reusable && <p className="text-[11px] font-medium text-emerald-600">Reusable across eligible tenders</p>}
                <Button size="sm" variant="outline" disabled={viewingId === d.id} onClick={() => handleView(d)}>
                  <Eye className="h-3.5 w-3.5" /> {viewingId === d.id ? 'Opening…' : 'View'}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
