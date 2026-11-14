import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { api, ApiError, type Me } from '../lib/api'
import { disablePush } from '../lib/push'

type AuthState = {
  user: Me['user'] | null
  loading: boolean
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

// Pista (não é segredo) de que este navegador já entrou. Evita consultar a API em cada
// visita anônima à landing. O servidor continua sendo a única fonte da verdade.
const HINT = 'mdm_signed_in'
const hint = {
  get: (): boolean => { try { return localStorage.getItem(HINT) === '1' } catch { return false } },
  set: (on: boolean): void => { try { on ? localStorage.setItem(HINT, '1') : localStorage.removeItem(HINT) } catch { /* sem storage */ } },
}
const isPrivate = (p: string) => p === '/conta' || p === '/profissional' || p.startsWith('/area') || p.startsWith('/admin')

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me['user'] | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      setUser((await api.get<Me>('/auth/me')).user)
      hint.set(true)
    } catch (err) {
      hint.set(false)
      // 401 = sem sessão (normal). Outros erros: mantém deslogado.
      if (!(err instanceof ApiError)) console.error(err)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(async () => {
    // Se o servidor não confirmar, NÃO fingimos que saiu: a sessão continuaria válida lá.
    // O erro sobe para a tela mostrar uma mensagem e permitir tentar de novo.
    await Promise.race([disablePush(), new Promise((r) => setTimeout(r, 3000))]) // este aparelho deixa de receber avisos desta conta
    await api.post('/auth/logout')
    hint.set(false)
    setUser(null)
  }, [])

  const { pathname } = useLocation()
  useEffect(() => {
    // Páginas privadas sempre perguntam ao servidor; as públicas só se houver indício de sessão.
    if (hint.get() || isPrivate(pathname)) void refresh()
    else setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const value = useMemo(() => ({ user, loading, refresh, logout }), [user, loading, refresh, logout])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return v
}
