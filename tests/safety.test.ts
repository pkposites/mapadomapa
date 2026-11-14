import { readFileSync, readdirSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { getDb, setDb } from '../server/lib/db'
import { isLocalDatabaseUrl } from '../server/lib/env'
import { assertSafeTestDatabase } from './helpers'

const MIGRATIONS = './netlify/database/migrations'
const saved = { ...process.env }
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]
  Object.assign(process.env, saved)
  setDb(undefined)
})

describe('Isolamento: nada aqui pode alterar a produção', () => {
  it('migrações só criam estrutura e dados de referência (sem DROP/TRUNCATE/DELETE/UPDATE)', () => {
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'))
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) {
      const sql = readFileSync(`${MIGRATIONS}/${f}`, 'utf8').replace(/--.*$/gm, '')
      // Trocar uma regra de validação (DROP CONSTRAINT) não perde dado; tudo que apaga/zera dados continua proibido.
      expect(sql, f).not.toMatch(/\b(DROP\s+(TABLE|SCHEMA|DATABASE|COLUMN|VIEW|INDEX)|TRUNCATE|DELETE\s+FROM|UPDATE\s+\w+\s+SET)\b/i)
    }
  })

  it('nenhuma migração cria usuários, telefones nem administradores', () => {
    for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'))) {
      const sql = readFileSync(`${MIGRATIONS}/${f}`, 'utf8').replace(/--.*$/gm, '')
      expect(sql, f).not.toMatch(/INSERT\s+INTO\s+(users|phones|sessions|user_roles|verification_codes)\b/i)
    }
  })

  it('o código de teste nunca abre conexão "automática" (sempre com URL explícita e local)', () => {
    for (const f of readdirSync('./tests').filter((f) => f.endsWith('.ts'))) {
      if (f === 'safety.test.ts') continue
      const src = readFileSync(`./tests/${f}`, 'utf8')
      expect(src, f).not.toMatch(/getDatabase\(\s*\)/)
      expect(src, f).not.toMatch(/NETLIFY_DB_URL\s*=/)
    }
  })

  it('reconhece o que é banco local', () => {
    for (const u of ['postgres://x@localhost:5432/a', 'postgres://x@127.0.0.1/a', 'postgres://x@[::1]:5432/a']) expect(isLocalDatabaseUrl(u)).toBe(true)
    for (const u of ['postgres://x@db.example.com/a', 'postgres://x@ep-cool-123.neon.tech/a', 'postgres://x@10.0.0.5/a', 'lixo']) expect(isLocalDatabaseUrl(u)).toBe(false)
  })

  it('ambiente local RECUSA conectar em banco remoto (ex.: URL de produção exportada por engano)', () => {
    process.env.NETLIFY_DB_URL = 'postgres://usuario:senha@db.producao.example.com:5432/app'
    setDb(undefined)
    expect(() => getDb()).toThrow(/NÃO é local/)
  })

  it('a suíte de testes recusa TEST_PG_URL remota ou sem "test" no nome', () => {
    expect(() => assertSafeTestDatabase('postgres://u@db.producao.example.com/mdm_test')).toThrow(/recusada/)
    expect(() => assertSafeTestDatabase('postgres://u@127.0.0.1:5432/producao')).toThrow(/recusada/)
    expect(() => assertSafeTestDatabase('postgres://u@127.0.0.1:5432/mdm_test')).not.toThrow()
  })
})

describe('Roteamento: /api nunca pode cair na página HTML', () => {
  const toml = readFileSync('./netlify.toml', 'utf8')
  const rules = [...toml.matchAll(/\[\[redirects\]\]([\s\S]*?)(?=\n\[|$)/g)].map((m) => {
    const f = (k: string) => m[1].match(new RegExp(`${k}\\s*=\\s*"?([^"\\n]+)"?`))?.[1].trim()
    return { from: f('from'), to: f('to'), status: f('status'), force: f('force') }
  })

  it('a regra /api/* existe, aponta para a função e vem ANTES do fallback /* (primeira que casa vence)', () => {
    const api = rules.findIndex((r) => r.from === '/api/*')
    const spa = rules.findIndex((r) => r.from === '/*')
    expect(api).toBeGreaterThanOrEqual(0)
    expect(spa).toBeGreaterThanOrEqual(0)
    expect(api).toBeLessThan(spa)
    expect(rules[api]).toMatchObject({ to: '/.netlify/functions/api/:splat', status: '200', force: 'true' })
  })

  it('a função existe no caminho que a regra usa', () => {
    expect(readdirSync('./netlify/functions')).toContain('api.mts')
  })
})
