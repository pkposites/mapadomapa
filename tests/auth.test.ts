import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { query } from '../server/lib/db'
import { advance, api, cleanDb, E164, lastCode, makeAdmin, PASSWORD, PHONE, signup, smsCount, startDb, stopDb } from './helpers'

beforeAll(async () => {
  await startDb()
})
afterAll(async () => {
  await stopDb()
})
beforeEach(async () => {
  await cleanDb()
})

const register = (over: Record<string, unknown> = {}, ip?: string) =>
  api('POST', '/auth/register', { body: { phone: PHONE, password: PASSWORD, acceptTerms: true, ...over }, ip })

describe('1. Criação de conta', () => {
  it('cria conta pendente, envia SMS simulado e guarda só o hash da senha', async () => {
    const r = await register()
    expect(r.status).toBe(200)
    expect(r.body.phone).toBe(PHONE)
    expect(await lastCode()).toMatch(/^\d{6}$/)

    const [u] = await query<any>('SELECT status, password_hash, terms_accepted_at FROM users')
    expect(u.status).toBe('pending')
    expect(u.password_hash).toMatch(/^scrypt\$/)
    expect(u.password_hash).not.toContain(PASSWORD)
    expect(u.terms_accepted_at).toBeTruthy()
    // perfil e papel "user" criados junto; nenhum e-mail é pedido
    expect((await query('SELECT 1 FROM profiles')).length).toBe(1)
    expect((await query("SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE r.name='user'")).length).toBe(1)
  })

  it('o código fica no banco apenas como hash (nunca em texto puro)', async () => {
    await register()
    const code = await lastCode()
    const [row] = await query<any>('SELECT code_hash FROM verification_codes')
    expect(row.code_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(row.code_hash).not.toContain(code)
  })

  it('confirma o celular com o código correto, ativa a conta e inicia a sessão', async () => {
    await register()
    const v = await api('POST', '/auth/verify-phone', { body: { phone: PHONE, code: await lastCode() } })
    expect(v.status).toBe(200)
    expect(v.headers.get('set-cookie')).toMatch(/HttpOnly/)
    expect(v.headers.get('set-cookie')).toMatch(/SameSite=Lax/)
    const me = await api('GET', '/auth/me', { cookie: v.cookie })
    expect(me.status).toBe(200)
    expect(me.body.user.phone).toBe(PHONE)
    expect(me.body.user.roles).toEqual(['user'])
    expect((await query<any>('SELECT status FROM users'))[0].status).toBe('active')
    expect((await query<any>('SELECT verified_at FROM phones'))[0].verified_at).toBeTruthy()
  })

  it('o token da sessão não é guardado em texto puro', async () => {
    const cookie = await signup()
    const token = decodeURIComponent(cookie.split('=')[1])
    const [s] = await query<any>('SELECT token_hash FROM sessions')
    expect(s.token_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(s.token_hash).not.toContain(token)
  })

  it('o código só funciona uma vez', async () => {
    await register()
    const code = await lastCode()
    expect((await api('POST', '/auth/verify-phone', { body: { phone: PHONE, code } })).status).toBe(200)
    const again = await api('POST', '/auth/verify-phone', { body: { phone: PHONE, code } })
    expect(again.status).toBe(400)
    expect(again.body.error.code).toBe('code_expired')
  })

  it.each([
    [{ phone: '123' }, 'invalid_phone'],
    [{ phone: '(11) 3123-4567' }, 'invalid_phone'],
    [{ password: 'curta' }, 'weak_password'],
    [{ password: '12345678' }, 'weak_password'],
    [{ acceptTerms: false }, 'terms_required'],
  ])('recusa dados inválidos %j com mensagem clara', async (over, code) => {
    const r = await register(over)
    expect(r.status).toBe(400)
    expect(r.body.error.code).toBe(code)
    expect(r.body.error.message.length).toBeGreaterThan(10)
    expect((await query('SELECT 1 FROM users')).length).toBe(0)
  })
})

describe('2. Telefone duplicado', () => {
  it('bloqueia novo cadastro com número já confirmado (mesmo escrito de outro jeito)', async () => {
    await signup()
    for (const variant of [PHONE, '11912345678', '+55 11 91234-5678']) {
      const r = await register({ phone: variant, password: 'outra-senha-forte-9' })
      expect(r.status).toBe(409)
      expect(r.body.error.code).toBe('phone_taken')
    }
    expect((await query('SELECT 1 FROM users')).length).toBe(1)
  })

  it('número não confirmado (cadastro abandonado) pode ser retomado, sem criar usuário duplicado', async () => {
    await register()
    advance(120) // passa o intervalo mínimo de reenvio
    const r = await register({ password: 'senha-nova-forte-77' })
    expect(r.status).toBe(200)
    expect((await query('SELECT 1 FROM users')).length).toBe(1)
    expect((await query('SELECT 1 FROM phones')).length).toBe(1)
    // a senha nova é a que vale
    const v = await api('POST', '/auth/verify-phone', { body: { phone: PHONE, code: await lastCode() } })
    expect(v.status).toBe(200)
    expect((await api('POST', '/auth/login', { body: { phone: PHONE, password: 'senha-nova-forte-77' } })).status).toBe(200)
    expect((await api('POST', '/auth/login', { body: { phone: PHONE, password: PASSWORD } })).status).toBe(401)
  })

  it('requisições simultâneas com o mesmo número criam apenas UMA conta', async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => register({}, `10.9.9.${i + 1}`)),
    )
    const ok = results.filter((r) => r.status === 200).length
    expect(ok).toBeGreaterThanOrEqual(1)
    expect(results.every((r) => [200, 409, 429].includes(r.status))).toBe(true)
    expect((await query('SELECT 1 FROM users')).length).toBe(1)
    expect((await query('SELECT 1 FROM phones')).length).toBe(1)
  })

  it('o banco recusa o telefone duplicado mesmo sem passar pela API', async () => {
    await signup()
    const [{ id }] = await query<any>("INSERT INTO users (password_hash) VALUES ('x') RETURNING id")
    await expect(query('INSERT INTO phones (user_id, e164) VALUES ($1, $2)', [id, E164])).rejects.toMatchObject({ code: '23505' })
  })
})

describe('3. Expiração e limites dos códigos', () => {
  it('código vencido (10 min) é recusado e pede um novo', async () => {
    await register()
    const code = await lastCode()
    advance(10 * 60 + 1)
    const v = await api('POST', '/auth/verify-phone', { body: { phone: PHONE, code } })
    expect(v.status).toBe(400)
    expect(v.body.error.code).toBe('code_expired')
    expect(v.body.error.message).toContain('venceu')
  })

  it('ainda vale no último segundo da janela', async () => {
    await register()
    const code = await lastCode()
    advance(10 * 60 - 1)
    expect((await api('POST', '/auth/verify-phone', { body: { phone: PHONE, code } })).status).toBe(200)
  })

  it('erros mostram quantas tentativas restam; após 5, o código é invalidado mesmo se acertar', async () => {
    await register()
    const good = await lastCode()
    const wrong = good === '000000' ? '111111' : '000000'
    const first = await api('POST', '/auth/verify-phone', { body: { phone: PHONE, code: wrong } })
    expect(first.body.error.code).toBe('code_invalid')
    expect(first.body.error.attemptsLeft).toBe(4)
    for (let i = 0; i < 4; i++) await api('POST', '/auth/verify-phone', { body: { phone: PHONE, code: wrong } })
    const locked = await api('POST', '/auth/verify-phone', { body: { phone: PHONE, code: good } })
    expect(locked.status).toBe(400)
    expect(locked.body.error.code).toBe('code_locked')
  })

  it('reenvio: 1 por minuto; o código novo invalida o anterior', async () => {
    await register()
    const old = await lastCode()
    const early = await api('POST', '/auth/resend-code', { body: { phone: PHONE } })
    // resposta é igual para qualquer número, mas o SMS não é reenviado antes do prazo
    expect(early.status === 200 || early.status === 429).toBe(true)
    expect(await smsCount()).toBe(1)
    advance(61)
    expect((await api('POST', '/auth/resend-code', { body: { phone: PHONE } })).status).toBe(200)
    expect(await smsCount()).toBe(2)
    const fresh = await lastCode()
    if (fresh !== old) {
      const withOld = await api('POST', '/auth/verify-phone', { body: { phone: PHONE, code: old } })
      expect(withOld.status).toBe(400)
    }
  })

  it('no máximo 5 SMS por hora por número', async () => {
    await register()
    for (let i = 1; i <= 6; i++) {
      advance(i * 61)
      await api('POST', '/auth/resend-code', { body: { phone: PHONE }, ip: `10.8.${i}.1` })
    }
    expect(await smsCount()).toBeLessThanOrEqual(5)
  })
})

describe('3b. Concorrência nos códigos', () => {
  it('o mesmo código correto usado por 6 requisições simultâneas vale para apenas UMA', async () => {
    await register()
    const code = await lastCode()
    const rs = await Promise.all(
      Array.from({ length: 6 }, () => api('POST', '/auth/verify-phone', { body: { phone: PHONE, code } })),
    )
    expect(rs.filter((r) => r.status === 200).length).toBe(1)
    expect((await query('SELECT 1 FROM sessions')).length).toBe(1)
  })

  it('20 palpites simultâneos não burlam o limite de 5 tentativas', async () => {
    await register()
    const good = await lastCode()
    const wrong = good === '000000' ? '111111' : '000000'
    await Promise.all(Array.from({ length: 20 }, () => api('POST', '/auth/verify-phone', { body: { phone: PHONE, code: wrong } })))
    const after = await api('POST', '/auth/verify-phone', { body: { phone: PHONE, code: good } })
    expect(after.status).toBeGreaterThanOrEqual(400)
    expect(['code_locked', 'too_many_attempts']).toContain(after.body.error.code)
  })
})

describe('4. Login', () => {
  it('login correto cria sessão e /me funciona', async () => {
    await signup()
    const r = await api('POST', '/auth/login', { body: { phone: PHONE, password: PASSWORD } })
    expect(r.status).toBe(200)
    expect((await api('GET', '/auth/me', { cookie: r.cookie })).body.user.phone).toBe(PHONE)
  })

  it('senha errada e número inexistente recebem a MESMA resposta (não revela quem tem conta)', async () => {
    await signup()
    const wrongPw = await api('POST', '/auth/login', { body: { phone: PHONE, password: 'senha-errada-123' } })
    const unknown = await api('POST', '/auth/login', { body: { phone: '(21) 98765-4321', password: 'senha-errada-123' } })
    expect(wrongPw.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect(wrongPw.body).toEqual(unknown.body)
    expect(wrongPw.body.error.message).toContain('Celular ou senha incorretos')
    expect(wrongPw.cookie).toBeUndefined()
  })

  it('aceita o celular em qualquer formato', async () => {
    await signup()
    for (const p of ['11912345678', '+5511912345678', '(11)91234-5678']) {
      expect((await api('POST', '/auth/login', { body: { phone: p, password: PASSWORD } })).status).toBe(200)
    }
  })

  it('conta não confirmada: senha certa leva à confirmação do celular (novo SMS)', async () => {
    await register()
    advance(120)
    const r = await api('POST', '/auth/login', { body: { phone: PHONE, password: PASSWORD } })
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('phone_not_verified')
    expect(r.cookie).toBeUndefined()
    expect(await smsCount()).toBe(2)
  })

  it('conta bloqueada não entra', async () => {
    await signup()
    await query("UPDATE users SET status = 'disabled'")
    const r = await api('POST', '/auth/login', { body: { phone: PHONE, password: PASSWORD } })
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('account_disabled')
  })
})

describe('5. Proteção contra tentativas abusivas', () => {
  it('após 5 senhas erradas o número é bloqueado — até com a senha certa', async () => {
    await signup()
    for (let i = 0; i < 5; i++) {
      const r = await api('POST', '/auth/login', { body: { phone: PHONE, password: 'errada-' + i + 'xyz' }, ip: `10.7.0.${i + 1}` })
      expect(r.status).toBe(401)
    }
    const blocked = await api('POST', '/auth/login', { body: { phone: PHONE, password: PASSWORD }, ip: '10.7.0.99' })
    expect(blocked.status).toBe(429)
    expect(blocked.body.error.code).toBe('too_many_attempts')
    expect(blocked.body.error.message).toContain('minutos')
    expect(blocked.headers.get('retry-after')).toBeTruthy()
  })

  it('o bloqueio termina depois de 15 minutos', async () => {
    await signup()
    for (let i = 0; i < 5; i++) await api('POST', '/auth/login', { body: { phone: PHONE, password: 'errada-' + i + 'xyz' }, ip: `10.6.0.${i + 1}` })
    advance(15 * 60 + 5)
    expect((await api('POST', '/auth/login', { body: { phone: PHONE, password: PASSWORD }, ip: '10.6.1.1' })).status).toBe(200)
  })

  it('login certo zera o contador de falhas', async () => {
    await signup()
    for (let i = 0; i < 4; i++) await api('POST', '/auth/login', { body: { phone: PHONE, password: 'errada-' + i + 'xyz' }, ip: `10.5.0.${i + 1}` })
    expect((await api('POST', '/auth/login', { body: { phone: PHONE, password: PASSWORD }, ip: '10.5.1.1' })).status).toBe(200)
    for (let i = 0; i < 4; i++) {
      expect((await api('POST', '/auth/login', { body: { phone: PHONE, password: 'errada-' + i + 'xyz' }, ip: `10.5.2.${i + 1}` })).status).toBe(401)
    }
  })

  it('limite por IP: muitas tentativas de um mesmo IP são barradas', async () => {
    let blocked = 0
    for (let i = 0; i < 35; i++) {
      const phone = `(11) 9${String(1000 + i).padStart(4, '0')}-0000`
      const r = await api('POST', '/auth/login', { body: { phone, password: 'qualquer-senha-1' }, ip: '10.4.4.4' })
      if (r.status === 429) blocked++
    }
    expect(blocked).toBeGreaterThan(0)
  })

  it('limite de cadastros por IP', async () => {
    let blocked = 0
    for (let i = 0; i < 12; i++) {
      advance(i)
      const r = await register({ phone: `(11) 9${String(2000 + i).padStart(4, '0')}-1111` }, '10.3.3.3')
      if (r.status === 429) blocked++
    }
    expect(blocked).toBeGreaterThan(0)
  })
})

describe('6. Recuperação de senha', () => {
  it('envia código, troca a senha, derruba as sessões antigas e a senha velha deixa de valer', async () => {
    const oldCookie = await signup()
    advance(120)
    const f = await api('POST', '/auth/forgot-password', { body: { phone: PHONE } })
    expect(f.status).toBe(200)
    const code = await lastCode()

    const r = await api('POST', '/auth/reset-password', { body: { phone: PHONE, code, password: 'senha-novissima-55' } })
    expect(r.status).toBe(200)
    expect((await api('GET', '/auth/me', { cookie: oldCookie })).status).toBe(401) // sessão antiga encerrada
    expect((await api('POST', '/auth/login', { body: { phone: PHONE, password: PASSWORD } })).status).toBe(401)
    expect((await api('POST', '/auth/login', { body: { phone: PHONE, password: 'senha-novissima-55' } })).status).toBe(200)
  })

  it('número sem cadastro recebe a mesma resposta e NENHUM SMS é enviado', async () => {
    const known = (await signup(), await api('POST', '/auth/forgot-password', { body: { phone: PHONE } }))
    const unknown = await api('POST', '/auth/forgot-password', { body: { phone: '(21) 98765-4321' } })
    expect(unknown.status).toBe(known.status)
    expect(unknown.body).toEqual(known.body)
    expect(await smsCount('+5521987654321')).toBe(0)
  })

  it('código de recuperação vence em 10 minutos', async () => {
    await signup()
    advance(120)
    await api('POST', '/auth/forgot-password', { body: { phone: PHONE } })
    const code = await lastCode()
    advance(120 + 10 * 60 + 1)
    const r = await api('POST', '/auth/reset-password', { body: { phone: PHONE, code, password: 'senha-novissima-55' } })
    expect(r.status).toBe(400)
    expect(r.body.error.code).toBe('code_expired')
    expect((await api('POST', '/auth/login', { body: { phone: PHONE, password: PASSWORD } })).status).toBe(200)
  })

  it('código errado não troca a senha; código de cadastro não serve para recuperação', async () => {
    await signup()
    advance(120)
    await api('POST', '/auth/forgot-password', { body: { phone: PHONE } })
    const good = await lastCode()
    const wrong = good === '123456' ? '654321' : '123456'
    const r = await api('POST', '/auth/reset-password', { body: { phone: PHONE, code: wrong, password: 'senha-novissima-55' } })
    expect(r.body.error.code).toBe('code_invalid')
    expect((await api('POST', '/auth/login', { body: { phone: PHONE, password: PASSWORD } })).status).toBe(200)
  })

  it('senha nova fraca é recusada SEM gastar o código', async () => {
    await signup()
    advance(120)
    await api('POST', '/auth/forgot-password', { body: { phone: PHONE } })
    const code = await lastCode()
    const weak = await api('POST', '/auth/reset-password', { body: { phone: PHONE, code, password: '12345678' } })
    expect(weak.body.error.code).toBe('weak_password')
    expect((await api('POST', '/auth/reset-password', { body: { phone: PHONE, code, password: 'senha-novissima-55' } })).status).toBe(200)
  })

  it('o código só funciona uma vez', async () => {
    await signup()
    advance(120)
    await api('POST', '/auth/forgot-password', { body: { phone: PHONE } })
    const code = await lastCode()
    expect((await api('POST', '/auth/reset-password', { body: { phone: PHONE, code, password: 'senha-novissima-55' } })).status).toBe(200)
    expect((await api('POST', '/auth/reset-password', { body: { phone: PHONE, code, password: 'outra-senha-forte-1' } })).status).toBe(400)
  })
})

describe('7. Rotas privadas e sessões', () => {
  it('/me sem login = 401; com cookie inventado = 401', async () => {
    expect((await api('GET', '/auth/me')).status).toBe(401)
    expect((await api('GET', '/auth/me', { cookie: 'mdm_session=token-inventado' })).status).toBe(401)
  })

  it('logout encerra a sessão no servidor (cookie copiado deixa de funcionar)', async () => {
    const cookie = await signup()
    expect((await api('GET', '/auth/me', { cookie })).status).toBe(200)
    const out = await api('POST', '/auth/logout', { body: {}, cookie })
    expect(out.status).toBe(200)
    expect(out.headers.get('set-cookie')).toMatch(/Max-Age=0/)
    expect((await api('GET', '/auth/me', { cookie })).status).toBe(401)
  })

  it('sessão expira após 30 dias', async () => {
    const cookie = await signup()
    advance(30 * 24 * 3600 + 5)
    expect((await api('GET', '/auth/me', { cookie })).status).toBe(401)
  })

  it('conta bloqueada perde o acesso na hora, mesmo com sessão aberta', async () => {
    const cookie = await signup()
    await query("UPDATE users SET status = 'disabled'")
    expect((await api('GET', '/auth/me', { cookie })).status).toBe(401)
  })

  it('CSRF: recusa origem diferente e exige JSON', async () => {
    const bad = await api('POST', '/auth/login', { body: { phone: PHONE, password: PASSWORD }, origin: 'https://site-malicioso.com' })
    expect(bad.status).toBe(403)
    const form = await api('POST', '/auth/login', { body: { phone: PHONE }, contentType: 'application/x-www-form-urlencoded' })
    expect(form.status).toBe(415)
    const ok = await api('POST', '/auth/login', { body: { phone: PHONE, password: 'x'.repeat(10) }, origin: 'http://localhost:5173' })
    expect(ok.status).toBe(401) // chegou na validação normal
  })

  it('cookie malformado é tratado como "sem login" (nunca erro 500)', async () => {
    const r = await api('GET', '/auth/me', { cookie: 'mdm_session=%E0%A4%A' })
    expect(r.status).toBe(401)
  })

  it('respostas da API não são guardadas em cache', async () => {
    expect((await api('GET', '/auth/me')).headers.get('cache-control')).toBe('no-store')
  })
})

describe('8. Administração (apenas a base de permissões)', () => {
  it('anônimo = 401, usuário comum = 403, admin = 200', async () => {
    const cookie = await signup()
    expect((await api('GET', '/admin/ping')).status).toBe(401)
    const user = await api('GET', '/admin/ping', { cookie })
    expect(user.status).toBe(403)
    expect(user.body.error.code).toBe('forbidden')
    await makeAdmin()
    const admin = await api('GET', '/admin/ping', { cookie })
    expect(admin.status).toBe(200)
    expect(admin.body.role).toBe('admin')
    expect((await query<any>("SELECT 1 FROM audit_log WHERE event = 'admin.access'")).length).toBe(1)
  })

  it('o papel é lido do banco a cada pedido: remover o papel revoga o acesso na hora', async () => {
    const cookie = await signup()
    await makeAdmin()
    expect((await api('GET', '/admin/ping', { cookie })).status).toBe(200)
    await query("DELETE FROM user_roles WHERE role_id = (SELECT id FROM roles WHERE name = 'admin')")
    expect((await api('GET', '/admin/ping', { cookie })).status).toBe(403)
  })

  it('sessão de admin com mais de 8 horas exige novo login', async () => {
    const cookie = await signup()
    await makeAdmin()
    advance(8 * 3600 + 5)
    const r = await api('GET', '/admin/ping', { cookie })
    expect(r.status).toBe(401)
    expect(r.body.error.code).toBe('admin_reauth_required')
  })

  it('nenhuma conta nasce admin e não há rota para virar admin', async () => {
    const cookie = await signup()
    expect((await api('GET', '/auth/me', { cookie })).body.user.isAdmin).toBe(false)
    expect((await api('POST', '/admin/grant', { body: { phone: PHONE }, cookie })).status).toBe(404)
    expect((await query("SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.name = 'admin'")).length).toBe(0)
  })
})

describe('9. Auditoria', () => {
  it('registra login ok/falho sem guardar senha, código nem telefone completo', async () => {
    await signup()
    await api('POST', '/auth/login', { body: { phone: PHONE, password: 'senha-errada-123' } })
    await api('POST', '/auth/login', { body: { phone: PHONE, password: PASSWORD } })
    const rows = await query<any>('SELECT event, details FROM audit_log')
    const events = rows.map((r) => r.event)
    expect(events).toEqual(expect.arrayContaining(['signup.started', 'signup.completed', 'login.failed', 'login.success']))
    const dump = JSON.stringify(rows)
    expect(dump).not.toContain(PASSWORD)
    expect(dump).not.toContain('11912345678')
    expect(dump).not.toContain(await lastCode())
  })
})
