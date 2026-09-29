import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/RiskBadge'
import { titleCase } from '@/lib/utils'
import * as documentsApi from '@/api/documents'
import { apiErrorMessage } from '@/api/client'
import type { DocumentItem } from '@/types'
import { Eye, FileScan, ScanSearch, ShieldCheck, Trash2 } from 'lucide-react'

export function DocumentList({
  documents,
  onExtract,
  onVerify,
  onDelete,
  onForensics,
  busyId,
}: {
  documents: DocumentItem[]
  onExtract: (doc: DocumentItem) => void
  onVerify: (doc: DocumentItem) => void
  onDelete: (doc: DocumentItem) => void
  onForensics: (doc: DocumentItem) => void
  busyId?: string | null
}) {
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [viewError, setViewError] = useState<string | null>(null)

  async function handleView(doc: DocumentItem) {
    setViewingId(doc.id)
    setViewError(null)
    try {
      await documentsApi.viewDocumentFile(doc)
    } catch (err) {
      setViewError(apiErrorMessage(err))
    } finally {
      setViewingId(null)
    }
  }

  if (!documents.length) {
    return <p className="text-sm text-slate-500">No documents uploaded yet.</p>
  }
  return (
    <div className="space-y-2">
      {viewError && <p className="text-xs text-red-600">{viewError}</p>}
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">File</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {documents.map((d) => (
              <tr key={d.id}>
                <td className="px-3 py-2 font-medium text-slate-800">{titleCase(d.category)}</td>
                <td className="px-3 py-2 text-slate-500">{d.original_filename}</td>
                <td className="px-3 py-2"><StatusBadge status={d.status} /></td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" disabled={viewingId === d.id} onClick={() => handleView(d)} title="View/preview file">
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busyId === d.id} onClick={() => onExtract(d)} title="Run OCR extraction">
                      <FileScan className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busyId === d.id} onClick={() => onVerify(d)} title="Verify via mock government gateway">
                      <ShieldCheck className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busyId === d.id} onClick={() => onForensics(d)} title="Run forensic analysis">
                      <ScanSearch className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busyId === d.id} onClick={() => onDelete(d)} title="Delete document">
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
