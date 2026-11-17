import { Link } from 'react-router-dom'
import { CalendarDays, ChevronRight, ShieldCheck } from 'lucide-react'
import { WEEKLY_PRICE_LABEL } from './rechargePlan'
export type Recharge={enabled:boolean;emailPresent?:boolean;billingMode?:'inherit'|'required'|'free';globalEnabled?:boolean;checkoutEnabled?:boolean;pixConfigured?:boolean;active:boolean;canReceive:boolean;paused?:boolean;approved?:boolean;cycleId:string|null;startsAt:string|null;expiresAt:string|null;delivered:number;target:number}
export const dateLabel=(v:string|null)=>v?new Date(v).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}):'—'
export default function RechargeCard({r,master=false}:{r?:Recharge|null;master?:boolean}) {
  return <section className="rounded-2xl border border-line bg-white p-4" aria-label="Recarga semanal">
    <div className="flex items-center gap-2 text-[13px] font-semibold">{master?<ShieldCheck size={18}/>:<CalendarDays size={17}/>}<span>{master?'Conta mestre · acesso livre':r?.enabled&&r.active?'Recarga ativa':'Recarga semanal'}</span>{!r?.enabled&&<span className="ml-auto rounded-full bg-lime px-2 py-1 text-[11px] font-bold">NOVIDADE</span>}</div>
    <p className="mt-2 text-[18px] font-bold">{WEEKLY_PRICE_LABEL}<span className="ml-1 text-[13px] font-medium text-muted">/ semana</span></p>
    <p className="mt-1 text-[14px] font-semibold">7 dias · 3 contatos qualificados</p>
    {!master&&r?.paused?<p className="mt-2 text-[13px] text-muted">Recebimento temporariamente pausado pela equipe. Seu perfil e o restante do app continuam disponíveis.</p>:master?<p className="mt-1 text-[13px] text-muted">A administração não precisa recarregar.</p>:r?.enabled&&r.active?<><div className="mt-2 flex justify-between text-[13px] text-muted"><span>{r.delivered} de 3 contatos recebidos</span><span>Até {dateLabel(r.expiresAt)}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-ice"><div className="h-full rounded-full bg-lime" style={{width:Math.min(100,r.delivered/3*100)+'%'}}/></div></>:r?.enabled?<><p className="mt-1 text-[13px] text-muted">Renove para receber novos pedidos. Continue usando o app normalmente.</p>{r.cycleId&&r.delivered<3&&<p className="mt-1 text-[13px] text-muted">Último período: {r.delivered} de 3 contatos. Fale com a equipe para acompanhar.</p>}</>:<p className="mt-1 text-[13px] text-muted">Em breve: recarga semanal para receber novas oportunidades.</p>}
    <Link to="/area/recarga" className="mt-3 flex min-h-11 items-center justify-between rounded-xl bg-lime px-3 text-[14px] font-bold">Conhecer o plano semanal <ChevronRight size={18}/></Link>
  </section>
}
