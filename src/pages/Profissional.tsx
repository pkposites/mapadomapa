import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, ShieldCheck } from 'lucide-react'
import Header from '../components/Header'
import Footer from '../components/Footer'
import Alert from '../components/ui/Alert'
import Spinner from '../components/ui/Spinner'
import SubmitButton from '../components/ui/SubmitButton'
import Button from '../components/Button'
import Choice from '../pro/Choice'
import type { Catalog, ProState } from '../pro/types'
import type { Me } from '../area/types'
import { STATUS_HINT } from '../area/types'
import { CATEGORIES } from '../data/categories'
import { api, ApiError } from '../lib/api'

type Work = {
  exp: Record<string, { years: string; level: string }>
  weekdays: string[]; periods: string[]; emergency: boolean
  ownTools: string; vehicle: string; structure: string
}
// Conta + cinco etapas profissionais, com o progresso real de 1 a 6.
const TITLES = ['Suas profissões', 'Onde você atende', 'Seu trabalho', 'Perguntas técnicas', 'Revisar e enviar']
const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

function hydrate(s: ProState): { prof: string[]; reg: string[]; work: Work } {
  const exp: Work['exp'] = {}
  for (const p of s.professions) exp[p.slug] = { years: p.experienceYears === null ? '' : String(p.experienceYears), level: p.selfLevel ?? '' }
  return {
    prof: s.professions.map((p) => p.slug), reg: s.regions,
    work: {
      exp, weekdays: s.profile.availability?.weekdays ?? [], periods: s.profile.availability?.periods ?? [], emergency: s.profile.availability?.emergency ?? false,
      ownTools: s.profile.ownTools ?? '', vehicle: s.profile.vehicle ?? '', structure: s.profile.workStructure ?? '',
    },
  }
}

export default function Profissional() {
  const navigate = useNavigate()
  const [cat, setCat] = useState<Catalog | null>(null)
  const [state, setState] = useState<ProState | null>(null)
  const [step, setStep] = useState(1)
  const [identity, setIdentity] = useState<Pick<Me, 'fullName' | 'bio' | 'services' | 'extraInfo'> | null>(null)
  const [fullName, setFullName] = useState('')
  const [prof, setProf] = useState<string[]>([])
  const [reg, setReg] = useState<string[]>([])
  const [work, setWork] = useState<Work>({ exp: {}, weekdays: [], periods: [], emergency: false, ownTools: '', vehicle: '', structure: '' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState(false)

  const apply = useCallback((s: ProState) => {
    setState(s)
    const h = hydrate(s)
    setProf(h.prof); setReg(h.reg); setWork(h.work)
  }, [])

  useEffect(() => {
    Promise.all([api.get<Catalog>('/pro/catalog'), api.get<ProState>('/pro/profile'), api.get<Me>('/pro/me')])
      .then(([c, s, me]) => {
        setCat(c); apply(s); setIdentity(me); setFullName(me.fullName ?? ''); setStep(s.locked ? 5 : s.nextStep)
      })
      .catch(() => setLoadError(true))
  }, [apply])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null)
    try { await fn() } catch (err) {
      if (err instanceof ApiError && err.code === 'profile_incomplete') { setError(err.message); setStep(Number(err.data.nextStep) || 1) }
      else setError(err instanceof ApiError ? err.message : 'Algo deu errado. Tente de novo em instantes.')
      window.scrollTo(0, 0)
    } finally { setBusy(false) }
  }
  const put = async (path: string, body: unknown): Promise<ProState> => {
    const s = await api.put<ProState>(path, body); apply(s); return s
  }
  const go = (n: number) => { setError(null); setStep(n); window.scrollTo(0, 0) }

  if (loadError) return <Shell><Alert tone="error">Não foi possível carregar o seu cadastro. Confira a internet e <Link to="/profissional" reloadDocument className="font-semibold underline">tente de novo</Link>.</Alert></Shell>
  if (!cat || !state || !identity) return <Spinner fullPage />

  const maxP = cat.limits.professions, maxR = cat.limits.regions
  const workOk = prof.length > 0 && prof.every((s) => work.exp[s]?.years !== '' && work.exp[s]?.years !== undefined && Number.isInteger(Number(work.exp[s].years)) && Number(work.exp[s].years) >= 0 && Number(work.exp[s].years) <= 60 && work.exp[s].level) &&
    work.weekdays.length > 0 && work.periods.length > 0 && work.ownTools && work.vehicle && work.structure

  // ----- Passo 1 -----
  const s1 = (
    <>
      <Lead title="Qual é a sua profissão?" text={`Escolha até ${maxP}. Você pode mudar depois, enquanto não enviar.`} counter={`${prof.length} de ${maxP}`} />
      <div className="space-y-3">
        {cat.professions.map((p) => {
          const Icon = CATEGORIES.find((c) => c.id === p.slug)?.icon
          const sel = prof.includes(p.slug)
          return (
            <Choice key={p.slug} kind="checkbox" selected={sel} disabled={!sel && prof.length >= maxP} onClick={() => setProf(toggle(prof, p.slug))}>
              <span className="flex items-center gap-3">{Icon && <Icon size={22} strokeWidth={1.75} aria-hidden="true" />}{p.name}</span>
            </Choice>
          )
        })}
      </div>
      {prof.length >= maxP && <p className="mt-3 text-[14px] text-muted">Limite de {maxP} profissões atingido. Desmarque uma para trocar.</p>}
    </>
  )
  // ----- Passo 2 -----
  const s2 = (
    <>
      <Lead title="Onde você atende?" text={`Escolha até ${maxR} regiões de São Paulo.`} counter={`${reg.length} de ${maxR}`} />
      <div className="space-y-3">
        {cat.regions.map((r) => (
          <Choice key={r.slug} kind="checkbox" selected={reg.includes(r.slug)} disabled={!reg.includes(r.slug) && reg.length >= maxR} onClick={() => setReg(toggle(reg, r.slug))}>{r.name}</Choice>
        ))}
      </div>
    </>
  )
  // ----- Passo 3 -----
  const upd = (patch: Partial<Work>) => setWork((w) => ({ ...w, ...patch }))
  const chip = (on: boolean) => `min-h-11 min-w-14 rounded-xl border px-3 text-[15px] font-semibold transition duration-150 active:scale-95 ${on ? 'border-graphite bg-graphite text-white' : 'border-line bg-white text-graphite'}`
  const s3 = (
    <>
      <Lead title="Conte sobre o seu trabalho" text="Respostas simples. Isso ajuda a encontrar os pedidos certos para você." />
      {state.professions.map((p) => (
        <Block key={p.slug} title={p.name}>
          <label htmlFor={`y-${p.slug}`} className="text-[15px] font-semibold">Há quantos anos você trabalha com isso?</label>
          <input id={`y-${p.slug}`} type="number" inputMode="numeric" min={0} max={60} step={1} placeholder="Ex.: 5" value={work.exp[p.slug]?.years ?? ''}
            onChange={(e) => upd({ exp: { ...work.exp, [p.slug]: { level: work.exp[p.slug]?.level ?? '', years: e.target.value } } })}
            className="mt-2 block min-h-13 w-full rounded-2xl border border-line bg-white px-4 text-[17px] focus:outline-2 focus:outline-offset-2 focus:outline-graphite" />
          <p className="mt-4 text-[15px] font-semibold">Seu nível de conhecimento</p>
          <div className="mt-2 grid gap-2">
            {cat.options.levels.map((l) => (
              <Choice key={l.id} selected={work.exp[p.slug]?.level === l.id} hint={l.hint}
                onClick={() => upd({ exp: { ...work.exp, [p.slug]: { years: work.exp[p.slug]?.years ?? '', level: l.id } } })}>{l.label}</Choice>
            ))}
          </div>
        </Block>
      ))}
      <Block title="Disponibilidade">
        <p className="text-[15px] font-semibold">Dias em que você atende</p>
        <div className="mt-2 flex flex-wrap gap-2">{cat.options.weekdays.map((d) => <button key={d.id} type="button" aria-pressed={work.weekdays.includes(d.id)} className={chip(work.weekdays.includes(d.id))} onClick={() => upd({ weekdays: toggle(work.weekdays, d.id) })}>{d.label}</button>)}</div>
        <p className="mt-4 text-[15px] font-semibold">Períodos</p>
        <div className="mt-2 flex flex-wrap gap-2">{cat.options.periods.map((d) => <button key={d.id} type="button" aria-pressed={work.periods.includes(d.id)} className={chip(work.periods.includes(d.id))} onClick={() => upd({ periods: toggle(work.periods, d.id) })}>{d.label}</button>)}</div>
        <div className="mt-4"><Choice kind="checkbox" selected={work.emergency} onClick={() => upd({ emergency: !work.emergency })}>Atendo chamados de urgência</Choice></div>
      </Block>
      <Block title="Ferramentas"><Radios list={cat.options.ownTools} value={work.ownTools} onPick={(v) => upd({ ownTools: v })} /></Block>
      <Block title="Veículo"><Radios list={cat.options.vehicle} value={work.vehicle} onPick={(v) => upd({ vehicle: v })} /></Block>
      <Block title="Como você trabalha"><Radios list={cat.options.workStructure} value={work.structure} onPick={(v) => upd({ structure: v })} /></Block>
    </>
  )

  const nameOk = fullName.trim().length >= 3 && /\p{L}{2,}/u.test(fullName)
  const saveName = async () => {
    if (fullName.trim() !== (identity.fullName ?? '').trim()) {
      const me = await api.put<Me>('/pro/me', { fullName: fullName.trim(), bio: identity.bio, services: identity.services, extraInfo: identity.extraInfo })
      setIdentity(me)
    }
  }
  const submit = () => run(async () => {
    if (!nameOk) { setError('Informe seu nome completo antes de enviar.'); return }
    await saveName()
    await api.post('/pro/submit')
    apply(await api.get<ProState>('/pro/profile'))
    setStep(5)
  })

  // ----- Passo 5 -----
  const nameOf = (slug: string) => cat.regions.find((r) => r.slug === slug)?.name ?? slug
  const s5 = state.locked ? (
    <div className="text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-lime text-graphite"><CheckCircle2 size={30} strokeWidth={2} aria-hidden="true" /></span>
      <h2 className="mt-4 text-[24px] font-bold tracking-tight">{state.profile.reviewStatus === 'approved' ? 'Cadastro aprovado!' : state.profile.reviewStatus === 'pending_review' ? 'Cadastro enviado!' : 'Situação do seu cadastro'}</h2>
      <p className="mt-2 text-[16px] leading-relaxed text-muted">{STATUS_HINT[state.profile.reviewStatus] ?? state.approvalNote}</p>
      {state.profile.reviewStatus === 'pending_review' && <p className="mt-2 text-[14px] text-muted">Acompanhe a análise em sua área. Você já pode complementar seu perfil com foto e apresentação.</p>}
      <div className="mt-6"><Button to="/area" variant="dark" fullWidth>Ir para minha área</Button></div>
    </div>
  ) : (
    <>
      <Lead title="Confira e envie" text="Revise suas informações. Depois de enviar, você ainda pode atualizar nome, foto, apresentação, experiência e regiões em Meu Perfil enquanto analisamos. Para trocar de profissão ou de respostas, fale com a equipe." />
      <Block title="Identificação">
        <label htmlFor="full-name" className="text-[15px] font-semibold">Seu nome completo *</label>
        <input id="full-name" data-clarity-mask="true" autoComplete="name" maxLength={80} value={fullName} onChange={e => setFullName(e.target.value)} className="mt-2 block min-h-13 w-full rounded-2xl border border-line bg-white px-4 text-[17px]" placeholder="Como você se chama?" />
        <p className="mt-2 text-sm text-muted">Assim a equipe consegue identificar você durante a análise.</p>
      </Block>
      <Block title="Profissões">{state.professions.map((p) => <p key={p.slug} className="text-[16px]">{p.name} · {p.experienceYears} anos · {cat.options.levels.find((l) => l.id === p.selfLevel)?.label}</p>)}</Block>
      <Block title="Regiões"><p className="text-[16px]">{state.regions.map(nameOf).join(' e ')}</p></Block>
      <Block title="Perguntas técnicas">{state.professions.map((p) => <p key={p.slug} className="text-[16px]">{p.name}: {state.progress.assessment[p.slug].answered} de {state.progress.assessment[p.slug].total} respondidas</p>)}</Block>
      <div className="mt-4 flex gap-3 rounded-2xl bg-white p-4 text-[15px] leading-snug"><ShieldCheck size={22} strokeWidth={1.75} className="shrink-0" aria-hidden="true" /><p>{state.approvalNote}</p></div>
    </>
  )

  // ----- Ações por passo -----
  const saveStep = async () => {
    if (step === 1) { await put('/pro/professions', { professions: prof }) }
    else if (step === 2) { await put('/pro/regions', { regions: reg }) }
    else if (step === 3) {
      await put('/pro/work', {
        experience: Object.fromEntries(prof.map((s) => [s, { years: Number(work.exp[s]?.years), level: work.exp[s]?.level }])),
        availability: { weekdays: work.weekdays, periods: work.periods, emergency: work.emergency },
        ownTools: work.ownTools, vehicle: work.vehicle, workStructure: work.structure,
      })
    }
  }
  const next = () => run(async () => { await saveStep(); go(step + 1) })
  const canNext = step === 1 ? prof.length >= 1 && prof.length <= maxP : step === 2 ? reg.length >= 1 && reg.length <= maxR : step === 3 ? Boolean(workOk) : false

  const later = () => run(async () => {
    if (step <= 3 && canNext) await saveStep()
    else if (step === 5 && nameOk) await saveName()
    else if (!window.confirm('Esta etapa ainda está incompleta. As etapas anteriores já estão salvas. Sair agora?')) return
    navigate('/area')
  })

  return (
    <Shell step={step} locked={state.locked}>
      {error && <div className="mb-4"><Alert tone="error">{error}</Alert></div>}
      {step === 1 && s1}{step === 2 && s2}{step === 3 && s3}
      {step === 4 && <Assessment cat={cat} state={state} setState={setState} onBack={() => go(3)} onDone={() => go(5)} />}
      {step === 5 && s5}
      {(step <= 3 || (step === 5 && !state.locked)) && (
        <div className="sticky bottom-0 -mx-5 mt-8 border-t border-line bg-ice px-5 py-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          <div className="mx-auto flex max-w-lg gap-3">
            {step > 1 && <SubmitButton type="button" variant="ghost" className="w-auto border border-line" disabled={busy} onClick={() => go(step - 1)}><ArrowLeft size={20} aria-hidden="true" /> Voltar</SubmitButton>}
            {step <= 3 ? <SubmitButton type="button" loading={busy} disabled={!canNext} onClick={next}>Continuar</SubmitButton>
              : <SubmitButton type="button" loading={busy} disabled={!nameOk} onClick={submit}>Enviar para análise</SubmitButton>}
          </div>
          <p className="mx-auto mt-2 max-w-lg text-center"><button type="button" className="py-3 text-[14px] font-medium text-muted underline underline-offset-4" disabled={busy} onClick={later}>{step === 5 && !nameOk || step <= 3 && !canNext ? 'Sair e continuar depois' : 'Salvar e continuar depois'}</button></p>
        </div>
      )}
    </Shell>
  )
}

function Shell({ children, step, locked }: { children: React.ReactNode; step?: number; locked?: boolean }) {
  return (
    <>
      <Header variant="page" />
      <main className="bg-ice">
        <div className="mx-auto max-w-lg px-5 pb-6 pt-6 md:pt-10">
          {step && !locked && (
            <div className="mb-6">
              <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">Etapa {step + 1} de 6 · {TITLES[step - 1]}</p>
              <div className="mt-3 flex gap-1.5" role="progressbar" aria-valuemin={1} aria-label="Progresso do cadastro" aria-valuemax={6} aria-valuenow={step + 1}>
                {[1, 2, 3, 4, 5, 6].map((n) => <span key={n} className={`h-1.5 flex-1 rounded-full ${n <= step + 1 ? 'bg-graphite' : 'bg-line'}`} />)}
              </div>
            </div>
          )}
          {children}
        </div>
      </main>
      <Footer />
    </>
  )
}
const Lead = ({ title, text, counter }: { title: string; text: string; counter?: string }) => (
  <div className="mb-5">
    <div className="flex items-start justify-between gap-3"><h1 className="text-balance text-[28px] font-bold leading-[1.1] tracking-[-0.02em]">{title}</h1>{counter && <span className="mt-1 shrink-0 rounded-full bg-white px-3 py-1 text-[13px] font-semibold">{counter}</span>}</div>
    <p className="mt-2 text-[16px] leading-relaxed text-muted">{text}</p>
  </div>
)
const Block = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mt-4 rounded-3xl bg-white p-5"><h2 className="mb-3 text-[18px] font-semibold tracking-tight">{title}</h2>{children}</section>
)
const Radios = ({ list, value, onPick }: { list: { id: string; label: string }[]; value: string; onPick: (v: string) => void }) => (
  <div className="grid gap-2">{list.map((o) => <Choice key={o.id} selected={value === o.id} onClick={() => onPick(o.id)}>{o.label}</Choice>)}</div>
)

// ----- Passo 4: uma pergunta por tela, salvamento automático -----
function Assessment({ cat, state, setState, onBack, onDone }: { cat: Catalog; state: ProState; setState: (s: ProState) => void; onBack: () => void; onDone: () => void }) {
  const navigate = useNavigate()
  const flat = useMemo(() => state.professions.flatMap((p) => (state.questionnaires[p.slug] ?? []).map((q) => ({ p, q }))), [state.professions, state.questionnaires])
  const isDone = (slug: string, q: ProState['questionnaires'][string][number]) => {
    const a = state.answers[slug]?.[q.id]
    return q.kind === 'choice' ? Boolean(a?.choice) : (a?.text ?? '').trim().length >= cat.limits.openMin
  }
  const [i, setI] = useState(() => { const k = flat.findIndex(({ p, q }) => !isDone(p.slug, q)); return k === -1 ? 0 : k })
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const cur = flat[i]
  useEffect(() => { if (cur?.q.kind === 'open') setText(state.answers[cur.p.slug]?.[cur.q.id]?.text ?? ''); setErr(null) }, [i]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!cur) return <Alert tone="info">Escolha suas profissões antes de responder às perguntas.</Alert>

  const save = async (answer: { questionId: string; choice?: string; text?: string }) => {
    setBusy(true); setErr(null)
    try { setState(await api.put<ProState>('/pro/answers', { profession: cur.p.slug, answers: [answer] })); return true }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Não foi possível salvar. Tente de novo.'); return false }
    finally { setBusy(false) }
  }
  const answered = isDone(cur.p.slug, cur.q)
  const last = i === flat.length - 1
  const advance = () => (last ? onDone() : (setI(i + 1), window.scrollTo(0, 0)))
  const chosen = state.answers[cur.p.slug]?.[cur.q.id]?.choice
  const tooShort = cur.q.kind === 'open' && text.trim().length < cat.limits.openMin
  const leave = async () => {
    if (cur.q.kind === 'open' && text.trim() !== (state.answers[cur.p.slug]?.[cur.q.id]?.text ?? '').trim()) {
      if (tooShort) {
        if (!window.confirm('A resposta atual ainda não pode ser salva. Sair e manter as anteriores?')) return
      } else if (!(await save({ questionId: cur.q.id, text: text.trim() }))) return
    }
    navigate('/area')
  }

  return (
    <>
      <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">{cur.p.name} · Pergunta {i + 1} de {flat.length}</p>
      <h1 className="mt-2 text-balance text-[24px] font-bold leading-[1.15] tracking-[-0.02em]">{cur.q.prompt}</h1>
      {err && <div className="mt-4"><Alert tone="error">{err}</Alert></div>}
      <div className="mt-5 grid gap-3">
        {cur.q.kind === 'choice' ? cur.q.options.map((o) => (
          <Choice key={o.id} selected={chosen === o.id} disabled={busy} onClick={() => void save({ questionId: cur.q.id, choice: o.id })}>{o.text}</Choice>
        )) : (
          <div>
            <p className="mb-2 text-[14px] text-muted">{cur.q.hint}</p>
            <textarea aria-label="Sua resposta" rows={7} disabled={busy} maxLength={cat.limits.openMax} value={text} onChange={(e) => setText(e.target.value)}
              className="block w-full rounded-2xl border border-line bg-white p-4 text-[17px] leading-relaxed focus:outline-2 focus:outline-offset-2 focus:outline-graphite" placeholder="Escreva com suas palavras…" />
            <p className="mt-1 flex justify-between text-[13px] text-muted"><span>{tooShort ? `Escreva pelo menos ${cat.limits.openMin} caracteres` : 'Ok'}</span><span>{text.length}/{cat.limits.openMax}</span></p>
          </div>
        )}
      </div>
      <div className="sticky bottom-0 -mx-5 mt-8 border-t border-line bg-ice px-5 py-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <div className="mx-auto flex max-w-lg gap-3">
          <SubmitButton type="button" variant="ghost" className="w-auto border border-line" disabled={busy} onClick={() => (i === 0 ? onBack() : (setI(i - 1), window.scrollTo(0, 0)))}><ArrowLeft size={20} aria-hidden="true" /> Voltar</SubmitButton>
          <SubmitButton type="button" loading={busy} disabled={cur.q.kind === 'choice' ? !answered : tooShort}
            onClick={async () => { if (cur.q.kind === 'open') { if (!(await save({ questionId: cur.q.id, text: text.trim() }))) return } advance() }}>
            {last ? 'Revisar' : 'Próxima'}
          </SubmitButton>
        </div>
        <p className="mx-auto mt-2 max-w-lg text-center text-[13px] text-muted">As alternativas são salvas na escolha; respostas escritas, ao avançar.</p>
        <p className="mt-2 text-center"><button type="button" disabled={busy} onClick={() => void leave()} className="inline-block py-2 text-sm font-medium underline">Salvar e continuar depois</button></p>
      </div>
    </>
  )
}
