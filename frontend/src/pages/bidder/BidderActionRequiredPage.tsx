import { useState } from 'react'
import { PageHeader } from '@/components/ui/Misc'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input, Label } from '@/components/ui/Input'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Upload,
  CheckCircle2,
  FileCheck,
  Clock,
  ArrowRight,
  ShieldCheck,
  HelpCircle,
} from 'lucide-react'

interface ActionTask {
  id: string
  priority: 'CRITICAL' | 'NEEDS ATTENTION' | 'COMPLETED'
  title: string
  description: string
  tender_ref: string
  action_label: string
  action_type: 'upload' | 'review' | 'resolve'
}

const INITIAL_TASKS: ActionTask[] = [
  {
    id: 'task-1',
    priority: 'CRITICAL',
    title: 'Upload missing OEM Authorization',
    description: 'Mandatory OEM letter missing for valve manufacturer on Process Control Valves tender.',
    tender_ref: 'CPCL/GEM/2026/105',
    action_label: 'Upload OEM Letter',
    action_type: 'upload',
  },
  {
    id: 'task-2',
    priority: 'NEEDS ATTENTION',
    title: 'Replace expired Experience Certificate',
    description: 'Submitted experience certificate date exceeds the 3-year validity window specified in tender criteria.',
    tender_ref: 'GEM/2026/B/891230',
    action_label: 'Replace Certificate',
    action_type: 'upload',
  },
  {
    id: 'task-3',
    priority: 'NEEDS ATTENTION',
    title: 'Correct GST information mismatch',
    description: 'Your GST information requires correction. Please review your GSTIN and uploaded certificate.',
    tender_ref: 'CPCL/GEM/2026/105',
    action_label: 'Review & Correct GSTIN',
    action_type: 'review',
  },
  {
    id: 'task-4',
    priority: 'NEEDS ATTENTION',
    title: 'Submit missing technical document',
    description: 'Technical Datasheet for Process Control Valve Model X200 is required for final eligibility.',
    tender_ref: 'CPCL/GEM/2026/105',
    action_label: 'Submit Document',
    action_type: 'upload',
  },
  {
    id: 'task-5',
    priority: 'COMPLETED',
    title: 'PAN verified',
    description: 'Permanent Account Number AAACA1234F verified successfully with Income Tax Department records.',
    tender_ref: 'All Tenders',
    action_label: 'View Verification',
    action_type: 'resolve',
  },
  {
    id: 'task-6',
    priority: 'COMPLETED',
    title: 'Udyam verified',
    description: 'Udyam MSME Registration UDYAM-TN-02-0012345 verified with MSME Portal.',
    tender_ref: 'All Tenders',
    action_label: 'View Verification',
    action_type: 'resolve',
  },
]

export function BidderActionRequiredPage() {
  const [tasks, setTasks] = useState<ActionTask[]>(INITIAL_TASKS)
  const [activeTask, setActiveTask] = useState<ActionTask | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const criticalTasks = tasks.filter((t) => t.priority === 'CRITICAL')
  const needsAttentionTasks = tasks.filter((t) => t.priority === 'NEEDS ATTENTION')
  const completedTasks = tasks.filter((t) => t.priority === 'COMPLETED')

  function handleActionClick(task: ActionTask) {
    if (task.priority === 'COMPLETED') return
    setActiveTask(task)
    setDialogOpen(true)
  }

  function handleResolveSubmit() {
    if (!activeTask) return
    setSubmitting(true)
    setTimeout(() => {
      setTasks(
        tasks.map((t) =>
          t.id === activeTask.id
            ? { ...t, priority: 'COMPLETED', title: `${t.title} (Resolved)`, description: 'Task successfully resolved and re-submitted.' }
            : t
        )
      )
      setSubmitting(false)
      setDialogOpen(false)
      setActiveTask(null)
    }, 800)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Action Required Center"
        description="Task-oriented action list for resolving document issues, updating certificates, and completing tender requirements."
      />

      {/* Critical Tasks Section */}
      {criticalTasks.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-red-600 font-semibold text-sm">
            <AlertTriangle className="h-4 w-4" /> Critical Priorities ({criticalTasks.length})
          </div>
          <div className="space-y-3">
            {criticalTasks.map((t) => (
              <Card key={t.id} className="border-red-200 bg-red-50/30">
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold bg-red-600 text-white px-2 py-0.5 rounded uppercase tracking-wider">
                        CRITICAL
                      </span>
                      <span className="text-xs font-mono text-slate-500">{t.tender_ref}</span>
                    </div>
                    <h4 className="text-sm font-semibold text-slate-900">{t.title}</h4>
                    <p className="text-xs text-slate-600">{t.description}</p>
                  </div>

                  <Button
                    size="sm"
                    className="h-8 text-xs bg-red-600 hover:bg-red-700 text-white shrink-0"
                    onClick={() => handleActionClick(t)}
                  >
                    <Upload className="h-3.5 w-3.5 mr-1" /> {t.action_label}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Needs Attention Section */}
      {needsAttentionTasks.length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-2 text-amber-600 font-semibold text-sm">
            <Clock className="h-4 w-4" /> Needs Attention ({needsAttentionTasks.length})
          </div>
          <div className="space-y-3">
            {needsAttentionTasks.map((t) => (
              <Card key={t.id} className="border-amber-200 bg-amber-50/20">
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold bg-amber-500 text-white px-2 py-0.5 rounded uppercase tracking-wider">
                        NEEDS ATTENTION
                      </span>
                      <span className="text-xs font-mono text-slate-500">{t.tender_ref}</span>
                    </div>
                    <h4 className="text-sm font-semibold text-slate-900">{t.title}</h4>
                    <p className="text-xs text-slate-600">{t.description}</p>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs border-amber-300 text-amber-900 hover:bg-amber-100 shrink-0"
                    onClick={() => handleActionClick(t)}
                  >
                    {t.action_label}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Completed Section */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center gap-2 text-emerald-600 font-semibold text-sm">
          <CheckCircle2 className="h-4 w-4" /> Completed Verification Tasks ({completedTasks.length})
        </div>
        <div className="space-y-3">
          {completedTasks.map((t) => (
            <Card key={t.id} className="border-slate-200 bg-slate-50/50">
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded uppercase">
                      COMPLETED ✓
                    </span>
                    <span className="text-xs font-mono text-slate-400">{t.tender_ref}</span>
                  </div>
                  <h4 className="text-sm font-semibold text-slate-700">{t.title}</h4>
                  <p className="text-xs text-slate-500">{t.description}</p>
                </div>

                <span className="text-xs font-medium text-emerald-600 flex items-center gap-1 shrink-0">
                  <ShieldCheck className="h-4 w-4" /> Verified
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Resolve Action Modal */}
      {activeTask && (
        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={`Resolve Task: ${activeTask.title}`}>
          <div className="space-y-4">
            <div className="bg-slate-50 p-3 rounded border border-slate-200 text-xs text-slate-700 space-y-1">
              <p className="font-semibold text-slate-900">{activeTask.title}</p>
              <p>{activeTask.description}</p>
              <p className="font-mono text-[11px] text-slate-500 pt-1">Applicable Tender: {activeTask.tender_ref}</p>
            </div>

            <div className="space-y-2">
              <Label>Upload Replacement Document / Proof *</Label>
              <Input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleResolveSubmit} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700">
                {submitting ? 'Submitting & Verifying…' : 'Submit & Resolve Task'}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}
