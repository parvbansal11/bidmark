import { useEffect, useState } from 'react'
import { PageHeader, Section, Alert } from '@/components/ui/Misc'
import { Card, CardContent } from '@/components/ui/Card'
import { useAuth } from '@/context/AuthContext'
import * as documentsApi from '@/api/documents'
import { API_BASE_URL } from '@/api/client'

export function SettingsPage() {
  const { user } = useAuth()
  const [registries, setRegistries] = useState<string[]>([])

  useEffect(() => {
    documentsApi.listRegistries().then(setRegistries).catch(() => setRegistries([]))
  }, [])

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Session, environment and platform information." />

      <Section title="Account">
        <Card>
          <CardContent className="space-y-1 py-4 text-sm">
            <p><span className="text-slate-500">Name:</span> {user?.full_name}</p>
            <p><span className="text-slate-500">Email:</span> {user?.email}</p>
            <p><span className="text-slate-500">Role:</span> {user?.role}</p>
          </CardContent>
        </Card>
      </Section>

      <Section title="API connection">
        <Card>
          <CardContent className="py-4 text-sm text-slate-600">
            Backend API base URL: <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{API_BASE_URL}</code>
          </CardContent>
        </Card>
      </Section>

      <Section title="Mock Government Verification API Gateway" description="Every registry below is simulated for this prototype — no real government or GeM system is ever contacted.">
        <div className="flex flex-wrap gap-2">
          {registries.map((r) => (
            <span key={r} className="mock-badge rounded-md border border-amber-200 px-2.5 py-1 text-xs font-medium text-amber-800">
              {r}
            </span>
          ))}
        </div>
        <Alert tone="warning" className="mt-3">
          All responses from this gateway are tagged <code>source: "MOCK_GOVERNMENT_API"</code> and <code>is_mock: true</code>. This platform never claims real government API access.
        </Alert>
      </Section>

      <Section title="Responsible AI disclaimer">
        <Alert tone="info">
          AI-generated scores and recommendations in this platform are decision-support only. The system never issues a final qualification, disqualification, or fraud determination — that
          responsibility always rests with a human Procurement Officer.
        </Alert>
      </Section>
    </div>
  )
}
