import { useState } from 'react'
import { PageHeader } from '@/components/ui/Misc'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  Clock,
  FileCheck,
  Building2,
  Check,
  Trash2,
} from 'lucide-react'

interface NotificationItem {
  id: string
  title: string
  message: string
  type: 'VERIFICATION' | 'EXPIRY' | 'REQUEST' | 'STATUS_CHANGE' | 'SUCCESS'
  timestamp: string
  read: boolean
}

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'n-1',
    title: 'Tender deadline approaching',
    message: 'Bid submission deadline for Tender Ref: CPCL/GEM/2026/105 ends in 24 hours.',
    type: 'EXPIRY',
    timestamp: '10 mins ago',
    read: false,
  },
  {
    id: 'n-2',
    title: 'Document expiring soon',
    message: 'Your GST Registration Certificate is set to expire on 31 Dec 2026. Please prepare renewal.',
    type: 'EXPIRY',
    timestamp: '2 hours ago',
    read: false,
  },
  {
    id: 'n-3',
    title: 'Document successfully verified ✓',
    message: 'PAN Card AAACA1234F verified with 100% match on Income Tax Govt Registry.',
    type: 'VERIFICATION',
    timestamp: 'Yesterday',
    read: true,
  },
  {
    id: 'n-4',
    title: 'Document verification issue',
    message: 'Your GST information requires correction. Please review your GSTIN and uploaded certificate.',
    type: 'REQUEST',
    timestamp: '2 days ago',
    read: false,
  },
  {
    id: 'n-5',
    title: 'Additional document requested',
    message: 'Procurement Officer requested an updated Class 1 Local Content Declaration for CPCL Tender.',
    type: 'REQUEST',
    timestamp: '3 days ago',
    read: true,
  },
  {
    id: 'n-6',
    title: 'Tender status changed',
    message: 'Petroleum Equipment Tender (GEM/2026/B/891230) status moved to Under Technical Evaluation.',
    type: 'STATUS_CHANGE',
    timestamp: '5 days ago',
    read: true,
  },
  {
    id: 'n-7',
    title: 'Bid submitted successfully',
    message: 'Your technical and financial bid for Process Control Valves Tender was submitted successfully.',
    type: 'SUCCESS',
    timestamp: '1 week ago',
    read: true,
  },
]

export function BidderNotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS)
  const [filter, setFilter] = useState<'All' | 'Unread'>('All')

  const filtered = notifications.filter((n) => {
    if (filter === 'Unread') return !n.read
    return true
  })

  function toggleRead(id: string) {
    setNotifications(notifications.map((n) => (n.id === id ? { ...n, read: !n.read } : n)))
  }

  function markAllRead() {
    setNotifications(notifications.map((n) => ({ ...n, read: true })))
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notification Center"
        description="Real-time alerts on tender deadlines, document verifications, status updates, and officer requests."
        actions={
          <Button variant="outline" size="sm" onClick={markAllRead}>
            <Check className="h-4 w-4 mr-1" /> Mark All as Read
          </Button>
        }
      />

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setFilter('All')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            filter === 'All'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          All Notifications ({notifications.length})
        </button>
        <button
          onClick={() => setFilter('Unread')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            filter === 'Unread'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          Unread ({notifications.filter((n) => !n.read).length})
        </button>
      </div>

      {/* Notifications List */}
      <div className="space-y-2.5">
        {filtered.map((n) => (
          <Card
            key={n.id}
            className={`border-slate-200 transition-colors ${!n.read ? 'bg-blue-50/40 border-blue-200' : 'bg-white'}`}
          >
            <CardContent className="p-4 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div
                  className={`p-2 rounded-full mt-0.5 shrink-0 ${
                    n.type === 'VERIFICATION' || n.type === 'SUCCESS'
                      ? 'bg-emerald-100 text-emerald-700'
                      : n.type === 'EXPIRY' || n.type === 'REQUEST'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  {n.type === 'VERIFICATION' || n.type === 'SUCCESS' ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : n.type === 'EXPIRY' || n.type === 'REQUEST' ? (
                    <AlertTriangle className="h-4 w-4" />
                  ) : (
                    <Bell className="h-4 w-4" />
                  )}
                </div>

                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-semibold text-slate-900">{n.title}</h4>
                    {!n.read && <span className="h-2 w-2 rounded-full bg-blue-600"></span>}
                  </div>
                  <p className="text-xs text-slate-600">{n.message}</p>
                  <p className="text-[10px] text-slate-400 pt-1">{n.timestamp}</p>
                </div>
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[11px] text-slate-400 hover:text-slate-700"
                onClick={() => toggleRead(n.id)}
              >
                {n.read ? 'Mark Unread' : 'Mark Read'}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
