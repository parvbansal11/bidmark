import type { Role } from '@/app/services/bidmark/types'
import { BidmarkGlyph } from '@/app/components/gov/Brand'

const DESTINATION: Record<Role, string> = {
  PROCUREMENT_OFFICER: 'Opening Procurement Workspace',
  BIDDER: 'Opening Seller Workspace',
  AUDITOR: 'Opening Audit Workspace',
  ADMIN: 'Opening Administration',
}

export function SignInTransition({ role }: { role: Role }) {
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-canvas/95 backdrop-blur-sm animate-fade-in" role="status" aria-live="assertive">
      <div className="flex flex-col items-center gap-4 animate-rise-in">
        <BidmarkGlyph className="size-9" />
        <p className="text-[15px] font-medium tracking-tight text-ink">{DESTINATION[role]}</p>
        <div className="h-0.5 w-40 overflow-hidden rounded-full bg-line">
          <div className="h-full w-full origin-left bg-navy [animation:grow_600ms_var(--ease-out-soft)_both]" />
        </div>
      </div>
      <style>{'@keyframes grow { from { transform: scaleX(0) } to { transform: scaleX(1) } }'}</style>
    </div>
  )
}
