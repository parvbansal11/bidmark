import { useEffect, useState } from 'react'
import { PageHeader, FullPageSpinner, EmptyState } from '@/components/ui/Misc'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import * as portalApi from '@/api/portal'
import type { PortalNotification } from '@/types'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Bell, CheckCheck } from 'lucide-react'

export function PortalNotificationsPage() {
  const [notifications, setNotifications] = useState<PortalNotification[]>([])
  const [loading, setLoading] = useState(true)

  function refresh() {
    setLoading(true)
    portalApi.getNotifications().then(setNotifications).finally(() => setLoading(false))
  }

  useEffect(refresh, [])

  async function markRead(n: PortalNotification) {
    if (n.is_read) return
    await portalApi.markNotificationRead(n.id)
    refresh()
  }

  async function markAllRead() {
    await portalApi.markAllNotificationsRead()
    refresh()
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notifications"
        description="Deadlines, document status changes and bid updates."
        actions={
          unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={markAllRead}>
              <CheckCheck className="h-4 w-4" /> Mark all as read
            </Button>
          )
        }
      />

      {loading ? (
        <FullPageSpinner />
      ) : !notifications.length ? (
        <EmptyState title="No notifications yet" description="You'll see updates here as your tenders and documents progress." />
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <Card
              key={n.id}
              className={cn('cursor-pointer transition-colors', !n.is_read && 'border-blue-200 bg-blue-50/40')}
              onClick={() => markRead(n)}
            >
              <CardContent className="flex items-start gap-3 py-3">
                <div className={cn('mt-0.5 rounded-full p-1.5', n.is_read ? 'bg-slate-100 text-slate-400' : 'bg-blue-100 text-blue-600')}>
                  <Bell className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className={cn('text-sm', n.is_read ? 'font-medium text-slate-700' : 'font-semibold text-slate-900')}>{n.title}</p>
                    <span className="flex-shrink-0 text-[11px] text-slate-400">{formatDate(n.created_at)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">{n.message}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
