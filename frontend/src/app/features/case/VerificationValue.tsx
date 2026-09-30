import { verificationText } from '@/app/lib/passport'
import type { VerificationSummary } from '@/app/services/bidmark'

// Summary card value: verified counts, then what the remaining checks are. Never a score.
export function VerificationValue({ v }: { v: VerificationSummary | null | undefined }) {
  if (!v) return <p className="text-[15px] font-semibold text-ink-3">Not yet verified</p>
  const t = verificationText(v)
  return (
    <>
      <p className="tnum text-[22px] font-semibold leading-tight">{t.headline}<span className="text-[14px] font-normal text-ink-3"> verified</span></p>
      {t.details.length > 0 && (
        <p className="mt-1 text-[13px]">
          {t.details.map((d, i) => (
            <span key={d.text} className={d.tone === 'finding' ? 'text-finding' : d.tone === 'review' ? 'text-review' : 'text-ink-3'}>{i > 0 && <span className="text-ink-4"> · </span>}{d.text}</span>
          ))}
        </p>
      )}
      {t.submission && <p className="mt-1 text-[12.5px] text-ink-3">{t.submission}</p>}
    </>
  )
}
