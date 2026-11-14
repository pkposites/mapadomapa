import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AuthShell, { standaloneLink } from '../components/AuthShell'
import Alert from '../components/ui/Alert'
import { PasswordField, PhoneField } from '../components/ui/Field'
import SubmitButton from '../components/ui/SubmitButton'
import { useAuth } from '../auth/AuthContext'
import { api, ApiError } from '../lib/api'
import { isPhoneComplete } from '../lib/phone'

export default function Entrar() {
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const state = (useLocation().state ?? {}) as { from?: string; notice?: string }
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ phone?: string; password?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)

  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    const next: typeof errors = {}
    if (!isPhoneComplete(phone)) next.phone = 'Digite o celular com DDD. Exemplo: (11) 91234-5678.'
    if (!password) next.password = 'Digite a sua senha.'
    setErrors(next)
    if (Object.keys(next).length) return
    setBusy(true)
    try {
      await api.post('/auth/login', { phone, password })
      await refresh()
      navigate(state.from ?? '/area', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.code === 'phone_not_verified') {
        navigate('/cadastro', { state: { verifyPhone: phone, resendIn: err.data.resendIn } })
        return
      }
      if (err instanceof ApiError && err.code === 'invalid_phone') setErrors({ phone: err.message })
      else setErrors({ form: err instanceof ApiError ? err.message : 'Algo deu errado. Tente de novo em instantes.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      eyebrow="Acesso"
      title="Entrar na sua conta"
      subtitle="Use o celular e a senha que você criou."
      below={<>Ainda não tem conta? <Link to="/cadastro" className={standaloneLink}>Faça o pré-cadastro grátis</Link></>}
    >
      <form onSubmit={submit} noValidate className="space-y-5">
        {state.notice && <Alert tone="success">{state.notice}</Alert>}
        {errors.form && <Alert tone="error">{errors.form}</Alert>}
        <PhoneField id="phone" label="Seu celular" value={phone} onChange={setPhone} error={errors.phone} autoFocus />
        <PasswordField id="password" label="Senha" value={password} onChange={setPassword} error={errors.password} />
        <SubmitButton type="submit" loading={busy}>Entrar</SubmitButton>
      </form>
    </AuthShell>
  )
}
