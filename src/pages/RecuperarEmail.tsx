import { useState, type FormEvent } from 'react'
import { Link,useNavigate } from 'react-router-dom'
import AuthShell,{standaloneLink} from '../components/AuthShell'
import Alert from '../components/ui/Alert'
import CaptchaField from '../components/ui/CaptchaField'
import {PasswordField,CodeField} from '../components/ui/Field'
import SubmitButton from '../components/ui/SubmitButton'
import {api} from '../lib/api'
export default function RecuperarEmail(){
  const nav=useNavigate()
  const [email,E]=useState(''),[code,C]=useState(''),[password,P]=useState(''),[captcha,T]=useState<string|null>(null),[reset,R]=useState(0),[step,S]=useState(0),[busy,B]=useState(false),[error,Err]=useState('')
  const submit=async(e:FormEvent)=>{e.preventDefault();B(true);Err('');try{
    if(step===0){await api.post('/auth/email/forgot',{email,captchaToken:captcha});S(1)}
    else {await api.post('/auth/email/reset',{email,code,password});nav('/entrar',{replace:true,state:{notice:'Senha atualizada. Entre novamente.'}})}
  }catch(e){Err(e instanceof Error?e.message:'Não foi possível continuar.')}finally{B(false);T(null);R(v=>v+1)}}
  return <AuthShell eyebrow="Segurança" title="Recuperar senha" subtitle="Use o e-mail confirmado no seu cadastro." below={<Link to="/entrar" className={standaloneLink}>Voltar para entrar</Link>}>
    <form className="space-y-4" onSubmit={submit}>
      {error&&<Alert tone="error">{error}</Alert>}
      {step===0?<><label className="block font-semibold">Seu e-mail<input type="email" required maxLength={254} autoComplete="email" value={email} onChange={e=>E(e.target.value)} className="mt-2 block w-full rounded-2xl border border-line px-4 py-3"/></label><CaptchaField onToken={T} resetSignal={reset}/><SubmitButton type="submit" loading={busy}>Enviar código</SubmitButton></>:<><Alert tone="success">Se o e-mail estiver confirmado, você receberá um código válido por 10 minutos.</Alert><CodeField id="code" label="Código do e-mail" value={code} onChange={C}/><PasswordField id="password" label="Nova senha" value={password} onChange={P} autoComplete="new-password"/><SubmitButton type="submit" loading={busy}>Alterar senha</SubmitButton><button type="button" onClick={()=>S(0)} className="w-full underline">Voltar ou solicitar novo código</button></>}
    </form>
  </AuthShell>
}
