import { useState, type FormEvent } from 'react'
import { toApiError, type ApiError } from '@/app/lib/api'
import { auth } from '@/app/services/bidmark'
import { Button, Dialog, Field, Input } from '@/app/components/ui/primitives'

export function RegisterDialog({ open, onClose, onRegistered }: {
  open: boolean; onClose: () => void; onRegistered: (email: string) => void
}) {
  const [form, setForm] = useState({ full_name: '', company_name: '', email: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [done, setDone] = useState(false)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await auth.register(form)
      setDone(true)
    } catch (err) {
      setError(toApiError(err))
    } finally {
      setBusy(false)
    }
  }

  function close() {
    setDone(false)
    setError(null)
    onClose()
  }

  return (
    <Dialog open={open} onClose={close} title={done ? 'Seller account created' : 'Register as a bidder'}
      description={done ? undefined : 'Creates a bidder account for your organisation. Staff accounts are issued by the administrator.'}
      footer={done ? (
        <Button variant="primary" onClick={() => onRegistered(form.email)}>Continue to sign in</Button>
      ) : (
        <>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button variant="primary" type="submit" form="register-form" busy={busy}>Create account</Button>
        </>
      )}>
      {done ? (
        <p className="text-[13.5px] text-ink-2">
          The account for <span className="font-medium">{form.company_name}</span> is ready. Sign in with {form.email} to complete the company profile and upload documents.
        </p>
      ) : (
        <form id="register-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name" htmlFor="r-name" required><Input id="r-name" value={form.full_name} onChange={set('full_name')} required /></Field>
          <Field label="Company name" htmlFor="r-company" required><Input id="r-company" value={form.company_name} onChange={set('company_name')} required /></Field>
          <div className="sm:col-span-2">
            <Field label="Email" htmlFor="r-email" required><Input id="r-email" type="email" value={form.email} onChange={set('email')} required /></Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Password" htmlFor="r-pass" required hint="At least 6 characters."><Input id="r-pass" type="password" value={form.password} onChange={set('password')} required /></Field>
          </div>
          {error && <p className="sm:col-span-2 rounded-md border border-finding-line bg-finding-bg px-3 py-2 text-[13px] text-finding" role="alert">{error.kind === 'unavailable' ? 'Verification service unavailable. The account was not created.' : error.message}</p>}
        </form>
      )}
    </Dialog>
  )
}
