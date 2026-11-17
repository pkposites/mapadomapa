import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Clock, MessageCircle, Plus, RefreshCw, Trash2, UserRound } from 'lucide-react'
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
  routingMode: 'manual' | 'automatic'
  origin?: string | null; contactPreference?: string | null; photoReference?: string | null
  description: string; periodNote: string | null; consent: boolean; consentAt: string | null; professionSlug: string; regionSlug: string; eligible: number
  client: { name: string; phone: string; whatsapp: string }
  compatible?: { id: string; name: string | null; phone: string | null; whatsapp: string | null; phoneVerified: boolean; score: number | null; completeness: number; invited: boolean; professionMatch: boolean; regionMatch: boolean; canReceive: boolean; reviewStatus: string }[]
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
// Netlify Forms CSV: handles escaped quotes, line breaks and BOM.
function intakeCsv(raw: string) {
  const rows: string[][] = []; let row: string[] = [], val = '', quoted = false
  for (let i=0; i<raw.length; i++) {
    const ch=raw[i]
    if (ch==='"') { if (quoted && raw[i+1]==='"') { val+='"'; i++ } else quoted=!quoted }
    else if (!quoted && ch===',') { row.push(val); val='' }
    else if (!quoted && (ch==='\n'||ch==='\r')) { if (ch==='\r'&&raw[i+1]==='\n') i++; row.push(val); rows.push(row); row=[];val='' }
    else val+=ch
  }
  if (row.length||val) { row.push(val); rows.push(row) }
  if (quoted || !rows.length) throw new Error('CSV inválido.')
  const headers=rows.shift()!.map(x=>x.replace(/^\uFEFF/,'').trim())
  if (!headers.includes('request_id') || !headers.includes('autorizacao')) throw new Error('Exportação Netlify inválida: faltam request_id ou autorizacao.')
  const fields=['request_id','nome','telefone','servico','descricao','local','prazo','preferencia_contato','autorizacao','foto']
  return rows.filter(x=>x.some(Boolean)).map(r=>Object.fromEntries(fields.map(k=>[k,r[headers.indexOf(k)]??''])))
}
function Incoming() {
  const [incoming, setIncoming] = useState<{ count: number; items: IntakeItem[]; trash: IntakeItem[] } | null>(null)
  const [failed, setFailed] = useState(false)
  const [importing,setImporting]=useState(false)
  const [importMessage,setImportMessage]=useState('')
  async function recover(file: File) { setImporting(true); setImportMessage(''); try { const items=intakeCsv(await file.text()); const totals={imported:0,duplicates:0,rejected:0}; for(let i=0;i<items.length;i+=10){const r=await api.post<typeof totals>('/admin/requests/intake/import',{items:items.slice(i,i+10)});totals.imported+=r.imported;totals.duplicates+=r.duplicates;totals.rejected+=r.rejected} setImportMessage(`${totals.imported} importado(s) · ${totals.duplicates} já existente(s) · ${totals.rejected} inválido(s).`);refresh() } catch(e){setImportMessage(e instanceof Error?e.message:'Importação não concluída.')} finally{setImporting(false)} }
  const refresh = () => { setFailed(false); api.get<{count:number; items:IntakeItem[]; trash:IntakeItem[]}>('/admin/requests/intake').then(setIncoming).catch(() => setFailed(true)) }
  const [deleting,setDeleting]=useState(false)
  const [actionError,setActionError]=useState('')
  async function trashAction(id:string,restore=false) {
    if(!window.confirm(restore?'Restaurar este pedido?':'Excluir esta solicitação? Ela ficará na lixeira e não será encaminhada.'))return
    setDeleting(true);setActionError('');try{const url='/admin/requests/intake/'+encodeURIComponent(id);if(restore)await api.post(url+'/restore');else await api.del(url);refresh()}catch(e){setActionError(e instanceof Error?e.message:'Não foi possível concluir.')}finally{setDeleting(false)}
  }
  useEffect(refresh, [])
  return <section className="mt-5 rounded-3xl bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="text-[18px] font-bold">Novos pedidos · De fora a fora</h2><p className="text-[13px] text-muted">Aguardando sua revisão</p></div>
      <button type="button" className="min-h-11 rounded-xl border border-line px-3 font-semibold" onClick={refresh}>Atualizar</button>
    </div>
    <details className="mt-3 rounded-xl bg-ice p-3"><summary className="cursor-pointer text-[14px] font-semibold">Recuperar pedidos salvos no Netlify</summary><p className="mt-2 text-[13px] text-muted">Exporte o formulário solicitacao-orcamento em CSV e importe aqui. Registros repetidos são ignorados.</p><a className="mt-2 block text-[14px] font-semibold underline" href="https://app.netlify.com/projects/deforafora-app/forms" target="_blank" rel="noopener noreferrer">Abrir Netlify Forms</a><label className="mt-3 block text-[14px] font-semibold">{importing?'Importando...':'Selecionar arquivo CSV'}<input type="file" accept=".csv,text/csv" disabled={importing} className="mt-2 block w-full text-[14px]" onChange={e=>{const f=e.target.files?.[0];if(f)void recover(f);e.target.value=''}}/></label>{importMessage&&<p className="mt-2 text-[14px]" role="status">{importMessage}</p>}</details>
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
        <button type="button" disabled={deleting} onClick={()=>void trashAction(r.id)} className="mb-3 flex min-h-10 items-center gap-2 rounded-xl border border-line px-3 text-[13px] font-semibold text-red-700"><Trash2 size={16}/> Excluir pedido</button>
      </li>)}</ul>
      {actionError&&<p className="mt-2 text-[14px] text-red-700" role="alert">{actionError}</p>}
      {!!incoming.trash?.length&&<details className="mt-3 rounded-xl bg-ice p-3"><summary className="cursor-pointer text-[14px] font-semibold">Lixeira · De fora a fora ({incoming.trash.length})</summary><ul className="mt-2 divide-y divide-line">{incoming.trash.map(r=><li key={r.id} className="flex items-center justify-between gap-3 py-2"><span className="min-w-0 break-words text-[14px]">{r.service} · {r.client_name}</span><button type="button" disabled={deleting} className="min-h-11 shrink-0 rounded-xl border border-line bg-white px-3 text-[13px] font-semibold" onClick={()=>void trashAction(r.id,true)}>Restaurar</button></li>)}</ul></details>}
    </>}
  </section>
}

function List() {
  const [tab, setTab] = useState<'published' | 'draft' | 'closed' | 'trash'>('published')
  const [data, setData] = useState<{ items: Summary[]; counts: Record<string, number> } | null>(null)
  const [actionError,setActionError]=useState('')
  const [working,setWorking]=useState(false)
  const refresh=()=>{setData(null);api.get<{items:Summary[];counts:Record<string,number>}>(`/admin/requests?status=${tab}`).then(setData).catch(()=>setData({items:[],counts:{}}))}
  useEffect(refresh,[tab])
  async function changeTrash(r:Summary,restore:boolean){
    if(!window.confirm(restore?(r.status==='published'?'Restaurar este pedido? Ele voltará a ficar disponível para os profissionais selecionados.':'Restaurar este pedido?'):'Excluir este pedido? Ele será retirado dos profissionais e ficará na lixeira.'))return
    setWorking(true);setActionError('');try{const url='/admin/requests/'+r.id;if(restore)await api.post(url+'/restore');else await api.del(url);refresh()}catch(e){setActionError(e instanceof Error?e.message:'Não foi possível concluir.')}finally{setWorking(false)}
  }
  return (
    <Shell title="Pedidos de Serviços" back="/admin">
      <p className="mt-1 text-[15px] text-muted">Cadastre pedidos reais recebidos de clientes. Você controla quem recebe cada pedido.</p>
      <Link to="/admin/pedidos/novo" data-testid="new-request" className="mt-4 flex min-h-13 items-center justify-center gap-2 rounded-2xl bg-lime px-5 font-semibold text-graphite"><Plus size={20} aria-hidden="true" /> Novo pedido</Link>
      <Incoming />
      <div className="mt-4 grid grid-cols-4 gap-2" role="group" aria-label="Situação">
        {([['published', 'Abertos'], ['draft', 'Rascunhos'], ['closed', 'Encerrados'], ['trash','Lixeira']] as const).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)} className={`min-h-14 rounded-2xl border p-2 text-center ${tab === k ? 'border-graphite bg-graphite text-white' : 'border-line bg-white'}`}>
            <span className="block text-[20px] font-bold leading-none">{data?.counts[k] ?? '–'}</span><span className={`text-[13px] ${tab === k ? 'text-on-dark' : 'text-muted'}`}>{l}</span>
          </button>))}
      </div>
      {!data && <div className="mt-8 flex justify-center"><Spinner /></div>}
      {data?.items.length === 0 && <p className="mt-8 text-center text-muted">Nenhum pedido nesta situação.</p>}
      {actionError&&<p className="mt-3 text-red-700" role="alert">{actionError}</p>}
      <ul className="mt-4 space-y-3">{data?.items.map((r) => (
        <li key={r.id}>{tab==='trash'?<div className="rounded-2xl bg-white p-4"><p className="font-semibold">{r.title}</p><p className="mt-1 text-[14px] text-muted">{r.profession} · {r.region} · {r.clientName}</p><button type="button" disabled={working} className="mt-3 min-h-11 rounded-xl border border-line px-4 text-[14px] font-semibold" onClick={()=>void changeTrash(r,true)}>Restaurar pedido</button></div>:<><Link to={`/admin/pedidos/${r.id}`} className="block rounded-2xl bg-white p-4" data-testid="request-row">
          <div className="flex items-start justify-between gap-3"><p className="text-[17px] font-semibold leading-snug">{r.title}</p><Badge s={r.status} /></div>
          <p className="mt-1 text-[14px] text-muted">{r.profession} · {r.region} · {r.neighborhood}</p>
          <p className="mt-1 text-[13px] text-muted">{urgencyLabel(r.urgency)} · Cliente: {r.clientName}</p>
          {r.status !== 'draft' && <p className="mt-2 flex items-center gap-1.5 text-[14px] font-semibold"><UserRound size={16} aria-hidden="true" /> {r.interests} interessado(s)</p>}{r.status === 'published' && r.interests === 0 && <p className="mt-2 rounded-xl bg-[#fff4db] px-3 py-2 text-[13px] font-bold text-[#7a5a00]">{r.urgency === 'urgent' ? 'Urgente · ' : ''}Aguardando resposta · acionar profissionais →</p>}
        </Link><button type="button" disabled={working} onClick={()=>void changeTrash(r,false)} className="mt-1 flex min-h-11 items-center gap-2 rounded-xl border border-line bg-white px-3 text-[13px] font-semibold text-red-700"><Trash2 size={16}/> Excluir pedido</button></>}</li>))}</ul>
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
          <SubmitButton type="button" loading={busy === 'publish'} disabled={!complete || !f.consent || busy !== null} onClick={() => save(true)} data-testid="publish">Publicar e escolher profissionais</SubmitButton>
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
  const [sort,setSort]=useState('score')
  const [matchOnly,setMatchOnly]=useState(false)
  const [minScore,setMinScore]=useState('')
  const [minComplete,setMinComplete]=useState('0')
  const [searchName,setSearchName]=useState('')
  const load = () => api.get<Detail>(`/admin/requests/${id}`).then(setD).catch((e) => setErr(e instanceof ApiError ? e.message : 'Não foi possível carregar.'))
  useEffect(() => { void load() }, [id])
  const act = async (fn: () => Promise<unknown>) => { setBusy(true); setErr(null); try { await fn(); await load() } catch (e) { setErr(e instanceof ApiError ? e.message : 'Algo deu errado.') } finally { setBusy(false) } }
  if (!d) return <Shell title="Pedido" back="/admin/pedidos">{err ? <div className="mt-4"><Alert tone="error">{err}</Alert></div> : <div className="mt-10 flex justify-center"><Spinner /></div>}</Shell>
  const selectedCount = d.interested.filter(p => p.selectedAt).length
  const compatible = (d.compatible ?? []).filter(p=>(!matchOnly || (p.professionMatch&&p.regionMatch)) && (!minScore || (p.score!==null&&p.score>=Number(minScore))) && p.completeness>=Number(minComplete) && normalized(p.name??'').includes(normalized(searchName))).sort((a,b)=>sort==='score'?(b.score??-1)-(a.score??-1):sort==='complete'?b.completeness-a.completeness:(a.name??'').localeCompare(b.name??''))
  const requestUrl = 'https://mapadomapa.netlify.app/area/pedidos#pedido-' + d.id
  const serviceText = `Serviço: ${d.title}\nDescrição: ${d.description}\nLocal: ${d.neighborhood}, ${d.region}\nPrazo: ${urgencyLabel(d.urgency)}${d.periodNote ? ' · '+d.periodNote : ''}`
  const inviteMessage = (name: string | null) => personalize(`Olá, [nome]! Aqui é a equipe do Mapa do Mapa. Temos um pedido de serviço para você.\n\n${serviceText}\n\nVocê tem disponibilidade para atender? Responda esta mensagem ou acesse: ${requestUrl}\n\nA conexão com o cliente será feita após confirmação.`, name)
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
        <p className="mt-3 rounded-2xl bg-ice p-3 text-[14px] leading-snug" data-testid="eligible"><strong>{d.eligible}</strong> profissional(is) aprovado(s) de {d.profession} em {d.region} correspondem aos critérios automáticos. A decisão de encaminhamento é sua.</p>
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
          {d.interested.length === 0 && <div className="mt-3 rounded-2xl bg-[#fff4db] p-3 text-[14px] font-semibold text-[#7a5a00]">Ninguém respondeu ainda. Escolha os profissionais ou acione pelo WhatsApp.</div>}
          <p className="mt-3 text-[14px] text-muted">Escolha livremente contas ativas. Pontuação, perfil e compatibilidade são referências, não bloqueios. O convite não revela os dados privados do cliente.</p>
          <div className="mt-3 rounded-xl bg-ice p-3"><p className="text-[14px] font-bold">Distribuição: {d.routingMode==='manual'?'Manual — apenas convidados':'Automática + convites'}</p><button disabled={busy} type="button" className="mt-2 min-h-11 rounded-xl border border-line bg-white px-3 text-[14px] font-semibold" onClick={()=>{if(window.confirm('Alterar a distribuição deste pedido?'))void act(()=>api.post('/admin/requests/'+d.id+'/routing',{mode:d.routingMode==='manual'?'automatic':'manual'}))}}>{d.routingMode==='manual'?'Ativar distribuição automática':'Usar seleção manual'}</button></div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[14px]"><label className="col-span-2">Buscar profissional<input value={searchName} onChange={e=>setSearchName(e.target.value)} className={field} placeholder="Nome"/></label><label>Ordenar por<select className={field} value={sort} onChange={e=>setSort(e.target.value)}><option value="score">Pontuação</option><option value="complete">Perfil completo</option><option value="name">Nome</option></select></label><label>Nota mínima<input type="number" min="0" value={minScore} onChange={e=>setMinScore(e.target.value)} className={field} placeholder="Todas"/></label><label>Perfil mínimo<select className={field} value={minComplete} onChange={e=>setMinComplete(e.target.value)}><option value="0">Todos</option><option value="3">3 de 6 campos</option><option value="5">5 de 6 campos</option><option value="6">Completo</option></select></label><label className="flex items-center gap-2"><input type="checkbox" checked={matchOnly} onChange={e=>setMatchOnly(e.target.checked)}/> Só compatíveis</label></div>
          <p className="mt-3 text-[15px] font-bold">{compatible.length} profissional(is) para convite</p>
          {compatible.length === 0 && <p className="mt-2 text-[14px] text-muted">Nenhum profissional para esses filtros.</p>}
          <ul className="mt-2 divide-y divide-line">{compatible.map(p => <li key={p.id} className="py-3">
            <p className="text-[16px] font-semibold">{p.name ?? 'Sem nome'}</p>
            <p className="text-[14px] text-muted">{p.phone ?? 'Sem telefone'}{p.phoneVerified ? ' · verificado' : ' · não verificado'}</p>
            <p className="mt-1 text-[13px] text-muted">Nota: {p.score??'—'} · Perfil: {p.completeness}/6 · {p.professionMatch&&p.regionMatch?'Compatível':'Fora dos critérios automáticos'} · {p.canReceive?'Acesso a pedidos':'Sem recarga ativa'}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={()=>void act(()=>api.post('/admin/requests/'+d.id+'/invite/'+p.id,{invite:!p.invited}))} className={'min-h-12 rounded-xl px-4 text-[14px] font-bold '+(p.invited?'border border-line':'bg-lime')}>{p.invited?'Liberado · retirar':'Liberar pedido no app'}</button>
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
          <p className="text-[13px] text-muted">Você escolhe quem será selecionado. Confirme a disponibilidade antes de selecionar; só compartilhe o contato com os dois selecionados.</p>
          {d.interested.length === 0 && <p className="mt-2 text-[15px] text-muted">Ninguém manifestou interesse ainda.</p>}
          <ul className="mt-2 divide-y divide-line">{d.interested.map((p) => (
            <li key={p.id} className="py-3" data-testid="interested-row">
              <p className="text-[16px] font-semibold">{p.name ?? 'Sem nome'} <span className="text-[13px] font-normal text-muted">· {fmt(p.at)}</span></p>
              <p className="text-[14px]">{p.phone ?? '—'} {p.phoneVerified ? <span className="text-[12px] text-[#2b8a00]">· verificado</span> : <span className="text-[12px] text-muted">· não verificado</span>}</p>
              <p className="text-[13px] text-muted">{p.professions.join(' · ')} · {p.regions.join(' · ')}</p>
              {p.selectedAt && <p className="mt-1 text-[13px] font-semibold text-[#2b8a00]">Selecionado para conexão · {fmt(p.selectedAt)}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                {!p.selectedAt && d.status === 'published' && <button type="button" disabled={busy || selectedCount >= 2} onClick={() => { if (window.confirm('Selecionar este profissional para uma das duas vagas? A escolha é definitiva.')) void act(() => api.post('/admin/requests/'+d.id+'/select/'+p.id)) }} className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-[14px] font-semibold disabled:opacity-50">Selecionar</button>}
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
          {d.consent && <SubmitButton type="button" loading={busy} onClick={() => act(() => api.post(`/admin/requests/${d.id}/publish`))} data-testid="publish-now">Publicar e escolher profissionais</SubmitButton>}
          <Link to={`/admin/pedidos/${d.id}/editar`} className="flex min-h-13 items-center justify-center rounded-2xl border border-line bg-white font-semibold">Editar rascunho</Link>
        </>}
        {d.status === 'published' && <SubmitButton type="button" variant="ghost" className="border border-line" loading={busy} onClick={() => { if (window.confirm('Encerrar este pedido? Ele some da lista dos profissionais.')) void act(() => api.post(`/admin/requests/${d.id}/close`)) }} data-testid="close">Encerrar pedido</SubmitButton>}
        <SubmitButton type="button" variant="ghost" className="border border-line text-red-700" loading={busy} onClick={async()=>{if(!window.confirm('Excluir este pedido? Ele sairá da área dos profissionais e ficará na lixeira.'))return;setBusy(true);setErr(null);try{await api.del('/admin/requests/'+d.id);navigate('/admin/pedidos',{replace:true})}catch(e){setErr(e instanceof Error?e.message:'Não foi possível excluir.');setBusy(false)}}}><Trash2 size={18}/> Excluir pedido</SubmitButton>
      </div>
    </Shell>
  )
}
