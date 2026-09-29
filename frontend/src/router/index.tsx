import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { AppLayout } from '@/layouts/AppLayout'
import { FullPageSpinner } from '@/components/ui/Misc'
import type { UserRole } from '@/types'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { TendersPage } from '@/pages/TendersPage'
import { TenderDetailPage } from '@/pages/TenderDetailPage'
import { BiddersPage } from '@/pages/BiddersPage'
import { BidderProfilePage } from '@/pages/BidderProfilePage'
import { Bidder360Page } from '@/pages/Bidder360Page'
import { ReviewQueuePage } from '@/pages/ReviewQueuePage'
import { ForensicsPage } from '@/pages/ForensicsPage'
import { BehaviorPage } from '@/pages/BehaviorPage'
import { CrossBidderPage } from '@/pages/CrossBidderPage'
import { SimulatorPage } from '@/pages/SimulatorPage'
import { AuditPage } from '@/pages/AuditPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { BidderComparisonPage } from '@/pages/BidderComparisonPage'
import { PortalDashboardPage } from '@/pages/portal/PortalDashboardPage'
import { PortalMyTendersPage } from '@/pages/portal/PortalMyTendersPage'
import { PortalTenderDetailPage } from '@/pages/portal/PortalTenderDetailPage'
import { PortalMyDocumentsPage } from '@/pages/portal/PortalMyDocumentsPage'
import { PortalComplianceStatusPage } from '@/pages/portal/PortalComplianceStatusPage'
import { PortalActionRequiredPage } from '@/pages/portal/PortalActionRequiredPage'
import { PortalSubmissionsPage } from '@/pages/portal/PortalSubmissionsPage'
import { PortalNotificationsPage } from '@/pages/portal/PortalNotificationsPage'
import { PortalProfilePage } from '@/pages/portal/PortalProfilePage'
import { PortalSettingsPage } from '@/pages/portal/PortalSettingsPage'
import { UserManagementPage } from '@/pages/UserManagementPage'
import { BidmarkDashboardPage } from '@/pages/BidmarkDashboardPage'
import { PortalBidmarkStatusPage } from '@/pages/portal/PortalBidmarkStatusPage'

function ProtectedLayout() {
  const { user, loading } = useAuth()
  if (loading) return <FullPageSpinner label="Loading session…" />
  if (!user) return <Navigate to="/login" replace />
  return <AppLayout />
}

/** Restricts a route to specific roles. A role that doesn't match is sent to
 * its own home page rather than seeing (or briefly flashing) the restricted
 * page — this is enforced in the UI in addition to the backend's own RBAC. */
export function RoleRoute({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { user } = useAuth()
  if (!user) return null
  if (!roles.includes(user.role)) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

export const OFFICER_AND_ADMIN: UserRole[] = ['PROCUREMENT_OFFICER', 'ADMIN']
export const BIDDER_ONLY: UserRole[] = ['BIDDER']
export const ADMIN_ONLY: UserRole[] = ['ADMIN']

function RoleAwareDashboard() {
  const { user } = useAuth()
  return user?.role === 'BIDDER' ? <PortalDashboardPage /> : <DashboardPage />
}

function RoleAwareSettings() {
  const { user } = useAuth()
  return user?.role === 'BIDDER' ? <PortalSettingsPage /> : <SettingsPage />
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        {/* Shared, role-aware paths */}
        <Route path="/dashboard" element={<RoleAwareDashboard />} />
        <Route path="/settings" element={<RoleAwareSettings />} />

        {/* Procurement Officer / Admin only */}
        <Route path="/tenders" element={<RoleRoute roles={OFFICER_AND_ADMIN}><TendersPage /></RoleRoute>} />
        <Route path="/tenders/:tenderId" element={<RoleRoute roles={OFFICER_AND_ADMIN}><TenderDetailPage /></RoleRoute>} />
        <Route path="/bidders" element={<RoleRoute roles={OFFICER_AND_ADMIN}><BiddersPage /></RoleRoute>} />
        <Route path="/bidders/:bidderId" element={<RoleRoute roles={OFFICER_AND_ADMIN}><BidderProfilePage /></RoleRoute>} />
        <Route path="/bidders/:bidderId/tenders/:tenderId" element={<RoleRoute roles={OFFICER_AND_ADMIN}><Bidder360Page /></RoleRoute>} />
        <Route path="/bidders/:bidderId/bidmark/:tenderId" element={<RoleRoute roles={OFFICER_AND_ADMIN}><BidmarkDashboardPage /></RoleRoute>} />
        <Route path="/review-queue" element={<RoleRoute roles={OFFICER_AND_ADMIN}><ReviewQueuePage /></RoleRoute>} />
        <Route path="/forensics" element={<RoleRoute roles={OFFICER_AND_ADMIN}><ForensicsPage /></RoleRoute>} />
        <Route path="/behavior" element={<RoleRoute roles={OFFICER_AND_ADMIN}><BehaviorPage /></RoleRoute>} />
        <Route path="/cross-bidder" element={<RoleRoute roles={OFFICER_AND_ADMIN}><CrossBidderPage /></RoleRoute>} />
        <Route path="/simulator" element={<RoleRoute roles={OFFICER_AND_ADMIN}><SimulatorPage /></RoleRoute>} />
        <Route path="/audit" element={<RoleRoute roles={OFFICER_AND_ADMIN}><AuditPage /></RoleRoute>} />
        <Route path="/comparison" element={<RoleRoute roles={OFFICER_AND_ADMIN}><BidderComparisonPage /></RoleRoute>} />

        {/* Admin only — account provisioning */}
        <Route path="/admin/users" element={<RoleRoute roles={ADMIN_ONLY}><UserManagementPage /></RoleRoute>} />

        {/* Bidder-only portal — exactly the 9 sidebar sections */}
        <Route path="/my-tenders" element={<RoleRoute roles={BIDDER_ONLY}><PortalMyTendersPage /></RoleRoute>} />
        <Route path="/my-tenders/:tenderId" element={<RoleRoute roles={BIDDER_ONLY}><PortalTenderDetailPage /></RoleRoute>} />
        <Route path="/my-tenders/:tenderId/bidmark" element={<RoleRoute roles={BIDDER_ONLY}><PortalBidmarkStatusPage /></RoleRoute>} />
        <Route path="/my-documents" element={<RoleRoute roles={BIDDER_ONLY}><PortalMyDocumentsPage /></RoleRoute>} />
        <Route path="/compliance-status" element={<RoleRoute roles={BIDDER_ONLY}><PortalComplianceStatusPage /></RoleRoute>} />
        <Route path="/action-required" element={<RoleRoute roles={BIDDER_ONLY}><PortalActionRequiredPage /></RoleRoute>} />
        <Route path="/submissions" element={<RoleRoute roles={BIDDER_ONLY}><PortalSubmissionsPage /></RoleRoute>} />
        <Route path="/notifications" element={<RoleRoute roles={BIDDER_ONLY}><PortalNotificationsPage /></RoleRoute>} />
        <Route path="/profile" element={<RoleRoute roles={BIDDER_ONLY}><PortalProfilePage /></RoleRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
