import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Header from '../components/Header'
import Footer from '../components/Footer'
import Alert from '../components/ui/Alert'
import Spinner from '../components/ui/Spinner'
import SubmitButton from '../components/ui/SubmitButton'
import AdminGate from '../admin/AdminGate'
import { api } from '../lib/api'

type Item = {kind:string;label:string;trigger:string;optional:boolean;enabled:boolean;sent:number;pending:number;subject:string;text:string;html:string}
type State = {configured:boolean;testAddress:string|null;items:Item[]}

export default function AdminEmails(){return <AdminGate><Panel/></AdminGate>}
function Panel(){
  const [s,S]=useState<State|null>(null),[selected,Select]=useState('approved'),[busy,B]=useState(false),[error,E]=useState(''),[notice,N]=useState('')
  const load=()=>{E('');api.get<State>('/admin/email-templates').then(S).catch(e=>E(e.message))}
  useEffect(load,[])
  const run=async(fn:()=>Promise<void>)=>{B(true);E('');N('');try{await fn()}catch(e){E(e instanceof Error?e.message:'Não foi possível concluir.')}finally{B(false)}}
  const item=s?.items.find(x=>x.kind===selected)
  return <><Header variant="page"/><main className="min-h-screen bg-ice"><div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
    <Link to="/admin" className="text-sm font-semibold underline">‹ Voltar ao painel</Link>
    <h1 className="text-[30px] font-bold tracking-tight">E-mails automáticos</h1>
    <p className="text-muted">Resend · controle cada comunicação, visualize e envie um teste ao seu próprio e-mail.</p>
    {error&&<Alert tone="error">{error}</Alert>}{notice&&<Alert tone="success">{notice}</Alert>}
    {!s&&!error&&<Spinner/>}{!s&&error&&<SubmitButton onClick={load}>Tentar de novo</SubmitButton>}
    {s&&<>
      <Alert tone={s.configured?'success':'info'}>{s.configured?'Credenciais encontradas. Envie um teste antes de ativar modelos.':'Resend ainda não configurado. Prévia disponível; envios bloqueados até configurar o remetente e a credencial.'}</Alert>
      <p className="rounded-2xl bg-white p-3 text-sm text-muted">Os modelos começam desativados. A ativação não gera cobranças nem dispara e-mails antigos da fila. Códigos de segurança (confirmação de e-mail e recuperação de senha) funcionam separadamente.</p>
      <div className="grid gap-2">
        {s.items.map(x=><div key={x.kind} className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <button type="button" aria-pressed={selected===x.kind} onClick={()=>Select(x.kind)} className="text-left font-bold underline decoration-lime decoration-2">{x.label}</button>
            <p className="mt-1 text-xs text-muted">{x.trigger}</p>
            <p className="mt-1 text-xs font-medium">{x.optional?'Opcional · requer aceite do técnico':'Transacional'} · {x.sent} enviados · {x.pending} na fila</p>
          </div>
          <button type="button" aria-pressed={x.enabled} disabled={busy||(!s.configured&&!x.enabled)} className={`min-h-11 rounded-xl border px-4 text-sm font-semibold disabled:opacity-50 ${x.enabled?'border-graphite bg-lime':'border-line bg-ice'}`} onClick={()=>{if(!x.enabled&&!window.confirm('Ativar este tipo de e-mail para profissionais elegíveis?'))return;void run(async()=>{S(await api.put<State>('/admin/email-templates',{kind:x.kind,enabled:!x.enabled}));N(x.enabled?'Disparo desativado.':'Disparo ativado.')})}}>{x.enabled?'Ativo · Desativar':'Inativo · Ativar'}</button>
        </div>)}
      </div>
      {item&&<section className="space-y-3 rounded-3xl bg-white p-4">
        <h2 className="text-xl font-bold">Prévia — {item.label}</h2>
        <p className="text-sm"><strong>Assunto:</strong> {item.subject}</p>
        <iframe title="Prévia do e-mail" sandbox="" className="pointer-events-none h-[500px] w-full rounded-xl border border-line bg-ice" srcDoc={item.html}/>
        <details className="rounded-xl border border-line p-3"><summary className="font-semibold">Versão em texto</summary><p className="mt-2 whitespace-pre-wrap text-sm">{item.text}</p></details>
        {s.testAddress?<p data-clarity-mask="true" className="text-sm text-muted">Teste somente para: {s.testAddress}</p>:<p className="text-sm text-muted">Confirme seu próprio e-mail em <Link to="/area/email" className="font-semibold underline">Segurança da conta</Link> para testar.</p>}
        <SubmitButton disabled={!s.configured||!s.testAddress} loading={busy} onClick={()=>{if(!window.confirm('Enviar um e-mail de teste somente para seu endereço confirmado?'))return;void run(async()=>{await api.post('/admin/email-templates/test',{kind:item.kind});N('Teste aceito pelo Resend. Confira sua caixa de entrada.')})}}>Enviar e-mail de teste</SubmitButton>
      </section>}
    </>}
  </div></main><Footer/></>
}
