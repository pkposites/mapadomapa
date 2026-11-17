import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Clock, MessageCircle, Plus, RefreshCw, UserRound } from 'lucide-react'
import Header from '../components/Header'
import Footer from '../components/Footer'
import Alert from '../components/ui/Alert'
import Spinner from '../components/ui/Spinner'
import SubmitButton from '../components/ui/SubmitButton'
import { PhoneField } from '../components/ui/Field'
import AdminGate from '../admin/AdminGate'
import { personalize, waUrl } from '../admin/contact'
import { api, ApiError } from '../lib/api'
import type { Catalog } from '../pro/types'

const URGENCY = [{ id: 'urgent', label: 'Urgente (hoje ou amanhã)' }, { id: 'this_week', label: 'Nesta semana' }, { id: 'flexible', label: 'Sem pressa / flexível' }]
const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Rascunho', cls: 'bg-ice text-graphite' }, published: { label: 'Aberto', cls: 'bg-[#e4f9c9] text-[#2b5a00]' }, closed: { label: 'Encerrado', cls: 'bg-[#eceff0] text-muted' },
}
type Summary = { id: string; status: string; title: string; profession: string; region: string; neighborhood: string; urgency: string; interests: number; clientName: string; publishedAt: string | null; closedAt: string | null; createdAt: string }
type IntakeItem = {
  id: string; client_name: string; service: string; location: string; urgency: string; contact_preference: string; received_at: string
}
type IntakeDetail = IntakeItem & { client_phone: string; description: string; photo_reference: string | null; converted_request_id: string | null }
const normalized = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
type Detail = Summary & {
  origin?: string | null; contactPreference?: string | null; photoReference?: string | null
  description: string; periodNote: string | null; consent: boolean; consentAt: string | null; professionSlug: string; regionSlug: string; eligible: number
  client: { name: string; phone: string; whatsapp: string }
  compatible?: { id: string; name: string | null; phone: string | null; whatsapp: string | null; phoneVerified: boolean }[]
  interested: { id: string; name: string | null; phone: string | null; whatsapp: string | null; phoneVerified: boolean; professions: string[]; regions: string[]; at: string; selectedAt?: string | null; deliveredAt?: string | null; canReceive?: boolean }[]
}
const fmt = (d: string) => new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
const urgencyLabel = (u: string) => URGENCY.find((x) => x.id === u)?.label ?? u
const Badge = ({ s }: { s: string }) => <span className={`inline-flex min-h-7 items-center rounded-full px-3 text-[13px] font-semibold ${STATUS[s]?.cls}`}>{STATUS[s]?.label ?? s}</span>

function Shell({ title, back, children }: { title: string; back: string; children: ReactNode }) {
  return (
    <><Header variant="page" /><main className="bg-ice"><div className="mx-auto max-w-2xl px-5 pb-10 pt-4 md:pt-8">
      <Link to={back} className="inline-flex min-h-11 items-center gap-2 text-[15px] font-semibold"><ArrowLeft size={20} aria-hidden="true" /> Voltar</Link>
      <h1 className="mt-2 text-[28px] font-bold tracking-[-0.02em]">{title}</h1>{children}</div></main><Footer /></>
  )
}

// ---------- Lista ----------
export function AdminPedidos() { return <AdminGate><List /></AdminGate> }
function Incoming() {
  const [incoming, setIncoming] = useState<{ count: number; items: IntakeItem[] } | null>(null)
  const [failed, setFailed] = useState(false)
  const refresh = () => { setFailed(false); api.get<{count:number; items:IntakeItem[]}>('/admin/requests/intake').then(setIncoming).catch(() => setFailed(true)) }
  useEffect(refresh, [])
  return <section className="mt-5 rounded-3xl bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="text-[18px] font-bold">Novos pedidos · De fora a fora</h2><p className="text-[13px] text-muted">Aguardando sua revisão</p></div>
      <button type="button" className="min-h-11 rounded-xl border border-line px-3 font-semibold" onClick={refresh}>Atualizar</button>
    </div>
    {failed ? <p className="mt-3 text-[14px] text-muted">Não foi possível carregar os pedidos. Tente atualizar.</p> : !incoming ? <div className="mt-3"><Spinner /></div> : <>
      <p className="mt-3 text-[15px] font-semibold">{incoming.count} pedido(s) novo(s)</p>
      {!incoming.count && <p className="mt-2 text-[14px] text-muted">Nenhum novo pedido por enquanto.</p>}
      <ul className="mt-2 divide-y divide-line">{incoming.items.map(r => <li key={r.id}>
        <Link to={'/admin/pedidos/novo?intake='+encodeURIComponent(r.id)} className="block py-3">
          <div className="flex items-start justify-between gap-2"><p className="font-semibold">{r.service}</p><span className="rounded-full bg-ice px-2 py-1 text-[12px]">Novo</span></div>
          <p className="text-[14px] text-muted">{r.location} · {r.urgency}</p>
          <p className="text-[13px] text-muted">{r.client_name} · {fmt(r.received_at)}</p>
          <p className="mt-2 font-semibold text-[14px]">Revisar e encaminhar →</p>
        </Link>
      </li>)}</ul>
    </>}
  </section>
}

function List() {
  const [tab, setTab] = useState<'published' | 'draft' | 'closed'>('published')
  const [data, setData] = useState<{ items: Summary[]; counts: Record<string, number> } | null>(null)
  useEffect(() => { setData(null); api.get<{ items: Summary[]; counts: Record<string, number> }>(`/admin/requests?status=${tab}`).then(setData).catch(() => setData({ items: [], counts: {} })) }, [tab])
  return (
    <Shell title="Pedidos de Serviços" back="/admin">
      <p className="mt-1 text-[15px] text-muted">Cadastre pedidos reais recebidos de clientes. Só profissionais aprovados, da profissão e da região, veem o pedido.</p>
      <Link to="/admin/pedidos/novo" data-testid="new-request" className="mt-4 flex min-h-13 items-center justify-center gap-2 rounded-2xl bg-lime px-5 font-semibold text-graphite"><Plus size={20} aria-hidden="true" /> Novo pedido</Link>
      <Incoming />
      <div className="mt-4 grid grid-cols-3 gap-2" role="group" aria-label="Situação">
        {([['published', 'Abertos'], ['draft', 'Rascunhos'], ['closed', 'Encerrados']] as const).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)} className={`min-h-14 rounded-2xl border p-2 text-center ${tab === k ? 'border-graphite bg-graphite text-white' : 'border-line bg-white'}`}>
            <span className="block text-[20px] font-bold leading-none">{data?.counts[k] ?? '–'}</span><span className={`text-[13px] ${tab === k ? 'text-on-dark' : 'text-muted'}`}>{l}</span>
          </button>))}
      </div>
      {!data && <div className="mt-8 flex justify-center"><Spinner /></div>}
      {data?.items.length === 0 && <p className="mt-8 text-center text-muted">Nenhum pedido nesta situação.</p>}
      <ul className="mt-4 space-y-3">{data?.items.map((r) => (
        <li key={r.id}><Link to={`/admin/pedidos/${r.id}`} className="block rounded-2xl bg-white p-4" data-testid="request-row">
          <div className="flex items-start justify-between gap-3"><p className="text-[17px] font-semibold leading-snug">{r.title}</p><Badge s={r.status} /></div>
          <p className="mt-1 text-[14px] text-muted">{r.profession} · {r.region} · {r.neighborhood}</p>
          <p className="mt-1 text-[13px] text-muted">{urgencyLabel(r.urgency)} · Cliente: {r.clientName}</p>
          {r.status !== 'draft' && <p className="mt-2 flex items-center gap-1.5 text-[14px] font-semibold"><UserRound size={16} aria-hidden="true" /> {r.interests} interessado(s)</p>}{r.status === 'published' && r.interests === 0 && <p className="mt-2 rounded-xl bg-[#fff4db] px-3 py-2 text-[13px] font-bold text-[#7a5a00]">{r.urgency === 'urgent' ? 'Urgente · ' : ''}Aguardando resposta · acionar profissionais →</p>}
        </Link></li>))}</ul>
    </Shell>
  )
}

// ---------- Formulário (novo / editar rascunho) ----------
export function AdminPedidoForm() { return <AdminGate><Form /></AdminGate> }
const field = 'mt-2 block w-full rounded-2xl border border-line bg-white px-4 py-3 text-[16px] focus:outline-2 focus:outline-offset-2 focus:outline-graphite'
function Form() {
  const { id } = useParams(); const navigate = useNavigate()
  const [search] = useSearchParams()
  const intakeId = !id ? search.get('intake') : null
  const [incoming, setIncoming] = useState<IntakeDetail | null>(null)
  const [cat, setCat] = useState<Catalog | null>(null)
  const [f, setF] = useState({ clientName: '', clientPhone: '', profession: '', region: '', neighborhood: '', title: '', description: '', urgency: '', periodNote: '', consent: false })
  const [ready, setReady] = useState(!id && !intakeId)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    api.get<Catalog>('/pro/catalog').then(async (catalog) => {
      setCat(catalog)
      if (!intakeId) return
      const r = await api.get<IntakeDetail>('/admin/requests/intake/'+encodeURIComponent(intakeId))
      if (r.converted_request_id) { navigate('/admin/pedidos/'+r.converted_request_id, { replace: true }); return }
      setIncoming(r)
      const profession = catalog.professions.find(p => normalized(p.name) === normalized(r.service) || normalized(p.slug) === normalized(r.service))?.slug ?? ''
      const region = catalog.regions.find(g => normalized(g.name) === normalized(r.location) || normalized(g.slug) === normalized(r.location))?.slug ?? ''
      const urgency = /hoje|quanto antes/i.test(r.urgency) ? 'urgent' : /próximos dias/i.test(r.urgency) ? 'this_week' : 'flexible'
      setF({clientName:r.client_name, clientPhone:r.client_phone, profession, region, neighborhood:r.location.slice(0,80), title:r.service.slice(0,100), description:r.description.slice(0,1500), urgency, periodNote:'', consent:true})
      setReady(true)
    }).catch(() => setErr('Não foi possível carregar os dados do pedido.'))
    if (id) api.get<Detail>(`/admin/requests/${id}`).then((d) => { setF({ clientName: d.client.name, clientPhone: d.client.phone, profession: d.professionSlug, region: d.regionSlug, neighborhood: d.neighborhood, title: d.title, description: d.description, urgency: d.urgency, periodNote: d.periodNote ?? '', consent: d.consent }); setReady(true) }).catch(() => setErr('Pedido não encontrado.'))
  }, [id, intakeId, navigate])
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }))
  const save = async (publish: boolean) => {
    setBusy(publish ? 'publish' : 'draft'); setErr(null)
    try {
      const d = id ? await api.put<Detail>(`/admin/requests/${id}`, { ...f, publish }) : intakeId ? await api.post<Detail>('/admin/requests/intake/'+encodeURIComponent(intakeId)+'/convert', { ...f, publish }) : await api.post<Detail>('/admin/requests', { ...f, publish })
      navigate(`/admin/pedidos/${d.id}`, { replace: true, state: { saved: publish ? 'published' : 'draft' } })
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Algo deu errado.') } finally { setBusy(null) }
  }
  const complete = f.clientName.trim() && f.clientPhone && f.profession && f.region && f.neighborhood.trim() && f.title.trim() && f.description.trim() && f.urgency
  if (!cat || !ready) return <Shell title={id ? 'Editar rascunho' : 'Novo pedido'} back="/admin/pedidos">{err ? <div className="mt-4"><Alert tone="error">{err}</Alert></div> : <div className="mt-10 flex justify-center"><Spinner /></div>}</Shell>
  return (
    <Shell title={id ? 'Editar rascunho' : 'Novo pedido'} back={id ? `/admin/pedidos/${id}` : '/admin/pedidos'}>
      {incoming && <section className="mt-4 rounded-2xl bg-white p-4 text-[14px]"><p className="font-bold">Recebido pelo De fora a fora</p><p className="mt-1">Local informado: {incoming.location} · {incoming.urgency}</p><p>Preferência: {incoming.contact_preference}</p><p className="mt-2 text-muted">Revise profissão, região, bairro e descrição. Retire dados de contato e endereço exato do texto público.</p>{incoming.photo_reference && <a className="mt-2 block font-semibold underline" href="https://app.netlify.com/projects/deforafora-app/forms" target="_blank" rel="noopener noreferrer">Ver anexo no Netlify Forms</a>}</section>}
      <form className="mt-4 space-y-5 rounded-3xl bg-white p-5" onSubmit={(e) => e.preventDefault()} data-testid="request-form">
        <section><h2 className="text-[17px] font-bold">Cliente <span className="text-[13px] font-normal text-muted">(só a administração vê)</span></h2>
          <label htmlFor="cn" className="mt-3 block text-[15px] font-semibold">Nome do cliente</label>
          <input id="cn" maxLength={100} value={f.clientName} onChange={(e) => set('clientName', e.target.value)} className={`${field} min-h-13`} />
          <div className="mt-3"><PhoneField id="cp" label="Telefone / WhatsApp do cliente" value={f.clientPhone} onChange={(v) => set('clientPhone', v)} /></div>
        </section>
        <section><h2 className="text-[17px] font-bold">Serviço <span className="text-[13px] font-normal text-muted">(os profissionais veem)</span></h2>
          <label htmlFor="pf" className="mt-3 block text-[15px] font-semibold">Profissão necessária</label>
          <select id="pf" value={f.profession} onChange={(e) => set('profession', e.target.value)} className={`${field} min-h-13`}><option value="">Escolha…</option>{cat.professions.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}</select>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div><label htmlFor="rg" className="block text-[15px] font-semibold">Região</label>
              <select id="rg" value={f.region} onChange={(e) => set('region', e.target.value)} className={`${field} min-h-13`}><option value="">Escolha…</option>{cat.regions.map((r) => <option key={r.slug} value={r.slug}>{r.name}</option>)}</select></div>
            <div><label htmlFor="nb" className="block text-[15px] font-semibold">Bairro</label>
              <input id="nb" maxLength={80} value={f.neighborhood} onChange={(e) => set('neighborhood', e.target.value)} className={`${field} min-h-13`} /></div>
          </div>
          <label htmlFor="tt" className="mt-3 block text-[15px] font-semibold">Título do serviço</label>
          <input id="tt" maxLength={100} value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Ex.: Pintar sala e quarto" className={`${field} min-h-13`} />
          <label htmlFor="ds" className="mt-3 block text-[15px] font-semibold">Descrição do que precisa ser feito</label>
          <textarea id="ds" rows={5} maxLength={1500} value={f.description} onChange={(e) => set('description', e.target.value)} className={field} />
          <p className="mt-1 text-[12px] leading-snug text-muted">Não coloque telefone, e-mail, link, endereço exato nem o nome do cliente: os profissionais veem este texto.</p>
          <fieldset className="mt-4"><legend className="text-[15px] font-semibold">Urgência ou período desejado</legend>
            <div className="mt-2 space-y-2">{URGENCY.map((u) => <label key={u.id} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border px-4 text-[15px] ${f.urgency === u.id ? 'border-graphite bg-ice font-semibold' : 'border-line'}`}><input type="radio" name="urg" className="size-5 accent-graphite" checked={f.urgency === u.id} onChange={() => set('urgency', u.id)} />{u.label}</label>)}</div>
            <input aria-label="Detalhe do período (opcional)" maxLength={100} value={f.periodNote} onChange={(e) => set('periodNote', e.target.value)} placeholder="Detalhe do período (opcional). Ex.: de manhã" className={`${field} min-h-12`} />
          </fieldset>
        </section>
        <label className="flex cursor-pointer gap-3 rounded-2xl bg-ice p-4 text-[15px] leading-snug"><input type="checkbox" data-testid="consent" className="mt-0.5 size-6 shrink-0 accent-graphite" checked={f.consent} onChange={(e) => set('consent', e.target.checked)} />
          <span><strong>O cliente autorizou</strong> o registro e o uso dos dados necessários para a intermediação deste serviço. (Obrigatório para publicar.)</span></label>
        {err && <Alert tone="error">{err}</Alert>}
        <div className="space-y-2">
          <SubmitButton type="button" loading={busy === 'publish'} disabled={!complete || !f.consent || busy !== null} onClick={() => save(true)} data-testid="publish">Publicar para os profissionais</SubmitButton>
          <SubmitButton type="button" variant="ghost" className="border border-line" loading={busy === 'draft'} disabled={!complete || busy !== null} onClick={() => save(false)} data-testid="save-draft">Salvar como rascunho</SubmitButton>
        </div>
      </form>
    </Shell>
  )
}

// ---------- Detalhe ----------
export function AdminPedidoDetalhe() { return <AdminGate><DetailPage /></AdminGate> }
function DetailPage() {
  const { id } = useParams(); const navigate = useNavigate()
  const [d, setD] = useState<Detail | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const load = () => api.get<Detail>(`/admin/requests/${id}`).then(setD).catch((e) => setErr(e instanceof ApiError ? e.message : 'Não foi possível carregar.'))
  useEffect(() => { void load() }, [id])
  const act = async (fn: () => Promise<unknown>) => { setBusy(true); setErr(null); try { await fn(); await load() } catch (e) { setErr(e instanceof ApiError ? e.message : 'Algo deu errado.') } finally { setBusy(false) } }
  if (!d) return <Shell title="Pedido" back="/admin/pedidos">{err ? <div className="mt-4"><Alert tone="error">{err}</Alert></div> : <div className="mt-10 flex justify-center"><Spinner /></div>}</Shell>
  const selectedCount = d.interested.filter(p => p.selectedAt).length
  const compatible = d.compatible ?? []
  const requestUrl = 'https://mapadomapa.netlify.app/area/pedidos#pedido-' + d.id
  const serviceText = `Serviço: ${d.title}\nDescrição: ${d.description}\nLocal: ${d.neighborhood}, ${d.region}\nPrazo: ${urgencyLabel(d.urgency)}${d.periodNote ? ' · '+d.periodNote : ''}`
  const inviteMessage = (name: string | null) => personalize(`Olá, [nome]! Aqui é a equipe do Mapa do Mapa. Temos um pedido compatível com seu perfil.\n\n${serviceText}\n\nVocê tem disponibilidade para atender? Responda esta mensagem ou acesse: ${requestUrl}\n\nA conexão com o cliente será feita após confirmação.`, name)
  const transferMessage = (name: string | null) => personalize(`Olá, [nome]! Você foi selecionado para este pedido:\n\n${serviceText}\n\nCliente: ${d.client.name}\nTelefone: ${d.client.phone}\nPreferência de contato: ${d.contactPreference ?? 'confirme com o cliente'}.\n\nEntre em contato para combinar o orçamento.`, name)
  const clientMsg = personalize(`Olá, [nome]! Aqui é a equipe ${d.origin === 'De fora a fora' ? 'do De fora a fora' : 'do Mapa do Mapa'}. Sobre o seu pedido "${d.title}": ${selectedCount ? 'temos profissionais selecionados para conversar com você.' : 'recebemos sua solicitação e estamos verificando a disponibilidade.'}`, d.client.name)
  return (
    <Shell title={d.title} back="/admin/pedidos">
      <div className="mt-2 flex flex-wrap items-center gap-2"><Badge s={d.status} /><span className="text-[14px] text-muted">{d.profession} · {d.region} · {d.neighborhood}</span></div>
      {err && <div className="mt-3"><Alert tone="error">{err}</Alert></div>}

      <section className="mt-4 rounded-3xl bg-white p-5" data-testid="request-public">
        <h2 className="text-[17px] font-bold">O que os profissionais veem</h2>
        <p className="mt-2 whitespace-pre-line text-[15px] leading-snug">{d.description}</p>
        <p className="mt-3 text-[14px]"><strong>Urgência:</strong> {urgencyLabel(d.urgency)}{d.periodNote ? ` · ${d.periodNote}` : ''}</p>
        <p className="mt-1 text-[14px] text-muted">{d.publishedAt ? `Publicado em ${fmt(d.publishedAt)}` : 'Ainda não publicado'}{d.closedAt ? ` · encerrado em ${fmt(d.closedAt)}` : ''}</p>
        <p className="mt-3 rounded-2xl bg-ice p-3 text-[14px] leading-snug" data-testid="eligible"><strong>{d.eligible}</strong> profissional(is) aprovado(s) de {d.profession} em {d.region} {d.status === 'published' ? 'podem ver este pedido' : 'poderão ver este pedido quando for publicado'}.</p>
      </section>

      <section className="mt-4 rounded-3xl bg-white p-5" data-testid="request-client">
        <h2 className="text-[17px] font-bold">Cliente <span className="text-[13px] font-normal text-muted">(só a administração vê)</span></h2>
        <p className="mt-2 text-[16px] font-semibold">{d.client.name}</p><p className="text-[15px]">{d.client.phone}</p>
        {d.origin && <p className="mt-2 text-[14px] text-muted">Origem: {d.origin} · Preferência: {d.contactPreference}</p>}
        {d.photoReference && <a className="mt-2 block text-[14px] font-semibold underline" href="https://app.netlify.com/projects/deforafora-app/forms" target="_blank" rel="noopener noreferrer">Consultar foto no Netlify Forms</a>}
        <a href={waUrl(d.client.whatsapp, clientMsg)} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#25d366] px-4 text-[14px] font-semibold text-graphite"><MessageCircle size={16} aria-hidden="true" /> WhatsApp do cliente</a>
        <p className="mt-3 text-[13px] text-muted">{d.consent && d.consentAt ? `Autorização do cliente confirmada em ${fmt(d.consentAt)}.` : 'Autorização do cliente ainda não confirmada.'}</p>
      </section>

      {d.status === 'published' && selectedCount < 2 && (
        <section className="mt-4 rounded-3xl border-2 border-graphite bg-white p-5" data-testid="urgent-contact">
          <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><Clock size={20} className="text-[#b45309]" aria-hidden="true" /><h2 className="text-[18px] font-bold">Acionar profissionais</h2></div><button type="button" disabled={busy} onClick={() => void load()} aria-label="Atualizar interessados e profissionais" className="grid size-11 shrink-0 place-items-center rounded-xl border border-line"><RefreshCw size={18} aria-hidden="true" /></button></div>
          {d.interested.length === 0 && <div className="mt-3 rounded-2xl bg-[#fff4db] p-3 text-[14px] font-semibold text-[#7a5a00]">Ninguém respondeu ainda. Acione os profissionais compatíveis pelo WhatsApp.</div>}
          <p className="mt-3 text-[14px] text-muted">Profissionais aprovados da mesma profissão e região que ainda não responderam. O WhatsApp abre com todos os detalhes do serviço, sem os dados privados do cliente.</p>
          <p className="mt-3 text-[15px] font-bold">{compatible.length} profissional(is) para convite</p>
          {compatible.length === 0 && <p className="mt-2 text-[14px] text-muted">Não há outros profissionais compatíveis para acionar.</p>}
          <ul className="mt-2 divide-y divide-line">{compatible.map(p => <li key={p.id} className="py-3">
            <p className="text-[16px] font-semibold">{p.name ?? 'Sem nome'}</p>
            <p className="text-[14px] text-muted">{p.phone ?? 'Sem telefone'}{p.phoneVerified ? ' · verificado' : ' · não verificado'}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {p.whatsapp && <a href={waUrl(p.whatsapp, inviteMessage(p.name))} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#25d366] px-4 font-bold text-graphite"><MessageCircle size={18} aria-hidden="true" /> Enviar pedido</a>}
              <Link to={`/admin/profissionais/${p.id}`} className="inline-flex min-h-12 items-center rounded-xl border border-line px-4 text-[14px] font-semibold">Ver ficha</Link>
              {p.whatsapp && <button type="button" disabled={busy} onClick={() => { if (window.confirm('Este profissional confirmou que tem interesse pelo WhatsApp? A seleção ocupa uma das duas vagas e permite o repasse do contato.')) void act(() => api.post('/admin/requests/'+d.id+'/select-confirmed/'+p.id)) }} className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-graphite px-4 text-[14px] font-semibold disabled:opacity-50">Confirmou pelo WhatsApp · Selecionar</button>}
            </div>
          </li>)}</ul>
          <p className="mt-3 text-[12px] leading-snug text-muted">O envio é manual, individual e não confirma uma vaga. Se o técnico aceitar pelo WhatsApp, confirme aqui para liberar o repasse ao cliente. Limite: dois selecionados.</p>
        </section>
      )}

      {d.status !== 'draft' && (
        <section className="mt-4 rounded-3xl bg-white p-5" data-testid="interested">
          <h2 className="text-[17px] font-bold">Profissionais interessados ({d.interested.length})</h2>
          <p className="mt-2 text-[14px] font-semibold">Selecionados: {selectedCount}/2</p>
          <p className="text-[13px] text-muted">O primeiro interesse tem prioridade. Confirme a disponibilidade antes de selecionar; só compartilhe o contato com os dois selecionados.</p>
          {d.interested.length === 0 && <p className="mt-2 text-[15px] text-muted">Ninguém manifestou interesse ainda.</p>}
          <ul className="mt-2 divide-y divide-line">{d.interested.map((p) => (
            <li key={p.id} className="py-3" data-testid="interested-row">
              <p className="text-[16px] font-semibold">{p.name ?? 'Sem nome'} <span className="text-[13px] font-normal text-muted">· {fmt(p.at)}</span></p>
              <p className="text-[14px]">{p.phone ?? '—'} {p.phoneVerified ? <span className="text-[12px] text-[#2b8a00]">· verificado</span> : <span className="text-[12px] text-muted">· não verificado</span>}</p>
              <p className="text-[13px] text-muted">{p.professions.join(' · ')} · {p.regions.join(' · ')}</p>
              {p.selectedAt && <p className="mt-1 text-[13px] font-semibold text-[#2b8a00]">Selecionado para conexão · {fmt(p.selectedAt)}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                {!p.selectedAt && d.status === 'published' && <button type="button" disabled={busy || selectedCount >= 2 || p.canReceive===false} onClick={() => { if (window.confirm('Selecionar este profissional para uma das duas vagas? A escolha é definitiva.')) void act(() => api.post('/admin/requests/'+d.id+'/select/'+p.id)) }} className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-[14px] font-semibold disabled:opacity-50">Selecionar</button>}
                {!p.selectedAt && p.canReceive===false && <span className="text-[13px] text-muted">Recarga vencida</span>}
                {p.deliveredAt && <span className="text-[13px] font-semibold">Contato entregue · {fmt(p.deliveredAt)}</span>}
                {p.selectedAt && !p.deliveredAt && d.consent && <button type="button" disabled={busy} onClick={()=>{if(window.confirm('Você já enviou o contato autorizado ao profissional?')) void act(()=>api.post('/admin/requests/'+d.id+'/delivered/'+p.id))}} className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-[14px] font-semibold">Confirmar contato entregue</button>}
                {p.selectedAt && p.whatsapp && d.consent && <a href={waUrl(p.whatsapp, transferMessage(p.name))} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-full bg-lime px-4 text-[14px] font-semibold">Repassar contato</a>}
                {p.whatsapp && <a href={waUrl(p.whatsapp, inviteMessage(p.name))} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#25d366] px-4 text-[14px] font-semibold text-graphite"><MessageCircle size={16} aria-hidden="true" /> WhatsApp</a>}
                <Link to={`/admin/profissionais/${p.id}`} className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-[14px] font-semibold">Abrir ficha</Link>
              </div>
            </li>))}</ul>
        </section>
      )}

      <div className="mt-5 space-y-2">
        {d.status === 'draft' && <>
          {d.consent && <SubmitButton type="button" loading={busy} onClick={() => act(() => api.post(`/admin/requests/${d.id}/publish`))} data-testid="publish-now">Publicar para os profissionais</SubmitButton>}
          <Link to={`/admin/pedidos/${d.id}/editar`} className="flex min-h-13 items-center justify-center rounded-2xl border border-line bg-white font-semibold">Editar rascunho</Link>
          <SubmitButton type="button" variant="ghost" className="border border-line" loading={busy} onClick={() => { if (window.confirm('Excluir este rascunho?')) void act(async () => { await api.del(`/admin/requests/${d.id}`); navigate('/admin/pedidos', { replace: true }) }) }}>Excluir rascunho</SubmitButton>
        </>}
        {d.status === 'published' && <SubmitButton type="button" variant="ghost" className="border border-line" loading={busy} onClick={() => { if (window.confirm('Encerrar este pedido? Ele some da lista dos profissionais.')) void act(() => api.post(`/admin/requests/${d.id}/close`)) }} data-testid="close">Encerrar pedido</SubmitButton>}
      </div>
    </Shell>
  )
}
