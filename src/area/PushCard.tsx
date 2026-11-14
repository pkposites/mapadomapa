import { useEffect, useState } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { browserSubscription, disablePush, enablePush, isIos, isStandalone, pushSupported } from '../lib/push'

type Status = { configured: boolean; publicKey: string | null; subscribed: boolean; prefs: { messages: boolean; announcements: boolean } }

/** Avisos no celular (opcional). Só pede permissão quando a pessoa toca no botão. */
export default function PushCard() {
  const [st, setSt] = useState<Status | null>(null)
  const [on, setOn] = useState(false) // este aparelho está inscrito?
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const load = async () => {
    const s = await api.get<Status>('/pro/push'); setSt(s)
    setOn(s.subscribed && pushSupported() ? Boolean(await browserSubscription()) : false)
  }
  useEffect(() => { void load().catch(() => undefined) }, [])

  if (!st?.configured) return null
  if (!pushSupported()) {
    return isIos() && !isStandalone()
      ? <section className="rounded-3xl bg-white p-5" data-testid="push-ios"><p className="flex items-center gap-2 text-[16px] font-semibold"><Bell size={18} aria-hidden="true" /> Avisos no celular</p><p className="mt-1 text-[15px] leading-snug text-muted">No iPhone, instale o app na tela inicial (veja “Instale o Mapa do Mapa” acima) e abra por lá para ativar os avisos.</p></section>
      : null
  }
  const denied = typeof Notification !== 'undefined' && Notification.permission === 'denied'
  const run = async (fn: () => Promise<void>) => { setBusy(true); setMsg(null); try { await fn(); await load() } catch (e) { setMsg(e instanceof ApiError ? e.message : 'Não foi possível concluir. Tente de novo.') } finally { setBusy(false) } }
  const prefs = (patch: Partial<Status['prefs']>) => run(async () => { await api.put('/pro/push/prefs', { ...st.prefs, ...patch }) })

  return (
    <section className="rounded-3xl bg-white p-5" aria-label="Avisos no celular" data-testid="push-card">
      <p className="flex items-center gap-2 text-[16px] font-semibold"><Bell size={18} aria-hidden="true" /> Avisos no celular</p>
      {!on && (
        <>
          <p className="mt-1 text-[15px] leading-snug text-muted">Receba um aviso quando a equipe responder, quando houver decisão sobre seu cadastro ou um novo comunicado. O aviso não mostra o conteúdo da mensagem.</p>
          {denied
            ? <p className="mt-3 rounded-2xl bg-ice p-3 text-[14px] leading-snug">As notificações estão bloqueadas neste aparelho. Para ativar, libere em Configurações do navegador/app e volte aqui.</p>
            : <button type="button" disabled={busy} onClick={() => run(async () => { const r = await enablePush(st.publicKey!); if (r === 'denied') setMsg('Sem permissão, não é possível enviar avisos. Você pode tentar de novo quando quiser.'); if (r === 'unsupported') setMsg('Os avisos funcionam no app publicado. Abra o endereço oficial e tente de novo.') })} className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-lime px-6 font-semibold text-graphite disabled:opacity-60">Ativar avisos</button>}
        </>
      )}
      {on && (
        <>
          <p className="mt-1 text-[15px] text-muted">Avisos ativados neste aparelho.</p>
          <label className="mt-3 flex min-h-11 items-center gap-3 text-[15px]"><input type="checkbox" className="size-6 accent-graphite" checked={st.prefs.messages} disabled={busy} onChange={(e) => prefs({ messages: e.target.checked })} /> Mensagens e decisões da equipe</label>
          <label className="flex min-h-11 items-center gap-3 text-[15px]"><input type="checkbox" className="size-6 accent-graphite" checked={st.prefs.announcements} disabled={busy} onChange={(e) => prefs({ announcements: e.target.checked })} /> Comunicados</label>
          <button type="button" disabled={busy} onClick={() => run(disablePush)} className="mt-2 inline-flex min-h-11 items-center gap-2 text-[15px] font-semibold underline decoration-lime decoration-2 underline-offset-4"><BellOff size={16} aria-hidden="true" /> Desativar avisos</button>
        </>
      )}
      {msg && <p role="alert" className="mt-3 text-[14px] font-medium text-danger">{msg}</p>}
    </section>
  )
}
