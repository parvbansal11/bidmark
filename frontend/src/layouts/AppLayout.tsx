import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import * as portalApi from '@/api/portal'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  FileStack,
  Users,
  ListChecks,
  ScanSearch,
  FingerprintIcon,
  Network,
  FlaskConical,
  History,
  Settings,
  LogOut,
  ShieldAlert,
  GitCompare,
  FolderOpen,
  ShieldCheck,
  AlertCircle,
  Send,
  Bell,
  User,
  UserCog,
  Menu,
  X,
} from 'lucide-react'

const OFFICER_NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/tenders', label: 'Tenders', icon: FileStack },
  { to: '/bidders', label: 'Bidders', icon: Users },
  { to: '/review-queue', label: 'Review Queue', icon: ListChecks },
  { to: '/forensics', label: 'Forensics', icon: ScanSearch },
  { to: '/behavior', label: 'Behavior', icon: FingerprintIcon },
  { to: '/cross-bidder', label: 'Cross-Bidder Intel', icon: Network },
  { to: '/comparison', label: 'Bidder Comparison', icon: GitCompare },
  { to: '/simulator', label: 'What-If Simulator', icon: FlaskConical },
  { to: '/audit', label: 'Audit Trail', icon: History },
  { to: '/settings', label: 'Settings', icon: Settings },
]

// Admin sees everything an Officer does, plus account provisioning — this is
// the one nav-visible difference between the two roles (tender creation and
// bidder-moderation actions live as page-level controls, not separate nav
// items, since Admin/Officer share the same pages with different buttons).
const ADMIN_NAV_ITEMS = [
  ...OFFICER_NAV_ITEMS.slice(0, -1),
  { to: '/admin/users', label: 'User Management', icon: UserCog },
  OFFICER_NAV_ITEMS[OFFICER_NAV_ITEMS.length - 1],
]

// Exactly 9 sections for the Bidder role — no more, no fewer.
const BIDDER_NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/my-tenders', label: 'My Tenders', icon: FileStack },
  { to: '/my-documents', label: 'My Documents', icon: FolderOpen },
  { to: '/compliance-status', label: 'Compliance Status', icon: ShieldCheck },
  { to: '/action-required', label: 'Action Required', icon: AlertCircle },
  { to: '/submissions', label: 'Submissions', icon: Send },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/profile', label: 'Profile', icon: User },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function AppLayout() {
  const { user, logout } = useAuth()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const navItems = user?.role === 'BIDDER' ? BIDDER_NAV_ITEMS : user?.role === 'ADMIN' ? ADMIN_NAV_ITEMS : OFFICER_NAV_ITEMS

  // Lightweight unread-notification badge for Bidders — polled rather than
  // pushed, since there's no websocket/SSE channel in this deployment; a
  // 30s interval keeps the sidebar reasonably current without hammering
  // the API.
  useEffect(() => {
    if (user?.role !== 'BIDDER') return
    let cancelled = false
    function poll() {
      portalApi
        .getNotifications(true)
        .then((n) => {
          if (!cancelled) setUnreadCount(n.length)
        })
        .catch(() => {})
    }
    poll()
    const interval = setInterval(poll, 30_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [user?.role])

  const sidebarContent = (
    <>
      <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-bold leading-tight text-slate-900">GeM AI Compliance</p>
          <p className="text-[10px] font-medium leading-tight text-slate-500">Government e-Marketplace</p>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => setMobileNavOpen(false)}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-600 hover:bg-slate-100',
              )
            }
          >
            <item.icon className="h-4 w-4" />
            <span className="flex-1">{item.label}</span>
            {item.to === '/notifications' && unreadCount > 0 && (
              <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-slate-100 px-3 py-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-slate-800">{user?.full_name}</p>
            <p className="truncate text-[10px] font-medium text-slate-500">{user?.role?.replace(/_/g, ' ')}</p>
          </div>
          <button onClick={logout} title="Sign out" className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  )

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 flex-shrink-0 flex-col border-r border-slate-200 bg-white md:flex">{sidebarContent}</aside>

      {/* Mobile sidebar: off-canvas drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileNavOpen(false)} />
          <aside className="relative flex h-full w-64 max-w-[80vw] flex-col bg-white shadow-xl">
            <button
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close navigation"
              className="absolute right-2 top-2 rounded p-1.5 text-slate-400 hover:bg-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Desktop Top Header Navigation Bar */}
        <header className="hidden md:flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-6 items-center gap-1.5 rounded-full bg-blue-50 px-2.5 text-xs font-semibold text-blue-700 border border-blue-200">
              Government e-Marketplace
            </span>
            <h1 className="text-sm font-semibold text-slate-800">
              GeM AI Compliance &amp; Bid Forensics Platform
            </h1>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="rounded bg-slate-100 px-2.5 py-1 text-slate-600 font-medium">
              CPCL · PS 26100
            </span>
            <span className={`px-2.5 py-1 rounded text-xs font-semibold ${
              user?.role === 'BIDDER' ? 'bg-emerald-100 text-emerald-800' :
              user?.role === 'ADMIN' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
            }`}>
              Role: {user?.role?.replace(/_/g, ' ')}
            </span>
          </div>
        </header>

        {/* Mobile top bar */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <div className="flex items-center gap-2">
            <button onClick={() => setMobileNavOpen(true)} aria-label="Open navigation" className="rounded p-1.5 text-slate-500 hover:bg-slate-100">
              <Menu className="h-5 w-5" />
            </button>
            <ShieldAlert className="h-5 w-5 text-blue-600" />
            <p className="text-sm font-bold text-slate-900">GeM AI Compliance Platform</p>
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
            {user?.role?.replace(/_/g, ' ')}
          </span>
        </div>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
