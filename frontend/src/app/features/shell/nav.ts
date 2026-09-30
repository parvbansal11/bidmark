import {
  Bell, Building2, FileStack, Gavel, Inbox, LayoutGrid, ListChecks, Network, ScrollText, ShieldCheck,
  SlidersHorizontal, UserRound, Users, type LucideIcon,
} from 'lucide-react'
import type { Role } from '@/app/services/bidmark/types'

export interface NavItem { to: string; label: string; icon: LucideIcon; end?: boolean }
export interface NavGroup { label: string; bidmark?: boolean; items: NavItem[] }

export const NAV: Record<Role, NavGroup[]> = {
  PROCUREMENT_OFFICER: [
    {
      label: 'GeM Procurement',
      items: [
        { to: '/officer', label: 'Workspace', icon: LayoutGrid, end: true },
        { to: '/officer/tenders', label: 'Tenders', icon: Building2 },
      ],
    },
    {
      label: 'Bidmark',
      bidmark: true,
      items: [
        { to: '/officer/queue', label: 'Verification queue', icon: Inbox },
        { to: '/officer/intelligence', label: 'Risk intelligence', icon: Network },
        { to: '/officer/decisions', label: 'Decision desk', icon: Gavel },
        { to: '/officer/audit', label: 'Audit trail', icon: ShieldCheck },
      ],
    },
  ],
  AUDITOR: [
    {
      label: 'Oversight',
      items: [
        { to: '/auditor', label: 'Audit overview', icon: LayoutGrid, end: true },
        { to: '/auditor/decisions', label: 'Decisions', icon: Gavel },
        { to: '/auditor/findings', label: 'Finding rulings', icon: ListChecks },
        { to: '/auditor/integrity', label: 'Integrity verification', icon: ShieldCheck },
        { to: '/auditor/tenders', label: 'Tender records', icon: Building2 },
      ],
    },
  ],
  ADMIN: [
    {
      label: 'Administration',
      items: [
        { to: '/admin', label: 'Overview', icon: LayoutGrid, end: true },
        { to: '/admin/tenders', label: 'Tenders', icon: Building2 },
        { to: '/admin/users', label: 'Users and roles', icon: Users },
      ],
    },
    {
      label: 'Bidmark governance',
      bidmark: true,
      items: [
        { to: '/admin/rules', label: 'Rule performance', icon: SlidersHorizontal },
        { to: '/admin/audit', label: 'Audit integrity', icon: ShieldCheck },
      ],
    },
  ],
  BIDDER: [
    {
      label: 'Seller',
      items: [
        { to: '/seller', label: 'Dashboard', icon: LayoutGrid, end: true },
        { to: '/seller/bids', label: 'My bids', icon: ScrollText },
        { to: '/seller/tenders', label: 'Tenders', icon: Building2 },
        { to: '/seller/documents', label: 'Documents', icon: FileStack },
        { to: '/seller/notifications', label: 'Notifications', icon: Bell },
        { to: '/seller/profile', label: 'Company profile', icon: UserRound },
      ],
    },
  ],
}

export const ROLE_BASE: Record<Role, string> = {
  PROCUREMENT_OFFICER: '/officer',
  AUDITOR: '/auditor',
  ADMIN: '/admin',
  BIDDER: '/seller',
}

