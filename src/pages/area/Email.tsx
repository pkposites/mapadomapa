import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AuthShell from '../../components/AuthShell'
import Alert from '../../components/ui/Alert'
import SubmitButton from '../../components/ui/SubmitButton'
import { useAuth } from '../../auth/AuthContext'
import { api } from '../../lib/api'
type State={email:string|null;verified:boolean;configured:boolean}
const field='mt-2 block w-full rounded-2xl border border-line bg-white px-4 py-3 text-[16px]'
export default function Email(){
  const {user,refresh,logout}=useAuth()
  const nav=useNavigate()
  const location=useLocation()
  const target=(location.state as {from?:string}|null)?.from
  const back=target&&target.startsWith('/')&&!target.startsWith('//')&&target!=='/area/email'?target:'/area/perfil'
  const [state,S]=useState<State|null>(null),[email,E]=useState(user?.email??''),[password,P]=useState(''),[code,C]=useState(''),[sent,Sent]=useState(false),[busy,B]=useState(false),[error,Err]=useState(''),[notice,N]=useState('')
  useEffect(()=>{api.get<State>('/auth/email').then(v=>{S(v);E(v.email??'')}).catch(e=>Err(e.message))},[])
  const run=async(fn:()=>Promise<void>)=>{B(true);Err('');N('');try{await fn()}catch(e){Err(e instanceof Error?e.message:'Não foi possível concluir.')}finally{B(false)}}
  const save=(e:FormEvent)=>{e.preventDefault();void run(async()=>{const v=await api.put<State>('/auth/email',{email,password});S(v);E(v.email??'');P('');Sent(false);await refresh();if(!v.configured){nav(back,{replace:true});return}N('E-mail cadastrado. Confirme para receber os avisos.')})}
  const send=()=>void run(async()=>{await api.post('/auth/email/send');Sent(true);N('Código enviado. Confira sua caixa de entrada.')})
  const verify=(e:FormEvent)=>{e.preventDefault();void run(async()=>{S(await api.post<State>('/auth/email/verify',{code}));await refresh();N('E-mail confirmado!');nav(back,{replace:true})})}
  return <AuthShell eyebrow="Segurança da conta" title="Cadastre seu e-mail" subtitle="O e-mail é obrigatório para os profissionais. Usamos para avisos de pedidos, pagamentos e segurança.">
    {error&&<Alert tone="error">{error}</Alert>}{notice&&<Alert tone="success">{notice}</Alert>}
    <form className="mt-4 space-y-4" onSubmit={save}>
      <label className="block font-semibold">E-mail<input className={field} type="email" autoComplete="email" value={email} onChange={e=>E(e.target.value)} required maxLength={254}/></label>
      {state?.email&&email.trim().toLowerCase()!==state.email&&<label className="block font-semibold">Senha atual<input className={field} type="password" autoComplete="current-password" value={password} onChange={e=>P(e.target.value)} required/></label>}
      <SubmitButton type="submit" loading={busy} disabled={state===null}>Salvar e-mail</SubmitButton>
    </form>
    {state?.email&&<div className="mt-4 space-y-3 rounded-2xl bg-ice p-4">
      <p className="font-semibold">{state.verified?'✓ E-mail confirmado':'E-mail ainda não confirmado'}</p>
      {!state.verified&&state.configured&&<><SubmitButton type="button" variant="ghost" disabled={busy} onClick={send}>{sent?'Reenviar código':'Enviar código de confirmação'}</SubmitButton>{sent&&<form onSubmit={verify}><label className="block font-semibold">Código de 6 números<input className={field} value={code} onChange={e=>C(e.target.value.replace(/\D/g,'').slice(0,6))} inputMode="numeric" autoComplete="one-time-code" required/></label><div className="mt-3"><SubmitButton type="submit" loading={busy}>Confirmar e-mail</SubmitButton></div></form>}</>}
      {!state.verified&&!state.configured&&<p className="text-sm text-muted">A confirmação estará disponível quando o serviço de e-mail for ativado.</p>}
      <Link to={back} replace className="block text-center font-semibold underline">Continuar para minha conta</Link>
    </div>}
    <button type="button" className="mt-4 block w-full text-sm underline" onClick={()=>void run(async()=>{await logout();nav('/entrar',{replace:true})})}>Sair da conta</button>
  </AuthShell>
}
