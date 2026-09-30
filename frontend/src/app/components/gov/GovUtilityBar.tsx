import { useEffect, useState } from 'react'
import { Accessibility, CircleHelp } from 'lucide-react'
import { cn } from '@/app/lib/cn'
import { Button, Dialog, Tooltip } from '@/app/components/ui/primitives'

const SCALE_KEY = 'bidmark.textScale'

function useTextScale() {
  const [scale, setScale] = useState<number>(() => {
    try { return Number(localStorage.getItem(SCALE_KEY)) || 100 } catch { return 100 }
  })
  useEffect(() => {
    document.documentElement.style.fontSize = `${scale}%`
    try { localStorage.setItem(SCALE_KEY, String(scale)) } catch { /* not persisted */ }
  }, [scale])
  return [scale, setScale] as const
}

export function SkipLink() {
  return (
    <a href="#main" className="sr-only z-[60] rounded-md bg-navy px-3 py-2 text-[13px] font-medium text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-2">
      Skip to main content
    </a>
  )
}

export function GovUtilityBar({ dark }: { dark?: boolean }) {
  const [scale, setScale] = useTextScale()
  const [help, setHelp] = useState(false)
  const control = cn(
    'inline-flex h-6 items-center rounded px-1.5 text-[12.5px] transition-colors',
    dark ? 'text-white/75 hover:bg-white/10 hover:text-white' : 'text-ink-3 hover:bg-sunken hover:text-ink',
  )
  return (
    <div className={cn('border-b text-[12.5px]', dark ? 'border-white/10 bg-[#0b1a36] text-white/80' : 'border-line bg-surface text-ink-3')}>
      <div className="mx-auto flex h-8 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <span lang="hi" className={cn('font-medium', dark ? 'text-white' : 'text-ink-2')}>भारत सरकार</span>
          <span aria-hidden className="opacity-40">|</span>
          <span className="truncate">Government of India</span>
          <span aria-hidden className="hidden opacity-40 md:inline">|</span>
          <span className="hidden truncate md:inline">Ministry of Petroleum &amp; Natural Gas</span>
        </div>
        <div className="flex items-center gap-1">
          <SkipLink />
          <div className="hidden items-center gap-0.5 sm:flex" role="group" aria-label="Text size">
            <Accessibility className="mr-1 size-3.5 opacity-70" aria-hidden />
            {[
              { v: 90, l: 'A-', n: 'Decrease text size' },
              { v: 100, l: 'A', n: 'Default text size' },
              { v: 112.5, l: 'A+', n: 'Increase text size' },
            ].map(o => (
              <button key={o.v} onClick={() => setScale(o.v)} className={cn(control, scale === o.v && (dark ? 'bg-white/15 text-white' : 'bg-sunken text-ink'))} aria-label={o.n} aria-pressed={scale === o.v}>
                {o.l}
              </button>
            ))}
          </div>
          <span aria-hidden className="mx-1 hidden opacity-30 sm:inline">|</span>
          <Tooltip side="bottom" label="The Hindi interface is not yet available. Official terms are shown bilingually where used.">
            <span className={cn(control, 'gap-1')} tabIndex={0}>
              English <span className="opacity-50">/</span> <span lang="hi">हिन्दी</span>
            </span>
          </Tooltip>
          <button className={cn(control, 'hidden gap-1 sm:inline-flex')} onClick={() => setHelp(true)}>
            <CircleHelp className="size-3.5" aria-hidden /> Help
          </button>
        </div>
      </div>
      <Dialog open={help} onClose={() => setHelp(false)} title="Using the workspace" footer={<Button onClick={() => setHelp(false)}>Close</Button>}>
        <div className="space-y-3 text-[14px] leading-relaxed text-ink-2">
          <p>Open a tender to see its bidders, their compliance and the evidence behind each finding.</p>
          <p>Procurement Officers rule on findings and record decisions. Bidders submit documents and answer clarifications. Auditors have read-only access. Administrators manage accounts, requirements and rules.</p>
          <p className="text-ink-3">Every registry result names its source. Sandbox sources are marked.</p>
        </div>
      </Dialog>
    </div>
  )
}

export function ProvenanceNote({ className }: { className?: string }) {
  return (
    <p className={cn('text-[12.5px] leading-relaxed text-ink-4', className)}>
      Bidmark is an independent verification layer for procurement workspaces. It is not the official GeM portal. Every registry result names its source, and sandbox sources are marked.
    </p>
  )
}
