import {useEffect,useState} from 'react'
import {api,ApiError} from '../lib/api'
import { WEEKLY_PRICE_LABEL } from '../area/rechargePlan'
import {dateLabel,type Recharge} from '../area/RechargeCard'
const err=(e:unknown)=>e instanceof ApiError?e.message:'Não foi possível atualizar.'
const btn='min-h-11 rounded-xl border border-line px-4 text-[14px] font-semibold disabled:opacity-50'
export function RechargeSettings(){
  const [v,setV]=useState<boolean|null>(null),[busy,B]=useState(false),[msg,M]=useState('')
  useEffect(()=>{api.get<{enabled:boolean}>('/admin/recharges/settings').then(r=>setV(r.enabled)).catch(e=>M(err(e)))},[])
  const toggle=async()=>{if(v===null||!window.confirm(v?'Desativar a exigência de recarga?':'Exigir recarga ativa para novos pedidos? Todos continuam usando o restante do app.'))return;B(true);try{setV((await api.put<{enabled:boolean}>('/admin/recharges/settings',{enabled:!v})).enabled);M('Configuração atualizada.')}catch(e){M(err(e))}finally{B(false)}}
  return <section className="mt-4 rounded-2xl border border-line bg-white p-4"><h2 className="font-bold">Recarga semanal de pedidos</h2><p className="mt-1 text-[14px] text-muted">{WEEKLY_PRICE_LABEL} por semana · 7 dias · 3 contatos qualificados. Liberação manual por profissional. Nenhuma cobrança automática.</p><p className="mt-2 text-[14px] font-semibold">{v===null?'Carregando…':v?'Exigência ativa':'Acesso gratuito atual'}</p><button type="button" disabled={busy||v===null} onClick={toggle} className={btn+' mt-2'}>{v?'Desativar exigência':'Ativar exigência de recarga'}</button>{msg&&<p role="status" className="mt-2 text-[13px]">{msg}</p>}</section>
}
export function RechargeControl({userId,approved}:{userId:string;approved:boolean}){
  const [r,R]=useState<Recharge|null>(null),[busy,B]=useState(false),[msg,M]=useState('')
  useEffect(()=>{api.get<Recharge>('/admin/recharges/'+userId).then(R).catch(e=>M(err(e)))},[userId])
  const change=async(action:'grant'|'revoke')=>{if(!window.confirm(action==='grant'?'Confirmar liberação manual por 7 dias?':'Suspender o recebimento de novos pedidos?'))return;B(true);try{R(await api.post<Recharge>('/admin/recharges/'+userId,{action}));M('Recarga atualizada.')}catch(e){M(err(e))}finally{B(false)}}
  return <section className="mt-4 rounded-2xl border border-line bg-white p-4"><h2 className="font-bold">Recarga semanal</h2><p className="mt-1 text-[14px] text-muted">{WEEKLY_PRICE_LABEL} por semana · 7 dias · 3 contatos qualificados</p>{r&&<><p className="mt-2 font-semibold">{r.active?'Ativa até '+dateLabel(r.expiresAt):r.cycleId?'Recarga encerrada':'Sem recarga'}</p><p className="text-[14px] text-muted">{r.delivered}/3 contatos entregues {r.cycleId?'neste ciclo':''}</p>{!r.active&&r.cycleId&&r.delivered<3&&<p className="text-[13px] text-muted">Meta anterior pendente: faltam {3-r.delivered} contatos.</p>}<button type="button" className={btn+' mt-3'} disabled={busy||(!r.active&&!approved)} onClick={()=>change(r.active?'revoke':'grant')}>{r.active?'Suspender recarga':'Liberar por 7 dias'}</button></>}{msg&&<p role="status" className="mt-2 text-[13px]">{msg}</p>}</section>
}
