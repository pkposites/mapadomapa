import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import AuthShell, { linkClass, standaloneLink } from '../components/AuthShell'
import Alert from '../components/ui/Alert'
import CaptchaField, { type CaptchaMode } from '../components/ui/CaptchaField'
import { CodeField, PasswordField, PhoneField } from '../components/ui/Field'
import SubmitButton from '../components/ui/SubmitButton'
import Button from '../components/Button'
import Spinner from '../components/ui/Spinner'
import { useAuth } from '../auth/AuthContext'
import { api, ApiError } from '../lib/api'
import { getStatus, peekStatus } from '../lib/status'
import { isPhoneComplete } from '../lib/phone'
import { mmss, useCooldown } from '../hooks/useCooldown'
import { SITE } from '../config/site'
import { readConsent } from '../lib/consent'
import { readMetaCookies, trackBrowserEvent } from '../lib/meta'

type Errors = Partial<Record<'phone' | 'password' | 'terms' | 'code' | 'captcha' | 'form', string>>
type Registered = { phone: string; resendIn: number; expiresIn: number }

const FIELD_OF: Record<string, keyof Errors> = {
  invalid_phone: 'phone',
  weak_password: 'password',
  terms_required: 'terms',
  code_invalid: 'code',
  code_expired: 'code',
  code_locked: 'code',
  captcha_required: 'captcha',
  captcha_failed: 'captcha',
}
const CAPTCHA_MSG = 'Confirme que você não é um robô para continuar.'

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
  const [captcha, setCaptcha] = useState<string | null>(null)
  const [captchaReset, setCaptchaReset] = useState(0)
  const [open, setOpen] = useState<boolean | null>(() => peekStatus()?.preRegistrationOpen ?? null) // pré-cadastro aberto?
  const [vmode, setVmode] = useState<'admin' | 'sms'>(() => peekStatus()?.verificationMode ?? 'admin') // como o celular é verificado
  const [captchaMode, setCaptchaMode] = useState<CaptchaMode>(null)
  const [hp, setHp] = useState('') // campo-isca anti-robô (pessoas nunca veem)

  useEffect(() => {
    if (state.resendIn) startCooldown(state.resendIn) // veio do login: respeita o intervalo do último SMS
    getStatus().then((s) => { setOpen(s.preRegistrationOpen); setVmode(s.verificationMode) }).catch(() => setOpen(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fail = (err: unknown, fallbackField: keyof Errors = 'form') => {
    const e = err instanceof ApiError ? err : null
    if (e?.code === 'preregistration_closed') return setOpen(false)
    const field = e ? FIELD_OF[e.code] ?? fallbackField : 'form'
    setErrors({ [field]: e?.message ?? 'Algo deu errado. Tente de novo em instantes.' })
  }
  const newCaptcha = () => {
    setCaptcha(null)
    setCaptchaReset((n) => n + 1) // o token é de uso único
  }

  const submitForm = async (ev: FormEvent) => {
    ev.preventDefault()
    const next: Errors = {}
    if (!isPhoneComplete(phone)) next.phone = 'Digite o celular com DDD. Exemplo: (11) 91234-5678.'
    if (password.length < 8) next.password = 'Use pelo menos 8 caracteres na senha.'
    if (!accepted) next.terms = 'Marque que você leu e aceita para continuar.'
    if (captchaMode && !captcha) next.captcha = captchaMode === 'pow' ? 'Verificando a segurança… aguarde um instante e toque em Continuar de novo.' : CAPTCHA_MSG
    setErrors(next)
    if (Object.keys(next).length) return
    setBusy(true)
    try {
      const r = await api.post<Registered | { ok: true; mode: 'admin' }>('/auth/register', { phone, password, acceptTerms: true, captchaToken: captcha, contato_extra: hp })
      if ('mode' in r) { // MVP: conta criada e já logada; o celular será verificado pela equipe
        await refresh()
        navigate('/profissional', { replace: true })
        return
      }
      startCooldown(r.resendIn)
      setNotice(null)
      setStep('code')
    } catch (err) {
      fail(err)
    } finally {
      newCaptcha()
      setBusy(false)
    }
  }

  const submitCode = async (ev: FormEvent) => {
    ev.preventDefault()
    if (code.length !== 6) return setErrors({ code: 'Digite os 6 números do SMS.' })
    setBusy(true)
    setErrors({})
    try {
      const consent = readConsent() === 'granted'
      const r = await api.post<{ tracking?: { eventName: string; eventId: string } }>('/auth/verify-phone', {
        phone,
        code,
        trackingConsent: consent,
        ...(consent ? readMetaCookies() : {}),
      })
      // Mesmo event_name + event_id do servidor => a Meta conta UMA conversão (deduplicação).
      if (consent && r.tracking) trackBrowserEvent(r.tracking.eventName, { content_name: 'pre_cadastro' }, r.tracking.eventId)
      await refresh()
      navigate('/area', { replace: true })
    } catch (err) {
      fail(err, 'code')
    } finally {
      setBusy(false)
    }
  }

  const resend = async () => {
    if (captchaMode && !captcha) return setErrors({ captcha: CAPTCHA_MSG })
    setBusy(true)
    setErrors({})
    try {
      const r = await api.post<{ resendIn: number }>('/auth/resend-code', { phone, captchaToken: captcha })
      startCooldown(r.resendIn)
      setCode('')
      setNotice('Enviamos um novo código. Use o mais recente.')
    } catch (err) {
      if (err instanceof ApiError && typeof err.data.retryAfter === 'number') startCooldown(err.data.retryAfter)
      fail(err)
    } finally {
      newCaptcha()
      setBusy(false)
    }
  }

  if (open === null && step === 'form') return <Spinner fullPage />

  if (open === false && step === 'form') {
    return (
      <AuthShell
        eyebrow="Pré-cadastro"
        title="O pré-cadastro abre em breve"
        subtitle={<>Os pedidos de orçamento estão previstos a partir de <strong className="font-semibold text-graphite">{SITE.requestsOpenLabel}</strong>. Volte em breve.</>}
        below={<>Já tem conta? <Link to="/entrar" className={standaloneLink}>Entrar</Link></>}
      >
        <Button to="/" variant="dark" fullWidth>Voltar para o início</Button>
      </AuthShell>
    )
  }

  if (step === 'code') {
    return (
      <AuthShell
        eyebrow="Passo 2 de 2"
        title="Confirme seu celular"
        subtitle={<>Enviamos um SMS com 6 números para <strong className="font-semibold text-graphite">{phone}</strong>. O código vale por 10 minutos.</>}
        below={
          <button type="button" onClick={() => { setStep('form'); setErrors({}); setCode(''); setNotice(null) }} className={standaloneLink}>
            Trocar o número do celular
          </button>
        }
      >
        <form onSubmit={submitCode} noValidate className="space-y-5">
          {notice && <Alert tone="success">{notice}</Alert>}
          {errors.form && <Alert tone="error">{errors.form}</Alert>}
          <CodeField id="code" label="Código do SMS" value={code} onChange={setCode} error={errors.code} autoFocus />
          <SubmitButton type="submit" loading={busy}>Confirmar celular</SubmitButton>
          {cooldown > 0 ? (
            <SubmitButton type="button" variant="ghost" disabled>Reenviar código em {mmss(cooldown)}</SubmitButton>
          ) : (
            <>
              <CaptchaField onToken={setCaptcha} resetSignal={captchaReset} error={errors.captcha} />
              <SubmitButton type="button" variant="ghost" disabled={busy} onClick={resend}>Não recebi o código. Reenviar</SubmitButton>
            </>
          )}
        </form>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      eyebrow="Pré-cadastro gratuito"
      title="Crie sua conta"
      subtitle={vmode === 'admin'
        ? <>Só precisamos do seu celular e de uma senha. Sua conta é criada na hora, o celular é verificado depois pela nossa equipe e seu perfil fica em análise até a aprovação. Os pedidos de orçamento estão previstos a partir de {SITE.requestsOpenLabel}.</>
        : <>Só precisamos do seu celular e de uma senha. Não pedimos e-mail. Os pedidos de orçamento estão previstos a partir de {SITE.requestsOpenLabel}.</>}
      below={<>Já tem conta? <Link to="/entrar" className={standaloneLink}>Entrar</Link></>}
    >
      <form onSubmit={submitForm} noValidate className="space-y-5">
        <p className="rounded-2xl bg-ice p-3 text-[13px] leading-snug text-muted" data-testid="signup-transparency">Cadastro gratuito. A aprovação depende de análise da equipe e o cadastro <strong className="font-semibold text-graphite">não garante oportunidades, contratação nem rendimento</strong>. Condições comerciais futuras serão informadas antes de qualquer cobrança.</p>
        <div data-testid="signup-steps" aria-label="Passos do cadastro">
          <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">Passo 1 de 4 · Crie sua conta</p>
          <div className="mt-2 grid grid-cols-4 gap-1.5" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => <span key={i} className={`h-1.5 rounded-full ${i === 0 ? 'bg-graphite' : 'bg-line'}`} />)}
          </div>
          <p className="mt-2 text-[14px] leading-snug text-muted">Depois você escolhe até 2 profissões e 2 regiões, conta sua experiência e responde a 3 perguntas rápidas por profissão.</p>
        </div>
        {errors.form && (
          <Alert tone="error">
            {errors.form}{' '}
            {errors.form.includes('já tem cadastro') && <Link to="/entrar" className={linkClass}>Entrar</Link>}
          </Alert>
        )}
        <PhoneField id="phone" label="Seu celular" hint={vmode === 'admin' ? 'Usamos para a equipe falar com você.' : 'Vamos enviar um código por SMS para confirmar.'} value={phone} onChange={setPhone} error={errors.phone} autoFocus />
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

        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>Não preencha este campo<input type="text" name="contato_extra" tabIndex={-1} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} data-lpignore="true" data-1p-ignore="true" value={hp} onChange={(e) => setHp(e.target.value)} /></label>
        </div>
        <CaptchaField onToken={setCaptcha} onMode={setCaptchaMode} resetSignal={captchaReset} error={errors.captcha} />
        <SubmitButton type="submit" loading={busy}>{vmode === 'admin' ? 'Criar minha conta' : 'Continuar'}</SubmitButton>
      </form>
    </AuthShell>
  )
}
