import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '@/app/auth/AuthContext'
import { RequireRole } from '@/app/auth/RequireRole'
import type { Role } from '@/app/services/bidmark/types'
import { SkeletonRows } from '@/app/components/ui/primitives'
import { LandingPage } from '@/app/features/landing/LandingPage'
import { AppShell } from '@/app/features/shell/AppShell'
import { AuditTrailPage } from '@/app/features/audit/AuditTrailPage'

const lazyNamed = <K extends string>(loader: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => loader().then(m => ({ default: m[name] })))

const officer = () => import('@/app/features/officer/OfficerPages')
const tender = () => import('@/app/features/tender/TenderPages')
const auditor = () => import('@/app/features/oversight/AuditorPages')
const admin = () => import('@/app/features/oversight/AdminPages')
const seller = () => import('@/app/features/seller/SellerPages')

const OfficerWorkspace = lazyNamed(officer, 'OfficerWorkspace')
const QueuePage = lazyNamed(officer, 'QueuePage')
const RiskIntelligencePage = lazyNamed(() => import('@/app/features/officer/RiskPages'), 'RiskIntelligencePage')
const RiskGroupPage = lazyNamed(() => import('@/app/features/officer/RiskPages'), 'RiskGroupPage')
const DecisionDeskPage = lazyNamed(officer, 'DecisionDeskPage')
const TenderListPage = lazyNamed(tender, 'TenderListPage')
const TenderPage = lazyNamed(tender, 'TenderPage')
const CasePage = lazyNamed(() => import('@/app/features/case/CasePage'), 'CasePage')
const AuditorOverview = lazyNamed(auditor, 'AuditorOverview')
const AuditorDecisionsPage = lazyNamed(auditor, 'AuditorDecisionsPage')
const FindingRulingsPage = lazyNamed(auditor, 'FindingRulingsPage')
const AdminOverview = lazyNamed(admin, 'AdminOverview')
const UsersPage = lazyNamed(admin, 'UsersPage')
const RulePerformancePage = lazyNamed(admin, 'RulePerformancePage')
const AdminTendersPage = lazyNamed(admin, 'AdminTendersPage')
const SellerDashboard = lazyNamed(seller, 'SellerDashboard')
const SellerBidsPage = lazyNamed(seller, 'SellerBidsPage')
const SellerBidPage = lazyNamed(seller, 'SellerBidPage')
const SellerTendersPage = lazyNamed(seller, 'SellerTendersPage')
const SellerTenderPage = lazyNamed(seller, 'SellerTenderPage')
const SellerDocumentsPage = lazyNamed(seller, 'SellerDocumentsPage')
const SellerNotificationsPage = lazyNamed(seller, 'SellerNotificationsPage')
const SellerProfilePage = lazyNamed(seller, 'SellerProfilePage')

function Area({ roles, children }: { roles: Role[]; children: ReactNode }) {
  return (
    <RequireRole roles={roles}>
      {children}
    </RequireRole>
  )
}

const page = (el: ReactNode) => <Suspense fallback={<SkeletonRows rows={6} />}>{el}</Suspense>

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />

      <Route path="/officer" element={<Area roles={['PROCUREMENT_OFFICER']}><AppShell /></Area>}>
        <Route index element={page(<OfficerWorkspace />)} />
        <Route path="tenders" element={page(<TenderListPage />)} />
        <Route path="tenders/:tenderId" element={page(<TenderPage />)} />
        <Route path="cases/:caseId" element={page(<CasePage />)} />
        <Route path="queue" element={page(<QueuePage />)} />
        <Route path="intelligence" element={page(<RiskIntelligencePage />)} />
        <Route path="intelligence/:tenderId/:ringIndex" element={page(<RiskGroupPage />)} />
        <Route path="decisions" element={page(<DecisionDeskPage />)} />
        <Route path="audit" element={<AuditTrailPage />} />
      </Route>

      <Route path="/auditor" element={<Area roles={['AUDITOR']}><AppShell /></Area>}>
        <Route index element={page(<AuditorOverview />)} />
        <Route path="decisions" element={page(<AuditorDecisionsPage />)} />
        <Route path="findings" element={page(<FindingRulingsPage />)} />
        <Route path="integrity" element={<AuditTrailPage title="Integrity verification" eyebrow="Oversight" />} />
        <Route path="audit" element={<AuditTrailPage title="Integrity verification" eyebrow="Oversight" />} />
        <Route path="tenders" element={page(<TenderListPage />)} />
        <Route path="tenders/:tenderId" element={page(<TenderPage />)} />
        <Route path="cases/:caseId" element={page(<CasePage />)} />
      </Route>

      <Route path="/admin" element={<Area roles={['ADMIN']}><AppShell /></Area>}>
        <Route index element={page(<AdminOverview />)} />
        <Route path="tenders" element={page(<AdminTendersPage />)} />
        <Route path="tenders/:tenderId" element={page(<TenderPage />)} />
        <Route path="cases/:caseId" element={page(<CasePage />)} />
        <Route path="users" element={page(<UsersPage />)} />
        <Route path="rules" element={page(<RulePerformancePage />)} />
        <Route path="audit" element={<AuditTrailPage title="Audit integrity" eyebrow="Bidmark governance" />} />
      </Route>

      <Route path="/seller" element={<Area roles={['BIDDER']}><AppShell /></Area>}>
        <Route index element={page(<SellerDashboard />)} />
        <Route path="bids" element={page(<SellerBidsPage />)} />
        <Route path="bids/:caseId" element={page(<SellerBidPage />)} />
        <Route path="tenders" element={page(<SellerTendersPage />)} />
        <Route path="tenders/:tenderId" element={page(<SellerTenderPage />)} />
        <Route path="documents" element={page(<SellerDocumentsPage />)} />
        <Route path="notifications" element={page(<SellerNotificationsPage />)} />
        <Route path="profile" element={page(<SellerProfilePage />)} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
