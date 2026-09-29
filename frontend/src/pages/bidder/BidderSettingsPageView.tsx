import { useState } from 'react'
import { PageHeader } from '@/components/ui/Misc'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Input'
import { useAuth } from '@/context/AuthContext'
import { Key, Bell, Shield, User, Laptop } from 'lucide-react'

export function BidderSettingsPageView() {
  const { user } = useAuth()
  const [emailAlerts, setEmailAlerts] = useState(true)
  const [smsAlerts, setSmsAlerts] = useState(true)
  const [deadlineReminders, setDeadlineReminders] = useState(true)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPass, setChangingPass] = useState(false)
  const [passMessage, setPassMessage] = useState<string | null>(null)

  function handleChangePassword() {
    if (!newPassword || newPassword !== confirmPassword) {
      setPassMessage('Passwords do not match.')
      return
    }
    setChangingPass(true)
    setPassMessage(null)
    setTimeout(() => {
      setChangingPass(false)
      setPassMessage('Password updated successfully!')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    }, 800)
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Bidder Account Settings"
        description="Manage your account preferences, notification alerts, and login security credentials."
      />

      {/* Account Preferences */}
      <Card className="border-slate-200">
        <CardHeader className="border-b border-slate-100 pb-3">
          <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <User className="h-4 w-4 text-blue-600" /> Account & Profile Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Account Full Name</Label>
              <Input value={user?.full_name || 'Sneha Rani'} disabled className="bg-slate-50" />
            </div>
            <div>
              <Label>Registered Email</Label>
              <Input value={user?.email || 'sneha.rani@apexprocess.in'} disabled className="bg-slate-50" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      <Card className="border-slate-200">
        <CardHeader className="border-b border-slate-100 pb-3">
          <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Bell className="h-4 w-4 text-amber-600" /> Notification & Alert Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-3 text-xs divide-y divide-slate-100">
          <div className="py-2 flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-800">Email Notifications</p>
              <p className="text-slate-500">Receive instant email updates for tender status changes and officer requests.</p>
            </div>
            <input
              type="checkbox"
              checked={emailAlerts}
              onChange={(e) => setEmailAlerts(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
          </div>

          <div className="py-2 flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-800">SMS Alerts</p>
              <p className="text-slate-500">Receive SMS notifications for urgent document verification issues.</p>
            </div>
            <input
              type="checkbox"
              checked={smsAlerts}
              onChange={(e) => setSmsAlerts(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
          </div>

          <div className="py-2 flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-800">Tender Deadline Reminders</p>
              <p className="text-slate-500">Receive reminders 48 hours and 24 hours prior to bid submission deadline.</p>
            </div>
            <input
              type="checkbox"
              checked={deadlineReminders}
              onChange={(e) => setDeadlineReminders(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
          </div>
        </CardContent>
      </Card>

      {/* Security & Password */}
      <Card className="border-slate-200">
        <CardHeader className="border-b border-slate-100 pb-3">
          <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Key className="h-4 w-4 text-emerald-600" /> Security & Password
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-3 text-xs">
          <div className="space-y-3 max-w-md">
            <div>
              <Label>Current Password</Label>
              <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </div>

            <div>
              <Label>New Password</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>

            <div>
              <Label>Confirm New Password</Label>
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </div>

            {passMessage && (
              <p className={`text-xs p-2 rounded ${passMessage.includes('success') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                {passMessage}
              </p>
            )}

            <Button size="sm" onClick={handleChangePassword} disabled={changingPass || !newPassword}>
              {changingPass ? 'Updating Password…' : 'Update Password'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Session Security */}
      <Card className="border-slate-200">
        <CardHeader className="border-b border-slate-100 pb-3">
          <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Laptop className="h-4 w-4 text-purple-600" /> Active Session Security
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-2 text-xs">
          <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded border border-slate-200">
            <div>
              <p className="font-semibold text-slate-800">Current Web Session (Linux / Chrome)</p>
              <p className="text-[11px] text-slate-500">IP: 182.73.14.92 • Signed in 2 hours ago</p>
            </div>
            <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-semibold">ACTIVE</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
