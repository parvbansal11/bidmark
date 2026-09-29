import { useEffect, useState } from 'react'
import { PageHeader, FullPageSpinner, EmptyState } from '@/components/ui/Misc'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input, Label, Select } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import * as usersApi from '@/api/users'
import type { AdminUser, UserRole } from '@/types'
import { useAuth } from '@/context/AuthContext'
import { apiErrorMessage } from '@/api/client'
import { formatDateOnly } from '@/lib/utils'
import { Plus, ShieldOff, ShieldCheck } from 'lucide-react'

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Admin',
  PROCUREMENT_OFFICER: 'Procurement Officer',
  BIDDER: 'Bidder',
}

const EMPTY_FORM = { email: '', password: '', full_name: '', role: 'PROCUREMENT_OFFICER' as UserRole, company_name: '' }

export function UserManagementPage() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  function refresh() {
    setLoading(true)
    usersApi.listUsers().then(setUsers).finally(() => setLoading(false))
  }

  useEffect(refresh, [])

  async function handleCreate() {
    setSaving(true)
    setError(null)
    try {
      await usersApi.createUser({
        email: form.email,
        password: form.password,
        full_name: form.full_name,
        role: form.role,
        company_name: form.role === 'BIDDER' ? form.company_name || undefined : undefined,
      })
      setOpen(false)
      setForm(EMPTY_FORM)
      refresh()
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(u: AdminUser) {
    setBusyId(u.id)
    try {
      await usersApi.updateUserStatus(u.id, { is_active: !u.is_active })
      refresh()
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <FullPageSpinner label="Loading users…" />

  return (
    <div className="space-y-4">
      <PageHeader
        title="User Management"
        description="Provision Procurement Officer, Admin, and Bidder accounts. Public self-registration can only ever create a Bidder account."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> New account
          </Button>
        }
      />

      {error && <p className="text-xs text-red-600">{error}</p>}

      {!users.length ? (
        <EmptyState title="No users yet" />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Email</th>
                  <th className="px-4 py-2">Role</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Created</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-2 font-medium text-slate-800">{u.full_name}</td>
                    <td className="px-4 py-2 text-slate-500">{u.email}</td>
                    <td className="px-4 py-2">
                      <Badge tone={u.role === 'ADMIN' ? 'info' : u.role === 'PROCUREMENT_OFFICER' ? 'warning' : 'muted'}>
                        {ROLE_LABELS[u.role]}
                      </Badge>
                    </td>
                    <td className="px-4 py-2">
                      <Badge tone={u.is_active ? 'success' : 'danger'}>{u.is_active ? 'Active' : 'Deactivated'}</Badge>
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-400">{formatDateOnly(u.created_at)}</td>
                    <td className="px-4 py-2 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === u.id || u.id === currentUser?.id}
                        title={u.id === currentUser?.id ? 'You cannot deactivate your own account' : undefined}
                        onClick={() => toggleActive(u)}
                      >
                        {u.is_active ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="Provision a new account">
        <div className="space-y-3">
          <div>
            <Label>Full name</Label>
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <Label>Temporary password</Label>
            <Input type="password" minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div>
            <Label>Role</Label>
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
              <option value="PROCUREMENT_OFFICER">Procurement Officer</option>
              <option value="ADMIN">Admin</option>
              <option value="BIDDER">Bidder</option>
            </Select>
          </div>
          {form.role === 'BIDDER' && (
            <div>
              <Label>Company name (optional)</Label>
              <Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} placeholder="Defaults to full name" />
            </div>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <Button className="w-full" disabled={saving || !form.email || !form.password || !form.full_name} onClick={handleCreate}>
            {saving ? 'Creating…' : 'Create account'}
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
