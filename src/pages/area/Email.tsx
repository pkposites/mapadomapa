import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Mail } from 'lucide-react'
import AuthShell from '../../components/AuthShell'
import Alert from '../../components/ui/Alert'
import SubmitButton from '../../components/ui/SubmitButton'
import { useAuth } from '../../auth/AuthContext'
import { api } from '../../lib/api'

type State = { email: string | null; verified: boolean; configured: boolean }
const field = 'mt-2 block w-full rounded-2xl border border-line bg-white px-4 py-3 text-[16px]'

export default function Email() {
  const { user, refresh, logout } = useAuth()
  const nav = useNavigate()
  const location = useLocation()
  const target = (location.state as { from?: string } | null)?.from
  const back = target && target.startsWith('/') && !target.startsWith('//') && target !== '/area/email' ? target : '/area/perfil'
  const [state, S] = useState<State | null>(null), [email, E] = useState(user?.email ?? ''), [password, P] = useState(''), [code, C] = useState(''), [sent, Sent] = useState(false), [busy, B] = useState(false), [error, Err] = useState(''), [notice, N] = useState('')
  const [editing, setEditing] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const load = () => { setLoadFailed(false); Err(''); api.get<State>('/auth/email').then(v => { S(v); E(v.email ?? '') }).catch(e => { Err(e.message); setLoadFailed(true) }) }
  useEffect(load, [])
  const run = async (fn: () => Promise<void>) => { B(true); Err(''); N(''); try { await fn() } catch (e) { Err(e instanceof Error ? e.message : 'Não foi possível concluir.') } finally { B(false) } }
  const save = (e: FormEvent) => { e.preventDefault(); void run(async () => {
    const v = await api.put<State>('/auth/email', { email, password })
    S(v); E(v.email ?? ''); P(''); C(''); Sent(false); setEditing(false); await refresh()
    if (!v.configured && target) { nav(back, { replace: true }); return }
    N(v.verified ? 'E-mail confirmado.' : 'E-mail cadastrado com sucesso.')
  }) }
  const send = () => void run(async () => { await api.post('/auth/email/send'); Sent(true); N('Código enviado. Confira sua caixa de entrada e spam.') })
  const verify = (e: FormEvent) => { e.preventDefault(); void run(async () => {
    S(await api.post<State>('/auth/email/verify', { code })); await refresh(); N('E-mail confirmado!'); nav(back, { replace: true })
  }) }
  const missing = state ? !state.email : !user?.email
  const showForm = missing || editing
  return <AuthShell eyebrow={missing ? 'Atualização obrigatória' : 'Segurança da conta'} title={missing ? 'Cadastre seu e-mail' : state?.configured && !state.verified ? 'Confirme seu e-mail' : 'Seu e-mail'} subtitle="Usamos seu e-mail para avisos de pedidos, pagamentos e segurança da sua conta.">
    {missing && <div role="alert" data-testid="email-required-alert" className="mb-4 flex gap-3 rounded-2xl border-2 border-graphite bg-lime p-4 text-graphite">
      <Mail className="shrink-0" size={24} aria-hidden="true" />
      <div><strong className="block">Atenção: atualize seu cadastro</strong><p className="mt-1 text-sm">O e-mail agora é obrigatório. Informe seu endereço para continuar usando a plataforma. Seu perfil e seus pedidos permanecem salvos.</p></div>
    </div>}
    {error && <Alert tone="error">{error}</Alert>}{notice && <Alert tone="success">{notice}</Alert>}
    {loadFailed && <SubmitButton type="button" variant="ghost" onClick={load}>Tentar novamente</SubmitButton>}
    {state && showForm && <form data-clarity-mask="true" className="mt-4 space-y-4" onSubmit={save}>
      <label className="block font-semibold">E-mail<input className={field} type="email" inputMode="email" autoComplete="email" value={email} onChange={e => E(e.target.value)} required maxLength={254} placeholder="nome@email.com" disabled={busy} /></label>
      {state.email && email.trim().toLowerCase() !== state.email && <label className="block font-semibold">Senha atual<input className={field} type="password" autoComplete="current-password" value={password} onChange={e => P(e.target.value)} required disabled={busy} /></label>}
      <SubmitButton type="submit" loading={busy}>{missing ? 'Cadastrar e continuar' : 'Salvar e-mail'}</SubmitButton>
      {editing && !missing && <SubmitButton type="button" variant="ghost" disabled={busy} onClick={() => { setEditing(false); E(state.email ?? ''); P(''); Err('') }}>Cancelar alteração</SubmitButton>}
    </form>}
    {state?.email && !showForm && <div className="mt-4 space-y-3 rounded-2xl bg-ice p-4">
      <p className="font-semibold">{state.verified ? '✓ E-mail confirmado' : 'E-mail cadastrado'}</p>
      <p data-clarity-mask="true" className="break-all text-sm text-muted">{state.email}</p>
      <button type="button" className="text-sm font-semibold underline" disabled={busy} onClick={() => setEditing(true)}>Alterar e-mail</button>
      {!state.verified && state.configured && <>
        <p className="text-sm text-muted">Confirme para receber avisos e recuperar sua senha.</p>
        <SubmitButton type="button" variant="ghost" disabled={busy} onClick={send}>{sent ? 'Reenviar código' : 'Enviar código de confirmação'}</SubmitButton>
        {sent && <form data-clarity-mask="true" onSubmit={verify}><label className="block font-semibold">Código de 6 números<input className={field} value={code} onChange={e => C(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" required minLength={6} disabled={busy} /></label><div className="mt-3"><SubmitButton type="submit" loading={busy} disabled={code.length !== 6}>Confirmar e-mail</SubmitButton></div></form>}
      </>}
      {!state.verified && !state.configured && <p className="text-sm text-muted">A confirmação estará disponível quando o serviço de e-mail for ativado.</p>}
      <Link to={back} replace className="block rounded-xl bg-graphite px-4 py-3 text-center font-semibold text-white">{target === '/profissional' ? 'Continuar meu cadastro' : 'Continuar para minha conta'}</Link>
    </div>}
    <button type="button" className="mt-4 block w-full py-2 text-sm underline" disabled={busy} onClick={() => void run(async () => { await logout(); nav('/entrar', { replace: true }) })}>Sair da conta</button>
  </AuthShell>
}
