import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthShell, { linkClass } from '../components/AuthShell'
import Alert from '../components/ui/Alert'
import { CodeField, PasswordField, PhoneField } from '../components/ui/Field'
import SubmitButton from '../components/ui/SubmitButton'
import { api, ApiError } from '../lib/api'
import { isPhoneComplete } from '../lib/phone'
import { mmss, useCooldown } from '../hooks/useCooldown'

type Errors = Partial<Record<'phone' | 'code' | 'password' | 'form', string>>
const FIELD_OF: Record<string, keyof Errors> = {
  invalid_phone: 'phone', weak_password: 'password', code_invalid: 'code', code_expired: 'code', code_locked: 'code',
}

export default function RecuperarSenha() {
  const navigate = useNavigate()
  const [step, setStep] = useState<'phone' | 'reset'>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  const [cooldown, startCooldown] = useCooldown()

  const fail = (err: unknown) => {
    const e = err instanceof ApiError ? err : null
    setErrors({ [e ? FIELD_OF[e.code] ?? 'form' : 'form']: e?.message ?? 'Algo deu errado. Tente de novo em instantes.' })
  }

  const sendCode = async (ev?: FormEvent) => {
    ev?.preventDefault()
    if (!isPhoneComplete(phone)) return setErrors({ phone: 'Digite o celular com DDD. Exemplo: (11) 91234-5678.' })
    setBusy(true)
    setErrors({})
    try {
      const r = await api.post<{ resendIn: number }>('/auth/forgot-password', { phone })
      startCooldown(r.resendIn)
      setStep('reset')
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  const reset = async (ev: FormEvent) => {
    ev.preventDefault()
    const next: Errors = {}
    if (code.length !== 6) next.code = 'Digite os 6 números do SMS.'
    if (password.length < 8) next.password = 'Use pelo menos 8 caracteres na senha.'
    setErrors(next)
    if (Object.keys(next).length) return
    setBusy(true)
    try {
      await api.post('/auth/reset-password', { phone, code, password })
      navigate('/entrar', { replace: true, state: { notice: 'Senha alterada! Entre com a nova senha.' } })
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  if (step === 'reset') {
    return (
      <AuthShell
        eyebrow="Recuperar acesso"
        title="Crie uma nova senha"
        subtitle={<>Se <strong className="font-semibold text-graphite">{phone}</strong> tiver cadastro, enviamos um SMS com 6 números. O código vale por 10 minutos.</>}
        below={<button type="button" className={linkClass} onClick={() => { setStep('phone'); setErrors({}); setCode('') }}>Trocar o número do celular</button>}
      >
        <form onSubmit={reset} noValidate className="space-y-5">
          {errors.form && <Alert tone="error">{errors.form}</Alert>}
          <CodeField id="code" label="Código do SMS" value={code} onChange={setCode} error={errors.code} autoFocus />
          <PasswordField id="password" label="Nova senha" hint="Pelo menos 8 caracteres." value={password} onChange={setPassword} error={errors.password} autoComplete="new-password" />
          <SubmitButton type="submit" loading={busy}>Salvar nova senha</SubmitButton>
          <SubmitButton type="button" variant="ghost" disabled={busy || cooldown > 0} onClick={() => sendCode()}>
            {cooldown > 0 ? `Reenviar código em ${mmss(cooldown)}` : 'Não recebi o código. Reenviar'}
          </SubmitButton>
        </form>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      eyebrow="Recuperar acesso"
      title="Esqueceu a senha?"
      subtitle="Digite seu celular. Vamos enviar um código por SMS para você criar uma nova senha."
      below={<Link to="/entrar" className={linkClass}>Voltar para o login</Link>}
    >
      <form onSubmit={sendCode} noValidate className="space-y-5">
        {errors.form && <Alert tone="error">{errors.form}</Alert>}
        <PhoneField id="phone" label="Seu celular" value={phone} onChange={setPhone} error={errors.phone} autoFocus />
        <SubmitButton type="submit" loading={busy}>Enviar código</SubmitButton>
      </form>
    </AuthShell>
  )
}
