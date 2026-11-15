import { useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { AlertCircle, Eye, EyeOff } from 'lucide-react'
import { maskPhone } from '../../lib/phone'

type FieldProps = { id: string; label: string; hint?: string; error?: string | null; children: ReactNode }

export function Field({ id, label, hint, error, children }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-[15px] font-semibold">
        {label}
      </label>
      {hint && <p className="mt-0.5 text-[14px] leading-snug text-muted">{hint}</p>}
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-2 flex items-start gap-2 text-[14px] font-medium leading-snug text-danger">
          <AlertCircle size={18} strokeWidth={2} className="mt-px shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  )
}

const input = (error?: boolean) =>
  `mt-2 block min-h-13 w-full rounded-2xl border bg-white px-4 text-[17px] text-graphite transition-colors duration-150 placeholder:text-placeholder focus:outline-2 focus:outline-offset-2 focus:outline-graphite ${
    error ? 'border-danger' : 'border-line hover:border-[#c9d0c7]'
  }`

type Base = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
  id: string
  label: string
  hint?: string
  error?: string | null
  value: string
  onChange: (value: string) => void
}

export function PhoneField({ id, label, hint, error, value, onChange, ...rest }: Base) {
  // O "+55" fica dentro da mesma caixa do campo (flex), então o alinhamento é automático.
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <div
        className={`mt-2 flex min-h-13 w-full items-center rounded-2xl border bg-white transition-colors duration-150 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-graphite ${
          error ? 'border-danger' : 'border-line hover:border-[#c9d0c7]'
        }`}
      >
        <span aria-hidden="true" className="select-none pl-4 pr-2 text-[17px] font-semibold text-muted">
          +55
        </span>
        <input
          {...rest}
          id={id}
          data-clarity-mask="true"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="(11) 91234-5678"
          value={value}
          onChange={(e) => onChange(maskPhone(e.target.value))}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className="min-h-13 min-w-0 flex-1 rounded-r-2xl bg-transparent pr-4 text-[17px] text-graphite outline-none placeholder:text-placeholder"
        />
      </div>
    </Field>
  )
}

export function PasswordField({ id, label, hint, error, value, onChange, autoComplete = 'current-password', ...rest }: Base) {
  const [shown, setShown] = useState(false)
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <div className="relative">
        <input
          {...rest}
          id={id}
          data-clarity-mask="true"
          type={shown ? 'text' : 'password'}
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`${input(Boolean(error))} pr-14`}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? 'Esconder senha' : 'Mostrar senha'}
          aria-pressed={shown}
          className="absolute right-1 top-[calc(0.5rem+0.25rem)] grid size-11 place-items-center rounded-xl text-muted transition-colors duration-150 hover:text-graphite active:scale-95"
        >
          {shown ? <EyeOff size={22} strokeWidth={1.75} /> : <Eye size={22} strokeWidth={1.75} />}
        </button>
      </div>
    </Field>
  )
}

export function CodeField({ id, label, hint, error, value, onChange, ...rest }: Base) {
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <input
        {...rest}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={6}
        placeholder="000000"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${input(Boolean(error))} text-center text-[28px] font-bold tracking-[0.4em] placeholder:font-normal placeholder:tracking-[0.4em]`}
      />
    </Field>
  )
}
