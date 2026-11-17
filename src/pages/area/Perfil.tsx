import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Camera, LogOut } from 'lucide-react'
import AreaShell from '../../area/Shell'
import Alert from '../../components/ui/Alert'
import Spinner from '../../components/ui/Spinner'
import InstallPrompt from '../../area/InstallPrompt'
import SubmitButton from '../../components/ui/SubmitButton'
import { useAuth } from '../../auth/AuthContext'
import { api, ApiError } from '../../lib/api'
import type { Catalog } from '../../pro/types'
import type { Me } from '../../area/types'
import { STATUS_TONE } from '../../area/types'

const box = 'rounded-3xl bg-white p-5'
const label = 'block text-[15px] font-semibold'
const field = 'mt-2 block w-full rounded-2xl border border-line bg-white px-4 py-3 text-[16px] focus:outline-2 focus:outline-offset-2 focus:outline-graphite'
const chip = (on: boolean) => `inline-flex min-h-11 items-center rounded-full border px-4 text-[15px] font-medium ${on ? 'border-graphite bg-graphite text-white' : 'border-line bg-white'}`

/** Reduz a foto no próprio celular (máx. 512 px, JPEG) antes de enviar. */
async function shrink(file: File): Promise<string> {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, 512 / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.82)
}

export default function Perfil() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [me, setMe] = useState<Me | null>(null)
  const [cat, setCat] = useState<Catalog | null>(null)
  const [phone, setPhone] = useState<{ phone: string; verified: boolean } | null>(null)
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string; at: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [f, setF] = useState({ fullName: '', bio: '', services: '', extraInfo: '' })
  const [exp, setExp] = useState<Record<string, { years: number; level: string }>>({})
  const [work, setWork] = useState({ weekdays: [] as string[], periods: [] as string[], emergency: false, ownTools: '', vehicle: '', workStructure: '' })
  const [regs, setRegs] = useState<string[]>([])
  const file = useRef<HTMLInputElement>(null)
  const { user } = useAuth()

  const apply = (m: Me) => {
    setMe(m)
    setF({ fullName: m.fullName ?? '', bio: m.bio ?? '', services: m.services ?? '', extraInfo: m.extraInfo ?? '' })
    setExp(Object.fromEntries(m.professions.map((p) => [p.slug, { years: p.experienceYears ?? 0, level: p.selfLevel ?? 'intermediate' }])))
    setWork({ weekdays: m.availability?.weekdays ?? [], periods: m.availability?.periods ?? [], emergency: m.availability?.emergency ?? false, ownTools: m.ownTools ?? '', vehicle: m.vehicle ?? '', workStructure: m.workStructure ?? '' })
    setRegs(m.regions)
  }
  // Carrega o perfil UMA vez (antes dependia de "user" e podia apagar o que a pessoa já tinha digitado).
  useEffect(() => {
    api.get<Me>('/pro/me').then(apply).catch(() => setMsg({ tone: 'error', text: 'Não foi possível carregar o perfil.', at: 'top' }))
    api.get<Catalog>('/pro/catalog').then(setCat).catch(() => undefined)
  }, [])
  useEffect(() => { if (user) setPhone({ phone: user.phone, verified: user.phoneVerified }) }, [user])

  const run = async (key: string, fn: () => Promise<Me>, ok: string) => {
    setBusy(key); setMsg(null)
    try { apply(await fn()); setMsg({ tone: 'success', text: ok, at: key }) } catch (e) { setMsg({ tone: 'error', text: e instanceof ApiError ? e.message : 'Algo deu errado.', at: key }) } finally { setBusy(null) }
  }
  const toggle = (list: string[], v: string, max = 99) => (list.includes(v) ? list.filter((x) => x !== v) : list.length >= max ? list : [...list, v])
  const note = (key: string) => msg?.at === key && <div className="mt-3"><Alert tone={msg.tone}>{msg.text}</Alert></div>

  if (!me || !cat) return <AreaShell>{msg ? <Alert tone="error">{msg.text}</Alert> : <div className="grid place-items-center py-20"><Spinner /></div>}</AreaShell>
  const blocked = ['rejected', 'suspended'].includes(me.status)

  return (
    <AreaShell>
      <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">Meu Perfil</h1>
      <p className={`mt-2 inline-block rounded-full px-3.5 py-1.5 text-[14px] font-semibold ${STATUS_TONE[me.status] ?? 'bg-ice'}`}>{me.statusLabel}</p>
      {blocked && <div className="mt-4"><Alert tone="error">Seu cadastro está bloqueado para edição. Fale com a equipe pela caixa de mensagens.</Alert></div>}

      <div className="mt-5 space-y-5">
        <section className={`${box} flex items-center gap-4`} aria-label="Foto de perfil">
          <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-full bg-ice">
            {me.photoVersion ? <img src={`/api/pro/photo?v=${me.photoVersion}`} alt="Sua foto de perfil" className="size-full object-cover" data-testid="avatar" /> : <Camera size={28} className="text-muted" aria-hidden="true" />}
          </div>
          <div className="min-w-0 flex-1">
            <input ref={file} type="file" accept="image/*" hidden data-testid="photo-input"
              onChange={async (e) => { const fl = e.target.files?.[0]; e.target.value = ''; if (!fl) return; await run('photo', async () => api.put<Me>('/pro/photo', { dataUrl: await shrink(fl) }), 'Foto atualizada.') }} />
            <button type="button" disabled={busy === 'photo'} onClick={() => file.current?.click()} className="min-h-11 rounded-xl border border-line px-4 text-[15px] font-semibold">{me.photoVersion ? 'Trocar foto' : 'Adicionar foto'}</button>
            {me.photoVersion && <button type="button" onClick={() => run('photo', () => api.del<Me>('/pro/photo'), 'Foto removida.')} className="ml-2 min-h-11 px-3 text-[14px] text-muted underline">Remover</button>}
            {note('photo')}
          </div>
        </section>

        <form className={box} onSubmit={(e) => { e.preventDefault(); void run('data', () => api.put<Me>('/pro/me', f), 'Dados salvos.') }}>
          <h2 className="text-[18px] font-bold">Dados pessoais</h2>
          <label htmlFor="fullName" className={`${label} mt-4`}>Nome completo</label>
          <input id="fullName" autoComplete="name" maxLength={80} value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} className={`${field} min-h-13`} disabled={blocked} />
          <p className={`${label} mt-4`}>Celular</p>
          <p className="mt-1 text-[16px]" data-testid="my-phone">{phone?.phone} <span className="ml-2 rounded-full bg-ice px-2.5 py-1 text-[13px] text-muted">{phone?.verified ? 'verificado' : 'não verificado'}</span></p>
          <p className="mt-1 text-[13px] leading-snug text-muted">O celular só pode ser alterado pela equipe. {user?.isAdmin||phone?.verified ? '' : 'A verificação é feita manualmente pela equipe durante a análise do cadastro; se tiver dúvidas, escreva em Mensagens.'}</p>
          <p className={label+' mt-4'}>E-mail</p><p className="mt-1 break-all text-[16px]">{user?.email??'Não cadastrado'}</p><p className="text-[13px] text-muted">{user?.emailVerified?'Confirmado':'Não confirmado'}</p><Link to="/area/email" className="mt-1 inline-block text-[14px] font-semibold underline">Alterar ou confirmar e-mail</Link>
          <label htmlFor="bio" className={`${label} mt-4`}>Apresentação profissional</label>
          <textarea id="bio" rows={4} maxLength={600} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} className={field} disabled={blocked} placeholder="Conte quem você é e como trabalha." />
          <label htmlFor="services" className={`${label} mt-4`}>Serviços que você realiza</label>
          <textarea id="services" rows={3} maxLength={600} value={f.services} onChange={(e) => setF({ ...f, services: e.target.value })} className={field} disabled={blocked} placeholder="Ex.: pintura interna, texturas, reparos em parede." />
          <label htmlFor="extra" className={`${label} mt-4`}>Outras informações relevantes</label>
          <textarea id="extra" rows={3} maxLength={600} value={f.extraInfo} onChange={(e) => setF({ ...f, extraInfo: e.target.value })} className={field} disabled={blocked} placeholder="Certificados, garantia, atendimento de emergência…" />
          <div className="mt-5"><SubmitButton loading={busy === 'data'} disabled={blocked}>Salvar dados</SubmitButton></div>
          {note('data')}
        </form>

        <section className={box}>
          <h2 className="text-[18px] font-bold">Profissões</h2>
          <ul className="mt-3 space-y-1">{me.professions.map((p) => <li key={p.slug} className="text-[16px] font-semibold">• {p.name}</li>)}{me.professions.length === 0 && <li className="text-muted">Nenhuma escolhida ainda.</li>}</ul>
          {me.status==='master'? <p className="mt-3 text-[14px] text-muted">Conta administrativa: não é necessário cadastrar profissões para ter acesso.</p>:me.canEditProfessions
            ? <p className="mt-3 text-[15px]"><Link to="/profissional" className="font-semibold underline decoration-lime decoration-2 underline-offset-4">Editar no cadastro</Link></p>
            : <p className="mt-3 text-[14px] leading-snug text-muted">Para trocar de profissão, a equipe precisa reavaliar seu cadastro. <Link className="font-semibold text-graphite underline" to="/area/mensagens" state={{ prefill: 'Quero solicitar a troca das minhas profissões.' }}>Solicitar alteração</Link></p>}
        </section>

        <form className={box} onSubmit={(e) => { e.preventDefault(); void run('work', () => api.put<Me>('/pro/me/work', { experience: exp, availability: { weekdays: work.weekdays, periods: work.periods, emergency: work.emergency }, ownTools: work.ownTools, vehicle: work.vehicle, workStructure: work.workStructure }), 'Informações de trabalho salvas.') }}>
          <h2 className="text-[18px] font-bold">Experiência e atendimento</h2>
          {me.professions.map((p) => (
            <fieldset key={p.slug} className="mt-4"><legend className={label}>{p.name}</legend>
              <div className="mt-2 flex gap-3">
                <div className="w-28"><label htmlFor={`y-${p.slug}`} className="text-[13px] text-muted">Anos</label>
                  <input id={`y-${p.slug}`} type="number" inputMode="numeric" min={0} max={60} value={exp[p.slug]?.years ?? 0} onChange={(e) => setExp({ ...exp, [p.slug]: { ...exp[p.slug], years: Number(e.target.value) } })} className={`${field} mt-1 min-h-12`} disabled={blocked} /></div>
                <div className="flex-1"><label htmlFor={`l-${p.slug}`} className="text-[13px] text-muted">Nível</label>
                  <select id={`l-${p.slug}`} value={exp[p.slug]?.level ?? 'intermediate'} onChange={(e) => setExp({ ...exp, [p.slug]: { ...exp[p.slug], level: e.target.value } })} className={`${field} mt-1 min-h-12`} disabled={blocked}>
                    {cat.options.levels.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></div>
              </div>
            </fieldset>
          ))}
          <p className={`${label} mt-5`}>Dias de atendimento</p>
          <div className="mt-2 flex flex-wrap gap-2">{cat.options.weekdays.map((o) => <button type="button" key={o.id} aria-pressed={work.weekdays.includes(o.id)} disabled={blocked} className={chip(work.weekdays.includes(o.id))} onClick={() => setWork({ ...work, weekdays: toggle(work.weekdays, o.id) })}>{o.label}</button>)}</div>
          <p className={`${label} mt-4`}>Períodos</p>
          <div className="mt-2 flex flex-wrap gap-2">{cat.options.periods.map((o) => <button type="button" key={o.id} aria-pressed={work.periods.includes(o.id)} disabled={blocked} className={chip(work.periods.includes(o.id))} onClick={() => setWork({ ...work, periods: toggle(work.periods, o.id) })}>{o.label}</button>)}</div>
          <label className="mt-4 flex min-h-11 items-center gap-3 text-[15px]"><input type="checkbox" className="size-6 accent-graphite" checked={work.emergency} onChange={(e) => setWork({ ...work, emergency: e.target.checked })} disabled={blocked} /> Atendo emergências</label>
          {([['ownTools', 'Ferramentas', cat.options.ownTools], ['vehicle', 'Veículo', cat.options.vehicle], ['workStructure', 'Como trabalha', cat.options.workStructure]] as const).map(([k, t, list]) => (
            <div key={k} className="mt-4"><label htmlFor={k} className={label}>{t}</label>
              <select id={k} value={work[k]} onChange={(e) => setWork({ ...work, [k]: e.target.value })} className={`${field} min-h-12`} disabled={blocked}><option value="">Escolha…</option>{list.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></div>
          ))}
          <div className="mt-5"><SubmitButton loading={busy === 'work'} disabled={blocked || work.weekdays.length === 0 || work.periods.length === 0 || !work.ownTools || !work.vehicle || !work.workStructure}>Salvar informações</SubmitButton></div>
          {note('work')}
        </form>

        <section className={box}>
          <h2 className="text-[18px] font-bold">Regiões atendidas</h2>
          <p className="mt-1 text-[14px] text-muted">Até {cat.limits.regions} regiões.{me.regionsChangeResubmits && ' Alterar as regiões envia seu cadastro para nova análise e ele deixa de aparecer ao público até ser aprovado.'}</p>
          <div className="mt-3 flex flex-wrap gap-2">{cat.regions.map((r) => <button type="button" key={r.slug} aria-pressed={regs.includes(r.slug)} disabled={!me.canEditRegions || blocked} className={chip(regs.includes(r.slug))} onClick={() => setRegs(toggle(regs, r.slug, cat.limits.regions))}>{r.name}</button>)}</div>
          <div className="mt-4"><SubmitButton type="button" loading={busy === 'regions'} disabled={blocked || !me.canEditRegions || regs.length === 0 || regs.join() === me.regions.join()}
            onClick={() => { if (me.regionsChangeResubmits && !window.confirm('Seu cadastro voltará para análise. Continuar?')) return; void run('regions', () => api.put<Me>('/pro/me/regions', { regions: regs }), me.regionsChangeResubmits ? 'Regiões salvas. Seu cadastro voltou para análise.' : 'Regiões salvas.') }}>Salvar regiões</SubmitButton></div>
          {note('regions')}
        </section>

        <InstallPrompt persistent />

        <SubmitButton type="button" variant="ghost" className="border border-line" onClick={async () => { try { await logout(); navigate('/', { replace: true }) } catch { setMsg({ tone: 'error', text: 'Não foi possível sair agora. Tente de novo.', at: 'top' }) } }}><LogOut size={18} aria-hidden="true" /> Sair da conta</SubmitButton>
        {note('top')}
      </div>
    </AreaShell>
  )
}
