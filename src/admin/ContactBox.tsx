import { useState } from 'react'
import { MessageCircle, Send } from 'lucide-react'
import Alert from '../components/ui/Alert'
import { api, ApiError } from '../lib/api'
import { personalize, TEMPLATES, waUrl } from './contact'

/**
 * Uma caixa de mensagem, dois botões: "Enviar no app" (caixa de mensagens da plataforma) e "WhatsApp"
 * (abre a conversa já com o texto pronto — sem custo nem serviço externo). Modelos prontos e editáveis.
 */
export default function ContactBox({ id, fullName, whatsappPhone, lastWhatsApp, onSent, defaultTemplate = 'verify' }: {
  id: string; fullName: string | null; whatsappPhone: string; lastWhatsApp: string | null; onSent: () => void; defaultTemplate?: string
}) {
  const initial = TEMPLATES.find((t) => t.id === defaultTemplate) ?? TEMPLATES[0]
  const [tpl, setTpl] = useState(initial.id)
  const [text, setText] = useState(initial.text)
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const final = personalize(text, fullName)
  const pick = (t: (typeof TEMPLATES)[number]) => { setTpl(t.id); setText(t.text); setRes(null) }
  const sendApp = async () => {
    setBusy(true); setRes(null)
    try { await api.post(`/admin/professionals/${id}/messages`, { body: final }); setRes({ tone: 'success', text: 'Mensagem enviada no app.' }); onSent() } catch (e) { setRes({ tone: 'error', text: e instanceof ApiError ? e.message : 'Não foi possível enviar.' }) } finally { setBusy(false) }
  }
  const logWa = () => { void fetch(`/api/admin/professionals/${id}/whatsapp-log`, { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'content-type': 'application/json' }, body: '{}' }).then(onSent).catch(() => undefined) }
  return (
    <div data-testid="contact-box">
      <p className="text-[14px] font-semibold">Modelos</p>
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Modelos de mensagem">
        {TEMPLATES.map((t) => <button key={t.id} type="button" aria-pressed={tpl === t.id} onClick={() => pick(t)} className={`min-h-11 rounded-full border px-3.5 text-[14px] font-medium ${tpl === t.id ? 'border-graphite bg-graphite text-white' : 'border-line bg-white'}`}>{t.label}</button>)}
      </div>
      <label htmlFor="contact-text" className="mt-4 block text-[14px] font-semibold">Mensagem (você pode editar)</label>
      <textarea id="contact-text" rows={6} maxLength={900} value={text} onChange={(e) => setText(e.target.value)} className="mt-2 block w-full rounded-2xl border border-line p-3 text-[15px] leading-snug focus:outline-2 focus:outline-offset-2 focus:outline-graphite" />
      <p className="mt-1 text-[12px] text-muted">[nome] vira o primeiro nome. Pré-visualização: <em>{final.slice(0, 90)}{final.length > 90 ? '…' : ''}</em></p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" disabled={busy || final.length < 3} onClick={sendApp} data-testid="send-app" className="inline-flex min-h-13 items-center justify-center gap-2 rounded-2xl bg-lime px-4 font-semibold text-graphite disabled:opacity-60"><Send size={17} aria-hidden="true" /> Enviar no app</button>
        <a href={final.length >= 3 ? waUrl(whatsappPhone, final) : undefined} target="_blank" rel="noopener noreferrer" onClick={logWa} aria-disabled={final.length < 3} data-testid="send-whatsapp" className={`inline-flex min-h-13 items-center justify-center gap-2 rounded-2xl bg-[#25d366] px-4 font-semibold text-graphite ${final.length < 3 ? 'pointer-events-none opacity-60' : ''}`}><MessageCircle size={17} aria-hidden="true" /> WhatsApp</a>
      </div>
      {lastWhatsApp && <p className="mt-2 text-[12px] text-muted">Último WhatsApp aberto por você em {new Date(lastWhatsApp).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.</p>}
      <p className="mt-1 text-[12px] text-muted">O WhatsApp abre no seu aparelho com a conversa pronta; a mensagem só sai quando você tocar em enviar lá.</p>
      {res && <div className="mt-3"><Alert tone={res.tone}>{res.text}</Alert></div>}
    </div>
  )
}
