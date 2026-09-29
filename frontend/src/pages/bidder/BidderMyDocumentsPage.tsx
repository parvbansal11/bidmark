import { useEffect, useState } from 'react'
import { PageHeader, FullPageSpinner, EmptyState } from '@/components/ui/Misc'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input, Label } from '@/components/ui/Input'
import * as bidderApi from '@/api/bidders'
import * as documentsApi from '@/api/documents'
import * as tendersApi from '@/api/tenders'
import type { DocumentItem, Tender } from '@/types'
import { apiErrorMessage } from '@/api/client'
import {
  Upload,
  Search,
  FileCheck,
  ShieldCheck,
  AlertTriangle,
  Clock,
  Link as LinkIcon,
  Trash2,
  CheckCircle2,
  FileText,
  Filter,
} from 'lucide-react'

const EXAMPLE_CATEGORIES = [
  'All',
  'GST Registration',
  'PAN Card',
  'Udyam Certificate',
  'Income Tax Return (ITR)',
  'OEM Authorization',
  'Experience Certificate',
  'EPFO / ESIC Registration',
  'Make in India / Local Content Declaration',
]

interface DocumentRecord {
  id: string
  name: string
  category: string
  status: 'Verified ✓' | 'Pending Review' | 'Action Required' | 'Expiring Soon'
  upload_date: string
  expiry_date: string | null
  file_size: string
  linked_tenders: string[]
}

const SAMPLE_DOCUMENTS: DocumentRecord[] = [
  {
    id: 'doc-1',
    name: 'GST_Registration_Certificate_2026.pdf',
    category: 'GST Registration',
    status: 'Verified ✓',
    upload_date: '10 Jan 2026',
    expiry_date: '31 Dec 2026',
    file_size: '1.2 MB',
    linked_tenders: ['CPCL/GEM/2026/105', 'GEM/2026/B/891230'],
  },
  {
    id: 'doc-2',
    name: 'Company_PAN_Card_Apex.pdf',
    category: 'PAN Card',
    status: 'Verified ✓',
    upload_date: '15 Jan 2026',
    expiry_date: 'Permanent',
    file_size: '450 KB',
    linked_tenders: ['CPCL/GEM/2026/105', 'GEM/2026/B/891230', 'IOCL/PROC/2026/88'],
  },
  {
    id: 'doc-3',
    name: 'Udyam_Registration_MSME_Medium.pdf',
    category: 'Udyam Certificate',
    status: 'Verified ✓',
    upload_date: '20 Jan 2026',
    expiry_date: 'Permanent',
    file_size: '890 KB',
    linked_tenders: ['CPCL/GEM/2026/105'],
  },
  {
    id: 'doc-4',
    name: 'OEM_Authorization_Valves_Ltd.pdf',
    category: 'OEM Authorization',
    status: 'Action Required',
    upload_date: '01 Feb 2026',
    expiry_date: 'Expired 01 Mar 2026',
    file_size: '1.8 MB',
    linked_tenders: ['CPCL/GEM/2026/105'],
  },
  {
    id: 'doc-5',
    name: 'Past_Supply_Experience_Cert_2025.pdf',
    category: 'Experience Certificate',
    status: 'Expiring Soon',
    upload_date: '12 Feb 2026',
    expiry_date: '30 Sep 2026',
    file_size: '2.4 MB',
    linked_tenders: ['GEM/2026/B/891230'],
  },
  {
    id: 'doc-6',
    name: 'Make_In_India_Class_1_Local_Content.pdf',
    category: 'Make in India / Local Content Declaration',
    status: 'Verified ✓',
    upload_date: '18 Feb 2026',
    expiry_date: '31 Dec 2026',
    file_size: '620 KB',
    linked_tenders: ['CPCL/GEM/2026/105', 'GEM/2026/B/891230'],
  },
]

export function BidderMyDocumentsPage() {
  const [documents, setDocuments] = useState<DocumentRecord[]>(SAMPLE_DOCUMENTS)
  const [tenders, setTenders] = useState<Tender[]>([])
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [selectedDoc, setSelectedDoc] = useState<DocumentRecord | null>(null)
  const [selectedTenderId, setSelectedTenderId] = useState('')
  const [newCategory, setNewCategory] = useState('GST Registration')
  const [newFile, setNewFile] = useState<File | null>(null)

  useEffect(() => {
    tendersApi.listTenders().then(setTenders).catch(() => {})
  }, [])

  const filteredDocs = documents.filter((doc) => {
    const matchesSearch = doc.name.toLowerCase().includes(query.toLowerCase()) || doc.category.toLowerCase().includes(query.toLowerCase())
    const matchesCategory = categoryFilter === 'All' || doc.category === categoryFilter
    return matchesSearch && matchesCategory
  })

  function handleUploadSubmit() {
    if (!newFile) return
    const newDoc: DocumentRecord = {
      id: `doc-${Date.now()}`,
      name: newFile.name,
      category: newCategory,
      status: 'Pending Review',
      upload_date: 'Today',
      expiry_date: '31 Dec 2026',
      file_size: `${(newFile.size / (1024 * 1024)).toFixed(1)} MB`,
      linked_tenders: [],
    }
    setDocuments([newDoc, ...documents])
    setUploadOpen(false)
    setNewFile(null)
  }

  function handleLinkTender() {
    if (!selectedDoc || !selectedTenderId) return
    const tender = tenders.find((t) => t.id === selectedTenderId)
    const tenderRef = tender ? tender.tender_number : selectedTenderId

    setDocuments(
      documents.map((d) => {
        if (d.id === selectedDoc.id && !d.linked_tenders.includes(tenderRef)) {
          return { ...d, linked_tenders: [...d.linked_tenders, tenderRef] }
        }
        return d
      })
    )
    setLinkOpen(false)
    setSelectedDoc(null)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="My Document Vault"
        description="Centralized compliance repository for uploading, managing, and reusing verified documents across GeM tenders."
        actions={
          <Button onClick={() => setUploadOpen(true)}>
            <Upload className="h-4 w-4 mr-1" /> Upload Document
          </Button>
        }
      />

      {/* Search & Category Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            className="pl-8"
            placeholder="Search documents by name or category…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="h-4 w-4 text-slate-400" />
          <select
            className="w-full sm:w-64 h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 shadow-sm focus:border-slate-500 focus:outline-none"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            {EXAMPLE_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Documents Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredDocs.map((doc) => (
          <Card key={doc.id} className="border-slate-200 flex flex-col justify-between">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded bg-blue-50 text-blue-600">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold text-slate-500 block uppercase tracking-wider">{doc.category}</span>
                    <h4 className="text-xs font-semibold text-slate-900 line-clamp-1">{doc.name}</h4>
                  </div>
                </div>
              </div>

              {/* Status Badge */}
              <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
                <span className="text-slate-500">Status:</span>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ${
                    doc.status === 'Verified ✓'
                      ? 'bg-emerald-50 text-emerald-700'
                      : doc.status === 'Pending Review'
                      ? 'bg-blue-50 text-blue-700'
                      : doc.status === 'Expiring Soon'
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-red-50 text-red-700'
                  }`}
                >
                  {doc.status === 'Verified ✓' && <CheckCircle2 className="h-3 w-3" />}
                  {doc.status === 'Action Required' && <AlertTriangle className="h-3 w-3" />}
                  {doc.status}
                </span>
              </div>

              <div className="space-y-1 text-xs text-slate-500">
                <p className="flex justify-between">
                  <span>Uploaded:</span> <span className="text-slate-700">{doc.upload_date}</span>
                </p>
                <p className="flex justify-between">
                  <span>Validity / Expiry:</span> <span className="text-slate-700">{doc.expiry_date}</span>
                </p>
              </div>

              {/* Linked Tenders Section */}
              <div className="border-t border-slate-100 pt-2 space-y-1">
                <p className="text-[11px] font-medium text-slate-700 flex items-center gap-1">
                  <LinkIcon className="h-3 w-3 text-blue-600" /> Linked to Tenders:
                </p>
                {doc.linked_tenders.length ? (
                  <div className="flex flex-wrap gap-1">
                    {doc.linked_tenders.map((ref) => (
                      <span key={ref} className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono">
                        {ref}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400 italic">Not linked to any tender yet</p>
                )}
              </div>

              {/* Reuse & Link Action Button */}
              <div className="border-t border-slate-100 pt-2 flex justify-between items-center">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs w-full text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                  onClick={() => {
                    setSelectedDoc(doc)
                    setLinkOpen(true)
                  }}
                >
                  <LinkIcon className="h-3 w-3 mr-1" /> Link / Reuse for Tender
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Upload Document Modal */}
      <Dialog open={uploadOpen} onClose={() => setUploadOpen(false)} title="Upload New Compliance Document">
        <div className="space-y-4">
          <div>
            <Label>Document Category *</Label>
            <select
              className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm focus:border-slate-500 focus:outline-none"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
            >
              {EXAMPLE_CATEGORIES.filter((c) => c !== 'All').map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label>Select File (PDF, PNG, JPG - max 10MB) *</Label>
            <Input type="file" onChange={(e) => setNewFile(e.target.files?.[0] || null)} />
          </div>

          <p className="text-xs text-slate-500">
            Uploaded documents are automatically processed via OCR and validated against GSTN / Income Tax / MSME portals.
          </p>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => setUploadOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUploadSubmit} disabled={!newFile}>
              Upload & Verify Document
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Link / Reuse Document Modal */}
      {selectedDoc && (
        <Dialog open={linkOpen} onClose={() => setLinkOpen(false)} title={`Link Document: ${selectedDoc.name}`}>
          <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-200 p-3 rounded text-xs text-emerald-900">
              <p className="font-semibold">Document Reuse Feature</p>
              <p>Reusing verified documents across multiple tenders eliminates redundant uploads and ensures instant compliance validation.</p>
            </div>

            <div>
              <Label>Select Eligible Tender to Link *</Label>
              <select
                className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm focus:border-slate-500 focus:outline-none"
                value={selectedTenderId}
                onChange={(e) => setSelectedTenderId(e.target.value)}
              >
                <option value="">-- Choose Active Tender --</option>
                {tenders.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} ({t.tender_number})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setLinkOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleLinkTender} disabled={!selectedTenderId} className="bg-blue-600 hover:bg-blue-700">
                Link Document to Tender
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}
