import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, FullPageSpinner } from '@/components/ui/Misc'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useAuth } from '@/context/AuthContext'
import * as tendersApi from '@/api/tenders'
import * as biddersApi from '@/api/bidders'
import type { Tender, Bidder } from '@/types'
import {
  FileStack,
  FileCheck,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  Bell,
  Clock,
  ExternalLink,
  Building2,
  CheckCircle2,
} from 'lucide-react'

import * as portalApi from '@/api/portal'

export function BidderDashboardPage() {
  const { user } = useAuth()
  const [tenders, setTenders] = useState<Tender[]>([])
  const [bidder, setBidder] = useState<Bidder | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      tendersApi.listTenders().catch(() => []),
      portalApi.getProfile().catch(() => null),
    ])
      .then(([tList, bProfile]) => {
        setTenders(tList || [])
        if (bProfile) setBidder(bProfile)
      })
      .catch((err) => {
        console.error('Error loading bidder dashboard:', err)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <FullPageSpinner label="Loading Bidder Portal…" />

  const displayName = user?.full_name || 'Sneha Rani'

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title={`Welcome, ${displayName}`}
        description="GeM Bidder Compliance & Participation Portal"
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-200">
          <CardContent className="flex items-center gap-3.5 py-4">
            <div className="rounded-lg bg-blue-50 p-2.5 text-blue-600">
              <FileStack className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{tenders.length || 4}</p>
              <p className="text-xs font-medium text-slate-500">Active Tenders</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="flex items-center gap-3.5 py-4">
            <div className="rounded-lg bg-emerald-50 p-2.5 text-emerald-600">
              <FileCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">8</p>
              <p className="text-xs font-medium text-slate-500">Documents Submitted</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="flex items-center gap-3.5 py-4">
            <div className="rounded-lg bg-indigo-50 p-2.5 text-indigo-600">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">86%</p>
              <p className="text-xs font-medium text-slate-500">Overall Compliance %</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="flex items-center gap-3.5 py-4">
            <div className="rounded-lg bg-amber-50 p-2.5 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">3</p>
              <p className="text-xs font-medium text-slate-500">Actions Required</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Grid: Urgent Tasks & My Active Tenders */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Action Required Urgent Panel */}
        <Card className="border-slate-200 lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Action Required Panel
            </CardTitle>
            <Link to="/action-required" className="text-xs font-medium text-blue-600 hover:underline">
              View All
            </Link>
          </CardHeader>
          <CardContent className="divide-y divide-slate-100 py-2">
            <div className="py-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded">CRITICAL</span>
                <span className="text-[10px] text-slate-400">Due Today</span>
              </div>
              <p className="text-xs font-medium text-slate-800">OEM Authorization missing</p>
              <p className="text-[11px] text-slate-500">Upload official OEM Authorization Letter for Tender #CPCL/GEM/2026/105.</p>
              <Link to="/action-required">
                <Button size="sm" className="mt-2 h-7 text-xs w-full bg-red-600 hover:bg-red-700">
                  Upload OEM Letter
                </Button>
              </Link>
            </div>

            <div className="py-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">NEEDS ATTENTION</span>
                <span className="text-[10px] text-slate-400">2 Days Left</span>
              </div>
              <p className="text-xs font-medium text-slate-800">Experience Certificate needs replacement</p>
              <p className="text-[11px] text-slate-500">Previous certificate is missing mandatory seal verification.</p>
              <Link to="/action-required">
                <Button size="sm" variant="outline" className="mt-2 h-7 text-xs w-full">
                  Replace Certificate
                </Button>
              </Link>
            </div>

            <div className="py-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">EXPIRING SOON</span>
                <span className="text-[10px] text-slate-400">Expires in 15d</span>
              </div>
              <p className="text-xs font-medium text-slate-800">GST certificate expiring soon</p>
              <p className="text-[11px] text-slate-500">Upload your latest GST registration return copy.</p>
              <Link to="/my-documents">
                <Button size="sm" variant="outline" className="mt-2 h-7 text-xs w-full">
                  Renew Document
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Active Participating Tenders */}
        <Card className="border-slate-200 lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 pb-3">
            <CardTitle className="text-sm font-semibold text-slate-800">My Active Tenders</CardTitle>
            <Link to="/my-tenders">
              <Button variant="outline" size="sm" className="h-7 text-xs">
                Manage All Tenders <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="divide-y divide-slate-100 py-1">
            {tenders.slice(0, 4).map((t, idx) => {
              const complianceScore = idx === 0 ? 92 : idx === 1 ? 74 : 88
              const docStatus = idx === 0 ? '5/5 Complete' : idx === 1 ? '3/5 Pending' : '4/5 Complete'
              return (
                <div key={t.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                        Ref: {t.tender_number}
                      </span>
                      <Badge tone={t.status === 'ACTIVE' ? 'success' : 'muted'}>{t.status}</Badge>
                    </div>
                    <h4 className="text-xs font-semibold text-slate-900 line-clamp-1">{t.title}</h4>
                    <p className="text-[11px] text-slate-500 flex items-center gap-1">
                      <Building2 className="h-3 w-3 text-slate-400" /> {t.department}
                    </p>
                  </div>

                  <div className="flex items-center gap-4 text-xs">
                    <div className="text-right">
                      <p className="font-semibold text-slate-800">{complianceScore}% Compliant</p>
                      <p className="text-[10px] text-slate-400">{docStatus}</p>
                    </div>

                    <Link to="/my-tenders">
                      <Button size="sm" variant="secondary" className="h-7 text-xs">
                        View Details
                      </Button>
                    </Link>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>

      {/* Notifications Preview */}
      <Card className="border-slate-200">
        <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Bell className="h-4 w-4 text-blue-600" /> Recent Notifications
          </CardTitle>
          <Link to="/notifications" className="text-xs font-medium text-blue-600 hover:underline">
            Notification Center →
          </Link>
        </CardHeader>
        <CardContent className="divide-y divide-slate-100 py-1">
          <div className="py-2.5 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2.5">
              <span className="h-2 w-2 rounded-full bg-blue-600"></span>
              <p className="font-medium text-slate-800">PAN Card successfully verified ✓</p>
            </div>
            <span className="text-[10px] text-slate-400">2 hours ago</span>
          </div>

          <div className="py-2.5 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2.5">
              <span className="h-2 w-2 rounded-full bg-amber-500"></span>
              <p className="font-medium text-slate-800">Additional document requested by Procurement Officer for CPCL Refinery Tender</p>
            </div>
            <span className="text-[10px] text-slate-400">Yesterday</span>
          </div>

          <div className="py-2.5 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
              <p className="font-medium text-slate-800">Bid submitted successfully for Industrial Safety Equipment Tender</p>
            </div>
            <span className="text-[10px] text-slate-400">3 days ago</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
