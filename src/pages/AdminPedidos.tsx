import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, MessageCircle, Plus, UserRound } from 'lucide-react'
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
type Detail = Summary & {
  description: string; periodNote: string | null; consent: boolean; consentAt: string | null; professionSlug: string; regionSlug: string; eligible: number
  client: { name: string; phone: string; whatsapp: string }
  interested: { id: string; name: string | null; phone: string | null; whatsapp: string | null; phoneVerified: boolean; professions: string[]; regions: string[]; at: string }[]
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
function List() {
  const [tab, setTab] = useState<'published' | 'draft' | 'closed'>('published')
  const [data, setData] = useState<{ items: Summary[]; counts: Record<string, number> } | null>(null)
  useEffect(() => { setData(null); api.get<{ items: Summary[]; counts: Record<string, number> }>(`/admin/requests?status=${tab}`).then(setData).catch(() => setData({ items: [], counts: {} })) }, [tab])
  return (
    <Shell title="Pedidos de Serviços" back="/admin">
      <p className="mt-1 text-[15px] text-muted">Cadastre pedidos reais recebidos de clientes. Só profissionais aprovados, da profissão e da região, veem o pedido.</p>
      <Link to="/admin/pedidos/novo" data-testid="new-request" className="mt-4 flex min-h-13 items-center justify-center gap-2 rounded-2xl bg-lime px-5 font-semibold text-graphite"><Plus size={20} aria-hidden="true" /> Novo pedido</Link>
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
          {r.status !== 'draft' && <p className="mt-2 flex items-center gap-1.5 text-[14px] font-semibold"><UserRound size={16} aria-hidden="true" /> {r.interests} interessado(s)</p>}
        </Link></li>))}</ul>
    </Shell>
  )
}

// ---------- Formulário (novo / editar rascunho) ----------
export function AdminPedidoForm() { return <AdminGate><Form /></AdminGate> }
const field = 'mt-2 block w-full rounded-2xl border border-line bg-white px-4 py-3 text-[16px] focus:outline-2 focus:outline-offset-2 focus:outline-graphite'
function Form() {
  const { id } = useParams(); const navigate = useNavigate()
  const [cat, setCat] = useState<Catalog | null>(null)
  const [f, setF] = useState({ clientName: '', clientPhone: '', profession: '', region: '', neighborhood: '', title: '', description: '', urgency: '', periodNote: '', consent: false })
  const [ready, setReady] = useState(!id)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    api.get<Catalog>('/pro/catalog').then(setCat).catch(() => setErr('Não foi possível carregar as profissões e regiões.'))
    if (id) api.get<Detail>(`/admin/requests/${id}`).then((d) => { setF({ clientName: d.client.name, clientPhone: d.client.phone, profession: d.professionSlug, region: d.regionSlug, neighborhood: d.neighborhood, title: d.title, description: d.description, urgency: d.urgency, periodNote: d.periodNote ?? '', consent: d.consent }); setReady(true) }).catch(() => setErr('Pedido não encontrado.'))
  }, [id])
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }))
  const save = async (publish: boolean) => {
    setBusy(publish ? 'publish' : 'draft'); setErr(null)
    try {
      const d = id ? await api.put<Detail>(`/admin/requests/${id}`, { ...f, publish }) : await api.post<Detail>('/admin/requests', { ...f, publish })
      navigate(`/admin/pedidos/${d.id}`, { replace: true, state: { saved: publish ? 'published' : 'draft' } })
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Algo deu errado.') } finally { setBusy(null) }
  }
  const complete = f.clientName.trim() && f.clientPhone && f.profession && f.region && f.neighborhood.trim() && f.title.trim() && f.description.trim() && f.urgency
  if (!cat || !ready) return <Shell title={id ? 'Editar rascunho' : 'Novo pedido'} back="/admin/pedidos">{err ? <div className="mt-4"><Alert tone="error">{err}</Alert></div> : <div className="mt-10 flex justify-center"><Spinner /></div>}</Shell>
  return (
    <Shell title={id ? 'Editar rascunho' : 'Novo pedido'} back={id ? `/admin/pedidos/${id}` : '/admin/pedidos'}>
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
  const clientMsg = personalize(`Olá, [nome]! Aqui é o Mapa do Mapa. Sobre o seu pedido "${d.title}": já temos profissionais interessados e vamos conectar você com o melhor atendimento. Posso te passar os detalhes?`, d.client.name)
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
        <a href={waUrl(d.client.whatsapp, clientMsg)} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#25d366] px-4 text-[14px] font-semibold text-graphite"><MessageCircle size={16} aria-hidden="true" /> WhatsApp do cliente</a>
        <p className="mt-3 text-[13px] text-muted">{d.consent && d.consentAt ? `Autorização do cliente confirmada em ${fmt(d.consentAt)}.` : 'Autorização do cliente ainda não confirmada.'}</p>
      </section>

      {d.status !== 'draft' && (
        <section className="mt-4 rounded-3xl bg-white p-5" data-testid="interested">
          <h2 className="text-[17px] font-bold">Profissionais interessados ({d.interested.length})</h2>
          {d.interested.length === 0 && <p className="mt-2 text-[15px] text-muted">Ninguém manifestou interesse ainda.</p>}
          <ul className="mt-2 divide-y divide-line">{d.interested.map((p) => (
            <li key={p.id} className="py-3" data-testid="interested-row">
              <p className="text-[16px] font-semibold">{p.name ?? 'Sem nome'} <span className="text-[13px] font-normal text-muted">· {fmt(p.at)}</span></p>
              <p className="text-[14px]">{p.phone ?? '—'} {p.phoneVerified ? <span className="text-[12px] text-[#2b8a00]">· verificado</span> : <span className="text-[12px] text-muted">· não verificado</span>}</p>
              <p className="text-[13px] text-muted">{p.professions.join(' · ')} · {p.regions.join(' · ')}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {p.whatsapp && <a href={waUrl(p.whatsapp, personalize(`Olá, [nome]! Aqui é a equipe do Mapa do Mapa. Recebemos um pedido compatível com você: "${d.title}" (${d.neighborhood}, ${d.region}). Você tem disponibilidade para atender?`, p.name))} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#25d366] px-4 text-[14px] font-semibold text-graphite"><MessageCircle size={16} aria-hidden="true" /> WhatsApp</a>}
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
