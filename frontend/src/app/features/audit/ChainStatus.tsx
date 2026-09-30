import { useState } from 'react'
import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { cn } from '@/app/lib/cn'
import type { ChainStatus } from '@/app/services/bidmark'
import { Mono } from '@/app/components/ui/primitives'

export function ChainBanner({ chain, className, checkedAt }: { chain: ChainStatus; className?: string; checkedAt?: string }) {
  const [hash, setHash] = useState(false)
  const ok = chain.intact
  return (
    <div className={cn('rounded-lg border px-5 py-3.5', ok ? 'border-pass-line bg-pass-bg/60' : 'border-finding-line bg-finding-bg', className)} role="status">
      <div className="flex flex-wrap items-center gap-3">
        {ok ? <ShieldCheck className="size-5 text-pass" aria-hidden /> : <ShieldAlert className="size-5 text-finding" aria-hidden />}
        <p className="text-[15px] font-semibold">{ok ? 'Integrity verified' : `Chain broken at entry ${chain.broken_at ?? 'unknown'}`}</p>
        <p className="text-[13.5px] text-ink-2">
          {ok ? `${chain.entries} entries recomputed. None edited or removed.` : chain.problem ?? 'An entry no longer matches the hash recorded after it.'}
          {checkedAt && <span className="text-ink-3"> Checked {checkedAt}.</span>}
        </p>
        <button onClick={() => setHash(h => !h)} className="ml-auto text-[13.5px] text-navy-600 hover:underline" aria-expanded={hash}>{hash ? 'Hide hash' : 'View hash'}</button>
      </div>
      {hash && <p className="mt-2 text-[12.5px] text-ink-3">Chain head, entry {chain.head_seq}: <Mono className="break-all text-[12.5px] text-ink-2">{chain.head_hash}</Mono></p>}
    </div>
  )
}

export function ChainExplainer({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg border border-line bg-surface px-4 py-3 text-[13px] leading-relaxed text-ink-2', className)}>
      <p className="font-semibold text-ink">How integrity is checked</p>
      <p className="mt-1">
        Each event is hashed together with the hash of the event before it. Editing or deleting an earlier entry, even directly in the
        database, changes its hash and breaks verification from that entry onward.
      </p>
    </div>
  )
}
