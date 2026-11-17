import { Link } from 'react-router-dom'
import { CalendarDays } from 'lucide-react'
export type Recharge={enabled:boolean;active:boolean;canReceive:boolean;cycleId:string|null;startsAt:string|null;expiresAt:string|null;delivered:number;target:number}
export const dateLabel=(v:string|null)=>v?new Date(v).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}):'—'
export default function RechargeCard({r}:{r:Recharge}) {
  if(!r.enabled)return null
  return <section className="rounded-2xl border border-line bg-white p-4" aria-label="Recarga semanal">
    <div className="flex items-center gap-2 text-[13px] font-semibold"><CalendarDays size={17}/>{r.active?'Recarga ativa':'Recarga semanal'}</div>
    <p className="mt-1 text-[16px] font-bold">7 dias · 3 contatos qualificados</p>
    {r.active?<><div className="mt-2 flex justify-between text-[13px] text-muted"><span>{r.delivered} de 3 contatos recebidos</span><span>Até {dateLabel(r.expiresAt)}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-ice"><div className="h-full rounded-full bg-lime" style={{width:Math.min(100,r.delivered/3*100)+'%'}}/></div></>:<><p className="mt-1 text-[13px] text-muted">Renove para voltar a receber novos pedidos. Continue usando o app normalmente.</p>{r.cycleId&&r.delivered<3&&<p className="mt-1 text-[13px] text-muted">Último período: {r.delivered} de 3 contatos. Fale com a equipe para acompanhar.</p>}<Link to="/area/mensagens" className="mt-2 inline-flex min-h-11 items-center font-semibold text-[14px] underline underline-offset-4">Solicitar recarga</Link></>}
  </section>
}
