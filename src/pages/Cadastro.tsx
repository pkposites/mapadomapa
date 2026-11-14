import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AuthShell, { linkClass } from '../components/AuthShell'
import Alert from '../components/ui/Alert'
import { AlertCircle } from 'lucide-react'
import { CodeField, PasswordField, PhoneField } from '../components/ui/Field'
import SubmitButton from '../components/ui/SubmitButton'
import { useAuth } from '../auth/AuthContext'
import { api, ApiError } from '../lib/api'
import { isPhoneComplete } from '../lib/phone'
import { mmss, useCooldown } from '../hooks/useCooldown'
import { SITE } from '../config/site'

type Errors = Partial<Record<'phone' | 'password' | 'terms' | 'code' | 'form', string>>
type Registered = { phone: string; resendIn: number; expiresIn: number }

const FIELD_OF: Record<string, keyof Errors> = {
  invalid_phone: 'phone',
  weak_password: 'password',
  terms_required: 'terms',
  code_invalid: 'code',
  code_expired: 'code',
  code_locked: 'code',
}

export default function Cadastro() {
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const state = (useLocation().state ?? {}) as { verifyPhone?: string; resendIn?: number }

  // Vindo do login com celular ainda não confirmado: já abre na etapa do código.
  const [phone, setPhone] = useState(state.verifyPhone ?? '')
  const [password, setPassword] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'form' | 'code'>(state.verifyPhone ? 'code' : 'form')
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [cooldown, startCooldown] = useCooldown()
  useEffect(() => {
    if (state.resendIn) startCooldown(state.resendIn) // veio do login: respeita o intervalo do último SMS
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fail = (err: unknown, fallbackField: keyof Errors = 'form') => {
    const e = err instanceof ApiError ? err : null
    const field = e ? FIELD_OF[e.code] ?? fallbackField : 'form'
    setErrors({ [field]: e?.message ?? 'Algo deu errado. Tente de novo em instantes.' })
  }

  const submitForm = async (ev: FormEvent) => {
    ev.preventDefault()
    const next: Errors = {}
    if (!isPhoneComplete(phone)) next.phone = 'Digite o celular com DDD. Exemplo: (11) 91234-5678.'
    if (password.length < 8) next.password = 'Use pelo menos 8 caracteres na senha.'
    if (!accepted) next.terms = 'Marque que você leu e aceita para continuar.'
    setErrors(next)
    if (Object.keys(next).length) return
    setBusy(true)
    try {
      const r = await api.post<Registered>('/auth/register', { phone, password, acceptTerms: true })
      startCooldown(r.resendIn)
      setNotice(null)
      setStep('code')
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  const submitCode = async (ev: FormEvent) => {
    ev.preventDefault()
    if (code.length !== 6) return setErrors({ code: 'Digite os 6 números do SMS.' })
    setBusy(true)
    setErrors({})
    try {
      await api.post('/auth/verify-phone', { phone, code })
      await refresh()
      navigate('/conta', { replace: true })
    } catch (err) {
      fail(err, 'code')
    } finally {
      setBusy(false)
    }
  }

  const resend = async () => {
    setBusy(true)
    setErrors({})
    try {
      const r = await api.post<{ resendIn: number }>('/auth/resend-code', { phone })
      startCooldown(r.resendIn)
      setCode('')
      setNotice('Enviamos um novo código. Use o mais recente.')
    } catch (err) {
      if (err instanceof ApiError && typeof err.data.retryAfter === 'number') startCooldown(err.data.retryAfter)
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  if (step === 'code') {
    return (
      <AuthShell
        eyebrow="Passo 2 de 2"
        title="Confirme seu celular"
        subtitle={<>Enviamos um SMS com 6 números para <strong className="font-semibold text-graphite">{phone}</strong>. O código vale por 10 minutos.</>}
        below={
          <button type="button" onClick={() => { setStep('form'); setErrors({}); setCode(''); setNotice(null) }} className={linkClass}>
            Trocar o número do celular
          </button>
        }
      >
        <form onSubmit={submitCode} noValidate className="space-y-5">
          {notice && <Alert tone="success">{notice}</Alert>}
          {errors.form && <Alert tone="error">{errors.form}</Alert>}
          <CodeField id="code" label="Código do SMS" value={code} onChange={setCode} error={errors.code} autoFocus />
          <SubmitButton type="submit" loading={busy}>Confirmar celular</SubmitButton>
          <SubmitButton type="button" variant="ghost" disabled={busy || cooldown > 0} onClick={resend}>
            {cooldown > 0 ? `Reenviar código em ${mmss(cooldown)}` : 'Não recebi o código. Reenviar'}
          </SubmitButton>
        </form>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      eyebrow="Cadastro gratuito"
      title="Crie sua conta"
      subtitle="Só precisamos do seu celular e de uma senha. Não pedimos e-mail."
      below={<>Já tem conta? <Link to="/entrar" className={linkClass}>Entrar</Link></>}
    >
      <form onSubmit={submitForm} noValidate className="space-y-5">
        {errors.form && (
          <Alert tone="error">
            {errors.form}{' '}
            {errors.form.includes('já tem cadastro') && <Link to="/entrar" className={linkClass}>Entrar</Link>}
          </Alert>
        )}
        <PhoneField id="phone" label="Seu celular" hint="Vamos enviar um código por SMS para confirmar." value={phone} onChange={setPhone} error={errors.phone} autoFocus />
        <PasswordField id="password" label="Crie uma senha" hint="Pelo menos 8 caracteres." value={password} onChange={setPassword} error={errors.password} autoComplete="new-password" />

        <div>
          <label htmlFor="terms" className="flex min-h-11 cursor-pointer items-start gap-3 text-[15px] leading-snug">
            <input
              id="terms"
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              aria-invalid={Boolean(errors.terms)}
              aria-describedby={errors.terms ? 'terms-error' : undefined}
              className="mt-0.5 size-6 shrink-0 cursor-pointer rounded-md border-line accent-graphite"
            />
            <span>
              Li e aceito os{' '}
              <Link to={SITE.termsPath} target="_blank" className={linkClass}>Termos de Uso</Link> e a{' '}
              <Link to={SITE.privacyPath} target="_blank" className={linkClass}>Política de Privacidade</Link>.
            </span>
          </label>
          {errors.terms && (
            <p id="terms-error" role="alert" className="mt-1 flex items-start gap-2 text-[14px] font-medium leading-snug text-danger">
              <AlertCircle size={18} strokeWidth={2} className="mt-px shrink-0" aria-hidden="true" />
              {errors.terms}
            </p>
          )}
        </div>

        <SubmitButton type="submit" loading={busy}>Continuar</SubmitButton>
      </form>
    </AuthShell>
  )
}
