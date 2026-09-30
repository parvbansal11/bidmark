import { cn } from '@/app/lib/cn'

export function BidmarkGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn('size-6', className)} aria-hidden>
      <rect x="0.5" y="0.5" width="23" height="23" rx="5.5" fill="var(--color-navy)" />
      <path d="M7 6.5h7.2l2.8 2.8v8.2H7z" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M9.3 11h5.4M9.3 13.6h3.2" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
      <rect x="13.6" y="13.1" width="3.4" height="3.4" rx="0.6" fill="var(--color-saffron)" />
    </svg>
  )
}

export function Wordmark({ className, subtle }: { className?: string; subtle?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <BidmarkGlyph />
      <span className="text-[17px] font-semibold tracking-[-0.02em] text-ink">Bidmark</span>
      {!subtle && <span className="hidden text-[12px] text-ink-3 sm:inline">Procurement Compliance Intelligence</span>}
    </span>
  )
}

// A neutral text treatment for the marketplace. Not the official GeM logo.
export function GemMark({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span className={cn(
        'grid size-9 place-items-center rounded-md text-[13px] font-bold tracking-tight',
        inverted ? 'bg-white text-navy' : 'bg-navy text-white',
      )}>
        GeM
      </span>
      <span className="leading-tight">
        <span className={cn('block text-[15px] font-semibold tracking-[-0.01em]', inverted ? 'text-white' : 'text-ink')}>Government e-Marketplace</span>
        <span className={cn('block text-[12px]', inverted ? 'text-white/70' : 'text-ink-3')}>Procurement Workspace</span>
      </span>
    </span>
  )
}

export function TricolourRule({ className }: { className?: string }) {
  return (
    <div className={cn('flex h-[3px] w-full', className)} aria-hidden>
      <span className="flex-1 bg-saffron" />
      <span className="flex-1 bg-white" />
      <span className="flex-1 bg-bharat" />
    </div>
  )
}

// CPCL mark, cropped from the CPCL eProcurement banner (public/assets/cpcl). Not redrawn.
export function CpclLogo({ className }: { className?: string }) {
  return <img src="/assets/cpcl/cpcl-logo.png" alt="Chennai Petroleum Corporation Limited" className={cn('size-8 rounded-[4px] bg-white object-contain', className)} draggable={false} />
}
