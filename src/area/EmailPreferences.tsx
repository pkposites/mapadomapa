import {useEffect,useState} from 'react'
import {api} from '../lib/api'
import SubmitButton from '../components/ui/SubmitButton'
type Prefs={offers:boolean;installReminder:boolean;installed:boolean}
export default function EmailPreferences(){
  const [p,P]=useState<Prefs|null>(null),[busy,B]=useState(false),[message,M]=useState('')
  useEffect(()=>{api.get<Prefs>('/pro/email-preferences').then(P).catch(()=>M('Não foi possível carregar as preferências.'))},[])
  const save=async()=>{if(!p)return;B(true);M('');try{P(await api.put<Prefs>('/pro/email-preferences',{offers:p.offers,installReminder:p.installReminder}));M('Preferências salvas.')}catch(e){M(e instanceof Error?e.message:'Não foi possível salvar.')}finally{B(false)}}
  return <section className="rounded-3xl bg-white p-5" id="email-preferences">
    <h2 className="text-lg font-bold">Preferências de e-mail</h2>
    <p className="mt-1 text-sm text-muted">Avisos de segurança, conta e pagamentos são operacionais. Escolha se deseja receber os avisos opcionais abaixo. Você pode cancelar quando quiser.</p>
    {p&&<div className="mt-3 space-y-3">
      <label className="flex items-start gap-3"><input type="checkbox" checked={p.offers} disabled={busy} onChange={e=>P({...p,offers:e.target.checked})} className="mt-1 size-5 accent-graphite"/><span>Quero receber novidades e ofertas de planos por e-mail.</span></label>
      <label className="flex items-start gap-3"><input type="checkbox" checked={p.installReminder} disabled={busy} onChange={e=>P({...p,installReminder:e.target.checked})} className="mt-1 size-5 accent-graphite"/><span>Quero receber um lembrete para instalar o aplicativo.{p.installed?' (Instalação já registrada.)':''}</span></label>
      <SubmitButton type="button" loading={busy} onClick={()=>void save()}>Salvar preferências</SubmitButton>
    </div>}
    {message&&<p role="status" className="mt-2 text-sm">{message}</p>}
  </section>
}
