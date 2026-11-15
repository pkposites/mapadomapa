import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BadgeCheck, Camera, ChevronDown, LogOut } from 'lucide-react'
import AreaShell from '../../area/Shell'
import Alert from '../../components/ui/Alert'
import { Sk } from '../../components/ui/Skeleton'
import { toast } from '../../lib/toast'
import InstallPrompt from '../../area/InstallPrompt'
import SubmitButton from '../../components/ui/SubmitButton'
import { useAuth } from '../../auth/AuthContext'
import { api, ApiError } from '../../lib/api'
import type { Catalog } from '../../pro/types'
import type { Me } from '../../area/types'
import { STATUS_TONE } from '../../area/types'

const label = 'block text-[15px] font-semibold'
const field = 'mt-2 block w-full rounded-2xl border border-line bg-white px-4 py-3 text-[16px] focus:outline-2 focus:outline-offset-2 focus:outline-graphite'
const chip = (on: boolean) => `inline-flex min-h-11 items-center rounded-full border px-4 text-[15px] font-medium ${on ? 'border-graphite bg-graphite text-white' : 'border-line bg-white'}`

/** Seção recolhível do perfil: título, resumo e "Editar". */
function Sec({ id, title, summary, openId, setOpenId, children }: { id: string; title: string; summary: string; openId: string | null; setOpenId: (v: string | null) => void; children: ReactNode }) {
  const open = openId === id
  return (
    <section className="overflow-hidden rounded-2xl bg-white" data-testid={`sec-${id}`}>
      <button type="button" aria-expanded={open} onClick={() => setOpenId(open ? null : id)} className="flex min-h-16 w-full items-center gap-3 px-4 py-2 text-left">
        <span className="min-w-0 flex-1"><span className="block text-body font-semibold">{title}</span><span className="block truncate text-small text-muted">{summary}</span></span>
        <span className="flex items-center gap-1 text-small font-semibold underline decoration-lime decoration-2 underline-offset-4">{open ? 'Fechar' : 'Editar'}<ChevronDown size={18} className={open ? 'rotate-180' : ''} aria-hidden="true" /></span>
      </button>
      {open && <div className="animate-[route-in_.18s_ease-out] border-t border-line px-4 pb-5 pt-1">{children}</div>}
    </section>
  )
}

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
  const [openId, setOpenId] = useState<string | null>(null)
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
    api.get<Me>('/pro/me').then((m) => { apply(m); if (!m.fullName) setOpenId('dados') }).catch(() => setMsg({ tone: 'error', text: 'Não foi possível carregar o perfil.', at: 'top' }))
    api.get<Catalog>('/pro/catalog').then(setCat).catch(() => undefined)
  }, [])
  useEffect(() => { if (user) setPhone({ phone: user.phone, verified: user.phoneVerified }) }, [user])

  const run = async (key: string, fn: () => Promise<Me>, ok: string) => {
    setBusy(key); setMsg(null)
    try { apply(await fn()); setMsg({ tone: 'success', text: ok, at: key }); toast('Salvo'); if (key !== 'photo') setOpenId(null) } catch (e) { setMsg({ tone: 'error', text: e instanceof ApiError ? e.message : 'Algo deu errado.', at: key }) } finally { setBusy(null) }
  }
  const toggle = (list: string[], v: string, max = 99) => (list.includes(v) ? list.filter((x) => x !== v) : list.length >= max ? list : [...list, v])
  const note = (key: string) => msg?.at === key && <div className="mt-3"><Alert tone={msg.tone}>{msg.text}</Alert></div>

  if (!me || !cat) return <AreaShell>{msg ? <Alert tone="error">{msg.text}</Alert> : <div role="status" aria-label="Carregando" className="space-y-3"><Sk className="h-56" /><Sk className="h-16" /><Sk className="h-16" /><Sk className="h-16" /></div>}</AreaShell>
  const blocked = ['rejected', 'suspended'].includes(me.status)

  // Completude: 7 itens que já existem no cadastro
  const items = [
    ['nome', Boolean(me.fullName)], ['apresentação', Boolean(me.bio)], ['serviços', Boolean(me.services)], ['foto de perfil', Boolean(me.photoVersion)],
    ['profissões', me.professions.length > 0], ['regiões', me.regions.length > 0],
    ['dias e forma de atendimento', Boolean(me.availability?.weekdays?.length && me.availability?.periods?.length && me.ownTools && me.vehicle && me.workStructure)],
  ] as const
  const pct = Math.round((items.filter(([, ok]) => ok).length / items.length) * 100)
  const missing = items.find(([, ok]) => !ok)?.[0]
  const regionNames = cat.regions.filter((r) => me.regions.includes(r.slug)).map((r) => r.name)
  const ini = (me.fullName ?? '').trim().split(/\s+/).slice(0, 2).map((x) => x[0]?.toUpperCase() ?? '').join('')
  const sec = { openId, setOpenId }

  return (
    <AreaShell>
      <h1 className="sr-only">Meu Perfil</h1>
      {blocked && <div className="mb-3"><Alert tone="error">Seu cadastro está bloqueado para edição. Fale com a equipe pela caixa de mensagens.</Alert></div>}

      {/* Identidade */}
      <section className="rounded-2xl bg-white px-4 pb-4 pt-5 text-center" aria-label="Seu perfil" data-testid="identity">
        <input ref={file} type="file" accept="image/*" hidden data-testid="photo-input"
          onChange={async (e) => { const fl = e.target.files?.[0]; e.target.value = ''; if (!fl) return; await run('photo', async () => api.put<Me>('/pro/photo', { dataUrl: await shrink(fl) }), 'Foto atualizada.') }} />
        <button type="button" onClick={() => file.current?.click()} disabled={busy === 'photo'} aria-label={me.photoVersion ? 'Trocar foto de perfil' : 'Adicionar foto de perfil'} className="relative mx-auto block size-28 rounded-full">
          <span className="grid size-28 place-items-center overflow-hidden rounded-full bg-lime text-[36px] font-bold text-graphite ring-4 ring-lime/60">
            {me.photoVersion ? <img src={`/api/pro/photo?v=${me.photoVersion}`} alt="Sua foto de perfil" className="size-full object-cover" data-testid="avatar" /> : ini || <Camera size={36} aria-hidden="true" />}
          </span>
          <span className="absolute -bottom-1 -right-1 grid size-9 place-items-center rounded-full border-2 border-white bg-graphite text-white"><Camera size={16} aria-hidden="true" /></span>
        </button>
        {me.photoVersion && <button type="button" onClick={() => run('photo', () => api.del<Me>('/pro/photo'), 'Foto removida.')} className="mt-1 min-h-11 px-3 text-small text-muted underline">Remover foto</button>}
        <p className="mt-2 text-heading font-bold tracking-[-0.01em]" data-clarity-mask="true">{me.fullName ?? 'Seu nome'}</p>
        <p className="text-small text-muted">{me.professions.map((x) => x.name).join(' · ') || 'Profissão não escolhida'}{regionNames.length ? ` · ${regionNames.join(', ')}` : ''}</p>
        <p className={`mt-2 inline-flex items-center gap-1 rounded-full px-3 py-1 text-small font-semibold ${STATUS_TONE[me.status] ?? 'bg-ice'}`}>{me.status === 'approved' && <BadgeCheck size={16} aria-hidden="true" />}{me.statusLabel}</p>
        <div className="mt-4 text-left" data-testid="completeness">
          <div className="flex justify-between text-small font-semibold"><span>Perfil completo</span><span>{pct}%</span></div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Perfil completo"><div className="h-full rounded-full bg-lime transition-all" style={{ width: `${pct}%` }} /></div>
          <p className="mt-1.5 text-tiny text-muted">{missing ? `Falta: ${missing}.` : 'Tudo preenchido. Ótimo!'}</p>
        </div>
      </section>
      {note('photo')}

      <div className="mt-3 space-y-3">
        <Sec id="dados" title="Dados pessoais" summary={`${me.fullName ?? 'Informe seu nome'} · ${phone?.phone ?? ''}`} {...sec}>
          <form onSubmit={(e) => { e.preventDefault(); void run('data', () => api.put<Me>('/pro/me', f), 'Dados salvos.') }}>
            <label htmlFor="fullName" className={`${label} mt-3`}>Nome completo</label>
            <input id="fullName" autoComplete="name" maxLength={80} value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} className={`${field} min-h-13`} disabled={blocked} />
            <p className={`${label} mt-4`}>Celular</p>
            <p className="mt-1 text-[16px]" data-testid="my-phone">{phone?.phone} <span className="ml-2 rounded-full bg-ice px-2.5 py-1 text-[13px] text-muted">{phone?.verified ? 'verificado' : 'não verificado'}</span></p>
            <p className="mt-1 text-[13px] leading-snug text-muted">O celular só pode ser alterado pela equipe. {phone?.verified ? '' : 'A verificação é feita manualmente pela equipe durante a análise do cadastro; se tiver dúvidas, escreva em Mensagens.'}</p>
            <label htmlFor="bio" className={`${label} mt-4`}>Apresentação profissional</label>
            <textarea id="bio" rows={4} maxLength={600} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} className={field} disabled={blocked} placeholder="Conte quem você é e como trabalha." />
            <div className="mt-5"><SubmitButton loading={busy === 'data'} disabled={blocked}>Salvar dados</SubmitButton></div>
            {note('data')}
          </form>
        </Sec>

        <Sec id="servicos" title="Serviços" summary={me.services ?? 'Descreva o que você faz'} {...sec}>
          <form onSubmit={(e) => { e.preventDefault(); void run('data', () => api.put<Me>('/pro/me', f), 'Serviços salvos.') }}>
            <label htmlFor="services" className={`${label} mt-3`}>Serviços que você realiza</label>
            <textarea id="services" rows={4} maxLength={600} value={f.services} onChange={(e) => setF({ ...f, services: e.target.value })} className={field} disabled={blocked} placeholder="Ex.: pintura interna, texturas, reparos em parede." />
            <label htmlFor="extra" className={`${label} mt-4`}>Outras informações relevantes</label>
            <textarea id="extra" rows={3} maxLength={600} value={f.extraInfo} onChange={(e) => setF({ ...f, extraInfo: e.target.value })} className={field} disabled={blocked} placeholder="Certificados, garantia, atendimento de emergência…" />
            <div className="mt-5"><SubmitButton loading={busy === 'data'} disabled={blocked || f.fullName.trim().length < 3}>Salvar serviços</SubmitButton></div>
            {note('data')}
          </form>
        </Sec>

        <Sec id="profissoes" title="Profissões" summary={me.professions.map((x) => x.name).join(' · ') || 'Nenhuma escolhida ainda'} {...sec}>
          <ul className="mt-3 space-y-1">{me.professions.map((p) => <li key={p.slug} className="text-[16px] font-semibold">• {p.name}</li>)}{me.professions.length === 0 && <li className="text-muted">Nenhuma escolhida ainda.</li>}</ul>
          {me.canEditProfessions
            ? <p className="mt-3 text-[15px]"><Link to="/profissional" className="font-semibold underline decoration-lime decoration-2 underline-offset-4">Editar no cadastro</Link></p>
            : <p className="mt-3 text-[14px] leading-snug text-muted">Para trocar de profissão, a equipe precisa reavaliar seu cadastro. <Link className="font-semibold text-graphite underline" to="/area/mensagens" state={{ prefill: 'Quero solicitar a troca das minhas profissões.' }}>Solicitar alteração</Link></p>}
        </Sec>

        <Sec id="experiencia" title="Experiência e atendimento" summary={me.professions.length ? me.professions.map((x) => `${x.experienceYears ?? 0} anos`).join(' · ') : 'Não informada'} {...sec}>
          <form onSubmit={(e) => { e.preventDefault(); void run('work', () => api.put<Me>('/pro/me/work', { experience: exp, availability: { weekdays: work.weekdays, periods: work.periods, emergency: work.emergency }, ownTools: work.ownTools, vehicle: work.vehicle, workStructure: work.workStructure }), 'Informações de trabalho salvas.') }}>
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
        </Sec>

        <Sec id="regioes" title="Regiões atendidas" summary={regionNames.join(' · ') || 'Nenhuma escolhida'} {...sec}>
          <p className="mt-1 text-[14px] text-muted">Até {cat.limits.regions} regiões.{me.regionsChangeResubmits && ' Alterar as regiões envia seu cadastro para nova análise e ele deixa de aparecer ao público até ser aprovado.'}</p>
          <div className="mt-3 flex flex-wrap gap-2">{cat.regions.map((r) => <button type="button" key={r.slug} aria-pressed={regs.includes(r.slug)} disabled={!me.canEditRegions || blocked} className={chip(regs.includes(r.slug))} onClick={() => setRegs(toggle(regs, r.slug, cat.limits.regions))}>{r.name}</button>)}</div>
          <div className="mt-4"><SubmitButton type="button" loading={busy === 'regions'} disabled={blocked || !me.canEditRegions || regs.length === 0 || regs.join() === me.regions.join()}
            onClick={() => { if (me.regionsChangeResubmits && !window.confirm('Seu cadastro voltará para análise. Continuar?')) return; void run('regions', () => api.put<Me>('/pro/me/regions', { regions: regs }), me.regionsChangeResubmits ? 'Regiões salvas. Seu cadastro voltou para análise.' : 'Regiões salvas.') }}>Salvar regiões</SubmitButton></div>
          {note('regions')}
        </Sec>

        <InstallPrompt persistent />

        <SubmitButton type="button" variant="ghost" className="border border-line bg-white" onClick={async () => { try { await logout(); navigate('/', { replace: true }) } catch { setMsg({ tone: 'error', text: 'Não foi possível sair agora. Tente de novo.', at: 'top' }) } }}><LogOut size={18} aria-hidden="true" /> Sair da conta</SubmitButton>
        {note('top')}
      </div>
    </AreaShell>
  )
}
