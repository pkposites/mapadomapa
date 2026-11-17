import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, ShieldCheck, Users } from 'lucide-react'
import AreaShell from '../../area/Shell'
import { useAuth } from '../../auth/AuthContext'
import { WEEKLY_PRICE_LABEL } from '../../area/rechargePlan'

export default function Recarga() {
  const [step,setStep]=useState<0|1|2>(0)
  const {user}=useAuth()
  return <AreaShell>
    <Link to="/area/pedidos" className="inline-flex min-h-11 items-center gap-2 text-[14px] font-semibold"><ArrowLeft size={18}/> Voltar aos pedidos</Link>
    <section className="mt-2 rounded-3xl bg-graphite p-5 text-white">
      <div className="flex items-center justify-between gap-2"><span className="rounded-full bg-lime px-3 py-1 text-[12px] font-bold text-graphite">NOVIDADE</span><span className="text-[12px] text-on-dark">EM BREVE · Contratação semanal</span></div>
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
      <button type="button" onClick={()=>setStep(1)} className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-lime px-4 font-bold">Ver como funcionará <ArrowRight size={19}/></button>
      <p className="mt-3 text-center text-[12px] text-muted">Em breve. Nenhuma cobrança será realizada.</p>
    </section>}
    {step===1&&<section className="mt-4 rounded-3xl border border-line bg-white p-5">
      <h2 className="text-[19px] font-bold">Confira seu plano</h2>
      <dl className="mt-3 divide-y divide-line text-[15px]">
        <div className="flex justify-between gap-3 py-3"><dt className="text-muted">Recarga semanal</dt><dd className="font-semibold">7 dias</dd></div>
        <div className="flex justify-between gap-3 py-3"><dt className="text-muted">Contatos qualificados</dt><dd className="font-semibold">3</dd></div>
        <div className="flex justify-between gap-3 py-3"><dt className="text-muted">Renovação automática</dt><dd className="font-semibold">Não</dd></div>
        <div className="flex justify-between gap-3 py-3"><dt className="font-bold">Total previsto</dt><dd className="text-[22px] font-bold">{WEEKLY_PRICE_LABEL}</dd></div>
      </dl>
      <p className="rounded-xl bg-ice p-3 text-[14px] text-muted">O pagamento ainda não está disponível. Esta etapa não solicita seus dados bancários nem cria uma cobrança.</p>
      <button type="button" onClick={()=>setStep(2)} className="mt-4 flex min-h-14 w-full items-center justify-center rounded-2xl bg-lime px-4 font-bold">Entendi, quero acompanhar</button>
      <button type="button" onClick={()=>setStep(0)} className="mt-2 min-h-11 w-full text-[14px] font-semibold">Voltar ao plano</button>
    </section>}
    {step===2&&<section className="mt-4 rounded-3xl border border-line bg-white p-5 text-center" aria-live="polite">
      <CheckCircle2 size={42} className="mx-auto text-[#2b8a00]"/>
      <h2 className="mt-3 text-[21px] font-bold">Em breve!</h2>
      <p className="mt-2 text-[15px] text-muted">Nenhum pagamento foi realizado e nenhum ciclo de recarga foi iniciado.</p>
      <Link to="/area/mensagens" state={{prefill:'Tenho interesse na recarga semanal de R$ 175,00 por 7 dias, com 3 contatos qualificados.'}} className="mt-5 flex min-h-14 w-full items-center justify-center rounded-2xl bg-lime px-4 font-bold">Quero falar com a equipe</Link>
      <Link to="/area/pedidos" className="mt-2 inline-flex min-h-11 items-center text-[14px] font-semibold">Voltar aos pedidos</Link>
      <button type="button" onClick={()=>setStep(0)} className="block min-h-11 w-full text-[14px] text-muted underline">Ver o plano novamente</button>
    </section>}
  </AreaShell>
}
