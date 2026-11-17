export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public data: Record<string, unknown> = {},
  ) {
    super(message)
  }
}

const GENERIC = 'Algo deu errado. Tente de novo em instantes.'

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    })
  } catch {
    throw new ApiError(0, 'network', 'Sem conexão com a internet. Confira o sinal e tente de novo.')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const e = data?.error ?? {}
    throw new ApiError(res.status, e.code ?? 'error', e.message ?? GENERIC, e)
  }
  return data as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown = {}) => request<T>('PUT', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
}

export type Me = {
  user: { id: string; phone: string; phoneMasked: string; phoneVerified: boolean; email?:string|null; emailVerified?:boolean; roles: string[]; isAdmin: boolean }
}
