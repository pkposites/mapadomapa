import { useState } from 'react'
import Alert from '../components/ui/Alert'
import SubmitButton from '../components/ui/SubmitButton'
import { ApiError } from '../lib/api'

/** Editar → confirmar → enviar → resultado. O botão fica travado durante o envio (sem duplicar por clique repetido). */
export default function WelcomeBox({ template, confirmText, preview, send, disabledReason, openLabel }: {
  template: string; confirmText: string; preview?: (body: string) => string
  send: (body: string) => Promise<string>; disabledReason?: string | null; openLabel: string
}) {
  const [step, setStep] = useState<'closed' | 'edit' | 'confirm' | 'done'>('closed')
  const [body, setBody] = useState(template)
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  if (disabledReason) return <p className="text-[15px] text-muted">{disabledReason}</p>
  if (step === 'closed') return <SubmitButton type="button" onClick={() => { setBody(template); setRes(null); setStep('edit') }}>{openLabel}</SubmitButton>
  if (step === 'done') return <Alert tone={res?.tone ?? 'success'}>{res?.text}</Alert>

  const run = async () => {
    if (busy) return
    setBusy(true)
    try { setRes({ tone: 'success', text: await send(body) }) } catch (e) { setRes({ tone: 'error', text: e instanceof ApiError ? e.message : 'Não foi possível enviar.' }) }
    finally { setBusy(false); setStep('done') }
  }
  return step === 'edit' ? (
    <div>
      <label htmlFor="welcome" className="block text-[15px] font-semibold">Mensagem (você pode editar)</label>
      <textarea id="welcome" rows={11} maxLength={900} value={body} onChange={(e) => setBody(e.target.value)} className="mt-2 block w-full rounded-2xl border border-line p-3 text-[15px] leading-snug focus:outline-2 focus:outline-offset-2 focus:outline-graphite" />
      <p className="mt-1 text-[13px] text-muted">[nome] é trocado pelo primeiro nome (se não houver nome, a saudação fica sem ele).</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <SubmitButton type="button" variant="ghost" className="border border-line" onClick={() => setStep('closed')}>Cancelar</SubmitButton>
        <SubmitButton type="button" disabled={body.trim().length < 10} onClick={() => setStep('confirm')}>Revisar</SubmitButton>
      </div>
    </div>
  ) : (
    <div>
      <p className="text-[15px] font-semibold">{confirmText}</p>
      <p className="mt-3 whitespace-pre-line rounded-2xl bg-ice p-4 text-[15px] leading-snug" data-testid="welcome-preview">{preview ? preview(body) : body}</p>
      <p className="mt-2 text-[13px] text-muted">Será enviada apenas pela caixa de mensagens interna da plataforma.</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <SubmitButton type="button" variant="ghost" className="border border-line" disabled={busy} onClick={() => setStep('edit')}>Voltar</SubmitButton>
        <SubmitButton type="button" loading={busy} onClick={run} data-testid="welcome-confirm">Confirmar envio</SubmitButton>
      </div>
    </div>
  )
}
