import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, ShieldCheck, Users } from 'lucide-react'
import AreaShell from '../../area/Shell'
import { useAuth } from '../../auth/AuthContext'
import { api } from '../../lib/api'
import { WEEKLY_PRICE_LABEL } from '../../area/rechargePlan'

type PixPayment = {id:string;status:string;expiresAt:string;qrCode:string|null;qrImage:string|null;activated:boolean}
type Checkout = {available:boolean;active:boolean;eligible:boolean;expiresAt?:string|null;payment:PixPayment|null}
export default function Recarga() {
  const [step,setStep]=useState<0|1|2>(0)
  const {user}=useAuth()
  const [checkout,setCheckout]=useState<Checkout|null>(null)
  const [email,setEmail]=useState('')
  const [cpf,setCpf]=useState('')
  const [consent,setConsent]=useState(false)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [copied,setCopied]=useState(false)
  const pay=checkout?.payment
  const available=checkout?.available===true&&!user?.isAdmin
  const pending=pay?.status==='pending'
  const creating=pay?.status==='creating'
  const confirmed=pay?.status==='approved'&&pay.activated
  const fetchStatus=async(verify=false)=>{try{const result=await api.get<Checkout>('/pro/recharge/pix'+(verify?'?verify=1':''));setCheckout(result);if(result.payment?.status==='pending')setStep(2);if(result.payment?.status==='approved'&&result.active)setStep(2);setError('')}catch(e){if(verify)setError(e instanceof Error?e.message:'Não foi possível verificar o pagamento.')}}
  useEffect(()=>{if(user&&!user.isAdmin)void fetchStatus()},[user?.id])
  useEffect(()=>{if(!pending&&!creating)return;const timer=window.setInterval(()=>{void fetchStatus(true)},30000);return()=>window.clearInterval(timer)},[pending,creating])
  async function generate(){setBusy(true);setError('');try{const result=await api.post<{payment:PixPayment}>('/pro/recharge/pix',{email,cpf,consent});setCheckout(old=>old?{...old,payment:result.payment}:old);setEmail('');setCpf('');setConsent(false);setStep(2);await fetchStatus(false)}catch(e){setError(e instanceof Error?e.message:'Não foi possível gerar o Pix.')}finally{setBusy(false)}}
  async function copy(){if(!pay?.qrCode)return;try{await navigator.clipboard.writeText(pay.qrCode);setCopied(true)}catch{setError('Selecione e copie o código Pix manualmente.')}}
  return <AreaShell>
    <Link to="/area/pedidos" className="inline-flex min-h-11 items-center gap-2 text-[14px] font-semibold"><ArrowLeft size={18}/> Voltar aos pedidos</Link>
    <section className="mt-2 rounded-3xl bg-graphite p-5 text-white">
      <div className="flex items-center justify-between gap-2"><span className="rounded-full bg-lime px-3 py-1 text-[12px] font-bold text-graphite">NOVIDADE</span><span className="text-[12px] text-on-dark">{available?'DISPONÍVEL · Pix':'EM BREVE · Contratação semanal'}</span></div>
      <h1 className="mt-4 text-[27px] font-bold leading-tight">Receba novas oportunidades de serviço.</h1>
      <p className="mt-2 text-[15px] text-on-dark">Acesse pedidos compatíveis com sua profissão e região.</p>
      <div className="mt-5 flex items-baseline gap-2"><strong className="text-[40px] leading-none tracking-[-0.05em]">{WEEKLY_PRICE_LABEL}</strong><span className="text-[15px] text-on-dark">/ semana</span></div>
      <p className="mt-2 text-[13px] text-on-dark">Uma recarga por 7 dias. Sem renovação automática.</p>
    </section>
    {user?.isAdmin && <p className="mt-3 rounded-xl bg-white p-3 text-[14px] font-semibold">Conta mestre · acesso livre. Você pode visualizar toda a experiência sem pagar.</p>}
    <div className="mt-4 flex items-center gap-2" aria-label="Como funcionará a contratação">
      {['Plano','Revisão','Conclusão'].map((name,i)=><div key={name} className="flex-1"><div className={'h-1.5 rounded-full '+(i<=step?'bg-graphite':'bg-line')}/><span className={'mt-1 block text-[12px] '+(i===step?'font-semibold':'text-muted')}>{name}</span></div>)}
    </div>
    {step===0&&<section className="mt-4 rounded-3xl border border-line bg-white p-5">
      <h2 className="text-[19px] font-bold">O que você recebe</h2>
      <ul className="mt-4 space-y-4 text-[15px]">
        <li className="flex gap-3"><CalendarDays size={22} className="shrink-0"/><div><strong>7 dias de acesso</strong><p className="mt-0.5 text-muted">Oportunidades durante o período da recarga.</p></div></li>
        <li className="flex gap-3"><Users size={22} className="shrink-0"/><div><strong>3 contatos qualificados no período</strong><p className="mt-0.5 text-muted">Pedidos reais que correspondem ao seu perfil. Contratação do serviço não é garantida.</p></div></li>
        <li className="flex gap-3"><ShieldCheck size={22} className="shrink-0"/><div><strong>Controle total</strong><p className="mt-0.5 text-muted">Renove quando quiser. O mural, perfil e mensagens permanecem disponíveis sem recarga.</p></div></li>
      </ul>
      <button type="button" onClick={()=>setStep(1)} className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-lime px-4 font-bold">{available?'Contratar com Pix':'Ver como funcionará'} <ArrowRight size={19}/></button>
      <p className="mt-3 text-center text-[12px] text-muted">{available?'Pagamento único pelo Mercado Pago.':'Em breve. Nenhuma cobrança será realizada.'}</p>
    </section>}
    {step===1&&<section className="mt-4 rounded-3xl border border-line bg-white p-5">
      <h2 className="text-[19px] font-bold">Confira seu plano</h2>
      <dl className="mt-3 divide-y divide-line text-[15px]">
        <div className="flex justify-between gap-3 py-3"><dt className="text-muted">Recarga semanal</dt><dd className="font-semibold">7 dias</dd></div>
        <div className="flex justify-between gap-3 py-3"><dt className="text-muted">Contatos qualificados</dt><dd className="font-semibold">3</dd></div>
        <div className="flex justify-between gap-3 py-3"><dt className="text-muted">Renovação automática</dt><dd className="font-semibold">Não</dd></div>
        <div className="flex justify-between gap-3 py-3"><dt className="font-bold">Total previsto</dt><dd className="text-[22px] font-bold">{WEEKLY_PRICE_LABEL}</dd></div>
      </dl>
      {available&&!checkout?.active&&checkout?.eligible?<form className="space-y-3" onSubmit={e=>{e.preventDefault();if(!busy)void generate()}}>
        <p className="rounded-xl bg-ice p-3 text-[14px] text-muted">Informe os dados solicitados pelo Mercado Pago para gerar o Pix. Os dados do pagamento não serão publicados.</p>
        <label className="block text-[14px] font-semibold">E-mail do pagador<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} className="mt-1 block w-full rounded-xl border border-line p-3 text-[16px]" placeholder="seu@email.com"/></label>
        <label className="block text-[14px] font-semibold">CPF do pagador<input required inputMode="numeric" maxLength={14} value={cpf} onChange={e=>setCpf(e.target.value)} className="mt-1 block w-full rounded-xl border border-line p-3 text-[16px]" placeholder="000.000.000-00"/></label>
        <label className="flex items-start gap-2 text-[13px]"><input type="checkbox" required checked={consent} onChange={e=>setConsent(e.target.checked)} className="mt-1 size-4"/><span>Autorizo o envio destes dados ao Mercado Pago exclusivamente para processar este Pix de {WEEKLY_PRICE_LABEL}.</span></label>
        {error&&<p className="text-[14px] text-red-700" role="alert">{error}</p>}
        <button type="submit" disabled={busy||!consent} className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-lime px-4 font-bold disabled:opacity-50">{busy?'Gerando Pix…':creating?'Tentar gerar novamente':'Gerar Pix de '+WEEKLY_PRICE_LABEL}</button>
      </form>:<><p className="rounded-xl bg-ice p-3 text-[14px] text-muted">{checkout?.active?'Sua recarga está ativa. Aguarde o término do período para renovar.':available&&!checkout?.eligible?'Contratação disponível para profissionais aprovados.':'O pagamento ainda não está disponível. Esta etapa não cria uma cobrança.'}</p>
      <button type="button" onClick={()=>setStep(2)} className="mt-4 flex min-h-14 w-full items-center justify-center rounded-2xl bg-lime px-4 font-bold">Entendi, quero acompanhar</button></>}
      <button type="button" onClick={()=>setStep(0)} className="mt-2 min-h-11 w-full text-[14px] font-semibold">Voltar ao plano</button>
    </section>}
    {step===2&&pending&&<section className="mt-4 rounded-3xl border border-line bg-white p-5 text-center" aria-live="polite">
      <h2 className="text-[21px] font-bold">{pay?.qrCode||pay?.qrImage?'Pix gerado':pay?.expiresAt&&Date.parse(pay.expiresAt)<=Date.now()?'Pix vencido · verificando':'Preparando Pix'} · {WEEKLY_PRICE_LABEL}</h2>
      <p className="mt-2 text-[14px] text-muted">{pay?.qrCode||pay?.qrImage?'Escaneie o QR Code ou use o Pix Copia e Cola no seu banco.':'Aguarde a atualização do Mercado Pago. Não faça outro pagamento.'}</p>
      {pay?.qrImage&&<img alt="QR Code do Pix" src={'data:image/png;base64,'+pay.qrImage} className="mx-auto mt-4 w-full max-w-[240px] rounded-xl border border-line p-2"/>}
      {pay?.qrCode&&<><textarea readOnly value={pay.qrCode} aria-label="Pix Copia e Cola" className="mt-3 block w-full rounded-xl border border-line p-3 text-[13px]" rows={3} onFocus={e=>e.currentTarget.select()}/><button type="button" className="mt-2 min-h-12 w-full rounded-xl bg-lime font-bold" onClick={()=>void copy()}>{copied?'Código copiado!':'Copiar código Pix'}</button></>}
      <p className="mt-3 text-[13px] text-muted">Aguardando confirmação do Mercado Pago. Vencimento: {pay?.expiresAt?new Date(pay.expiresAt).toLocaleString('pt-BR'):'—'}.</p>
      {error&&<p role="alert" className="mt-2 text-red-700">{error}</p>}
      <button type="button" className="mt-3 min-h-12 w-full rounded-xl border border-line font-semibold" onClick={()=>void fetchStatus(true)}>Já paguei · verificar pagamento</button>
      <Link to="/area/pedidos" className="mt-3 inline-flex min-h-11 items-center text-[14px] font-semibold">Voltar aos pedidos</Link>
    </section>}
    {step===2&&confirmed&&checkout?.active&&<section className="mt-4 rounded-3xl border border-line bg-white p-5 text-center"><CheckCircle2 size={42} className="mx-auto text-[#2b8a00]"/><h2 className="mt-3 text-[21px] font-bold">Pagamento confirmado!</h2><p className="mt-2 text-[14px] text-muted">Sua recarga de 7 dias foi liberada{checkout.expiresAt?' até '+new Date(checkout.expiresAt).toLocaleDateString('pt-BR'):''}.</p><Link to="/area/pedidos" className="mt-4 flex min-h-12 items-center justify-center rounded-xl bg-lime font-bold">Acessar meus pedidos</Link></section>}
    {step===2&&!pending&&!(confirmed&&checkout?.active)&&<section className="mt-4 rounded-3xl border border-line bg-white p-5 text-center" aria-live="polite">
      <CheckCircle2 size={42} className="mx-auto text-[#2b8a00]"/>
      <h2 className="mt-3 text-[21px] font-bold">{available?'Recarga semanal':'Em breve!'}</h2>
      <p className="mt-2 text-[15px] text-muted">{available?'Você pode acompanhar o status ou voltar ao plano.':'Nenhum pagamento foi realizado e nenhum ciclo de recarga foi iniciado.'}</p>
      <Link to="/area/mensagens" state={{prefill:'Tenho interesse na recarga semanal de R$ 175,00 por 7 dias, com 3 contatos qualificados.'}} className="mt-5 flex min-h-14 w-full items-center justify-center rounded-2xl bg-lime px-4 font-bold">Quero falar com a equipe</Link>
      <Link to="/area/pedidos" className="mt-2 inline-flex min-h-11 items-center text-[14px] font-semibold">Voltar aos pedidos</Link>
      <button type="button" onClick={()=>setStep(0)} className="block min-h-11 w-full text-[14px] text-muted underline">Ver o plano novamente</button>
    </section>}
  </AreaShell>
}
