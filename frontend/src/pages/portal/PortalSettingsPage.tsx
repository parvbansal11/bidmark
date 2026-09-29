import { useState } from 'react'
import { PageHeader, Section, Alert } from '@/components/ui/Misc'
import { Card, CardContent } from '@/components/ui/Card'
import { useAuth } from '@/context/AuthContext'
import { Bell, Lock, Monitor } from 'lucide-react'

export function PortalSettingsPage() {
  const { user, logout } = useAuth()
  const [emailNotifs, setEmailNotifs] = useState(true)
  const [deadlineReminders, setDeadlineReminders] = useState(true)

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Your account and notification preferences." />

      <Section title="Account">
        <Card>
          <CardContent className="space-y-1 py-4 text-sm">
            <p><span className="text-slate-500">Name:</span> {user?.full_name}</p>
            <p><span className="text-slate-500">Email:</span> {user?.email}</p>
            <p><span className="text-slate-500">Account type:</span> Bidder</p>
          </CardContent>
        </Card>
      </Section>

      <Section title="Notification preferences" description="Choose what you'd like to be notified about.">
        <Card>
          <CardContent className="space-y-3 py-4">
            <Toggle icon={Bell} label="Email me about document and tender status changes" checked={emailNotifs} onChange={setEmailNotifs} />
            <Toggle icon={Bell} label="Remind me before submission deadlines" checked={deadlineReminders} onChange={setDeadlineReminders} />
          </CardContent>
        </Card>
      </Section>

      <Section title="Security" description="Manage your session and password.">
        <Card>
          <CardContent className="space-y-3 py-4">
            <div className="flex items-center gap-2 text-sm text-slate-700">
              <Monitor className="h-4 w-4 text-slate-400" /> You're currently signed in on this device.
            </div>
            <Alert tone="info">
              <Lock className="mr-1 inline h-3 w-3" /> Self-service password reset isn't available yet — contact your procurement office to reset your password.
            </Alert>
            <button onClick={logout} className="text-xs font-medium text-red-600 hover:underline">
              Sign out of this session
            </button>
          </CardContent>
        </Card>
      </Section>
    </div>
  )
}

function Toggle({ icon: Icon, label, checked, onChange }: { icon: typeof Bell; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-2 text-slate-700">
        <Icon className="h-4 w-4 text-slate-400" /> {label}
      </span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-slate-300'}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
    </label>
  )
}
