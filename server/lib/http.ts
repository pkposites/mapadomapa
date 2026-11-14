export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message)
  }
}

export const json = (data: unknown, status = 200, headers: HeadersInit = {}): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  })

export const errorResponse = (err: ApiError): Response =>
  json(
    { error: { code: err.code, message: err.message, ...err.extra } },
    err.status,
    typeof err.extra.retryAfter === 'number' ? { 'retry-after': String(err.extra.retryAfter) } : {},
  )

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const type = req.headers.get('content-type') ?? ''
  if (!type.includes('application/json')) {
    throw new ApiError(415, 'bad_request', 'Pedido inválido. Atualize a página e tente de novo.')
  }
  try {
    const body = await req.json()
    if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>
  } catch {
    /* cai no erro abaixo */
  }
  throw new ApiError(400, 'bad_request', 'Pedido inválido. Atualize a página e tente de novo.')
}

/** Defesa contra CSRF: se o navegador informou Origin, ele precisa ser o próprio site. */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get('origin')
  if (!origin) return
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? new URL(req.url).host
  let originHost: string
  try {
    originHost = new URL(origin).host
  } catch {
    throw new ApiError(403, 'forbidden_origin', 'Pedido não permitido.')
  }
  if (originHost !== host) throw new ApiError(403, 'forbidden_origin', 'Pedido não permitido.')
}

export const SESSION_COOKIE = 'mdm_session'

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get('cookie')
  if (!header) return undefined
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim())
      } catch {
        return undefined // cookie malformado = sem sessão (nunca um erro 500)
      }
    }
  }
  return undefined
}

export function sessionCookie(value: string, maxAgeSeconds: number, secure: boolean): string {
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ')
}

export const clearSessionCookie = (secure: boolean): string => sessionCookie('', 0, secure)
