import { getConnectionString, getDatabase } from '@netlify/database'
import { env, isDevEnvironment, isLocalDatabaseUrl } from './env'

type Db = ReturnType<typeof getDatabase>

/** Interface mínima que usamos do pool/cliente do Postgres (o tipo original é uma união de drivers). */
export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>
}
export interface TxClient extends Queryable {
  release(): void
}
interface PoolLike extends Queryable {
  connect(): Promise<TxClient>
}

// Um único cliente por instância (escopo de módulo), como recomenda a documentação.
let db: Db | undefined
export const getDb = (): Db => {
  if (!db) {
    // TRAVA: em ambiente local/testes só se aceita banco da própria máquina.
    // Se alguém exportar a URL de produção por engano, o servidor recusa em vez de gravar nela.
    if (isDevEnvironment()) {
      let url: string | undefined
      try {
        url = getConnectionString()
      } catch {
        /* sem URL configurada: getDatabase() reporta o erro adequado */
      }
      if (url && !isLocalDatabaseUrl(url)) {
        throw new Error('Ambiente local apontando para um banco que NÃO é local. Operação recusada para proteger a produção.')
      }
    }
    db = getDatabase()
  }
  return db
}
/** Usado pelos testes para apontar para um banco em memória. */
export const setDb = (next: Db | undefined): void => {
  db = next
}
const pool = (): PoolLike => getDb().pool as unknown as PoolLike

/**
 * O banco embutido do ambiente local (PGlite) atende todas as conexões na MESMA sessão:
 * transações simultâneas se misturariam. Por isso, localmente, o acesso é serializado
 * (uma operação por vez). Em produção (Postgres real) isso fica desligado.
 * Desligue também com DB_SERIALIZE=false ao testar contra um Postgres de verdade.
 */
let tail: Promise<unknown> = Promise.resolve()
let serialize = true
export const setSerialize = (on: boolean): void => {
  serialize = on
}
const serializeEnabled = (): boolean =>
  serialize && isDevEnvironment() && env('DB_SERIALIZE') !== 'false'
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  if (!serializeEnabled()) return fn()
  const run = tail.then(fn, fn)
  tail = run.catch(() => undefined)
  return run
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
  client?: Queryable,
): Promise<T[]> {
  // Dentro de uma transação (client informado) já estamos de posse da vez.
  if (client) return (await client.query<T>(text, params)).rows
  return exclusive(async () => (await pool().query<T>(text, params)).rows)
}

export function withTransaction<T>(fn: (client: TxClient) => Promise<T>): Promise<T> {
  return exclusive(() => runTransaction(fn))
}

async function runTransaction<T>(fn: (client: TxClient) => Promise<T>): Promise<T> {
  const client = await pool().connect()
  try {
    await client.query('BEGIN')
    const out = await fn(client)
    await client.query('COMMIT')
    return out
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw err
  } finally {
    client.release()
  }
}

/** Violação de índice único do Postgres (ex.: telefone duplicado em requisições simultâneas). */
export const isUniqueViolation = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505'
