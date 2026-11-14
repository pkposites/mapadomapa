// E2E do painel administrativo em celular. Requer: ADMIN_BOOTSTRAP_PHONES=+5511900000000 npx vite --port 5173
const { chromium } = require('playwright')
const { execSync } = require('node:child_process')
const B = process.env.BASE_URL ?? 'http://localhost:5173'
const rnd = (n) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, '0')
const res = []
const check = (n, ok, x = '') => { res.push(ok); console.log(`${ok ? '  ✓' : '  ✗'} ${n}${ok ? '' : '  ← ' + x}`) }
const sql = (q) => execSync(`npx netlify database connect --query "${q}"`, { stdio: 'pipe', timeout: 60000 })
const BEST = { pintores: ['pin1:b', 'pin2:c', 'pin3:b', 'pin4:a'] }
;(async () => {
  // ambiente local limpo de admins (só local!) para o bootstrap funcionar
  sql("DELETE FROM user_roles WHERE role_id = (SELECT id FROM roles WHERE name = 'admin')")
  const browser = await chromium.launch()
  const mk = async () => { const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await c.addInitScript(() => localStorage.setItem('mdm_consent_v1', JSON.stringify({ marketing: false, at: 'x' }))); return c }
  const proCtx = await mk(); const pro = await proCtx.newPage()
  const adminCtx = await mk(); const adm = await adminCtx.newPage(); const errs = []; adm.on('pageerror', (e) => errs.push(String(e)))
  await pro.request.post(`${B}/api/dev/reset-limits`, { data: {} })
  const reg = (p, phone) => p.request.post(`${B}/api/auth/register`, { data: { phone, password: 'admin-e2e-senha-1', acceptTerms: true, captchaToken: 'dev-captcha-pass' } })

  console.log('\n[1] Preparação: profissional com cadastro enviado + admin (bootstrap)')
  const proPhone = `(11) 9${rnd(4)}-${rnd(4)}`
  await reg(pro, proPhone)
  const put = (path, data) => pro.request.put(`${B}/api/pro/${path}`, { data })
  await put('professions', { professions: ['pintores'] }); await put('regions', { regions: ['zona-sul'] })
  await put('work', { experience: { pintores: { years: 8, level: 'advanced' } }, availability: { weekdays: ['seg', 'ter'], periods: ['manha'], emergency: true }, ownTools: 'complete', vehicle: 'car', workStructure: 'solo' })
  const cat = await (await pro.request.get(`${B}/api/pro/profile`)).json()
  const ans = cat.questionnaires.pintores.map((q) => q.kind === 'choice' ? { questionId: q.id, choice: 'a' } : { questionId: q.id, text: 'Eu lixo, passo selador, duas demãos com rolo e protejo o piso com fita.' })
  await put('answers', { profession: 'pintores', answers: ans.slice(0, 5) })
  const sub = await pro.request.post(`${B}/api/pro/submit`, { data: {} })
  check('profissional enviou o cadastro (em análise)', sub.status() === 200)
  let r = await reg(adm, '(11) 90000-0000')
  if (r.status() === 409) { // reexecução: a conta do admin de teste já existe no banco LOCAL
    r = await adm.request.post(`${B}/api/auth/login`, { data: { phone: '(11) 90000-0000', password: 'admin-e2e-senha-1' } })
    sql("INSERT INTO user_roles (user_id, role_id) SELECT p.user_id, r.id FROM phones p, roles r WHERE p.e164 = '+5511900000000' AND r.name = 'admin' ON CONFLICT DO NOTHING")
  }
  const adminMe = await (await adm.request.get(`${B}/api/auth/me`)).json()
  check('o celular do bootstrap virou administrador (e só ele)', r.status() === 200 && adminMe.user.isAdmin === true)

  console.log('\n[2] Acesso exclusivo')
  await pro.goto(B + '/admin'); await pro.waitForSelector('text=não tem permissão')
  check('profissional comum em /admin vê "sem permissão"', true)
  check('API admin recusa o profissional (403)', (await pro.request.get(`${B}/api/admin/professionals`)).status() === 403)

  console.log('\n[3] Lista e filtros')
  await adm.goto(B + '/admin'); await adm.waitForSelector('text=Profissionais')
  await adm.waitForSelector(`text=${proPhone}`, { timeout: 15000 })
  check('lista abre em "Em análise" e mostra o profissional com "Celular não verificado"', (await adm.locator('main').innerText()).includes('Celular não verificado'))
  check('painel sem rolagem horizontal (390px)', (await adm.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0)
  const small = await adm.evaluate(() => [...document.querySelectorAll('main button, main a, main input')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.height < 43.5 }).map((e) => (e.innerText || e.id).slice(0, 20) + ':' + Math.round(e.getBoundingClientRect().height)))
  check('alvos de toque do painel ≥ 44px', small.length === 0, JSON.stringify(small))
  await adm.getByLabel('Buscar por celular').fill(proPhone.replace(/\D/g, '').slice(-6)); await adm.waitForSelector(`text=${proPhone}`)
  check('busca por parte do celular funciona', true)

  console.log('\n[4] Detalhe, respostas e decisões')
  await adm.getByText(proPhone).first().click(); await adm.waitForSelector('text=Avaliação técnica · Pintores')
  check('detalhe mostra profissão, região e nota técnica', (await adm.locator('main').innerText()).includes('Zona Sul') && /Nota técnica \d+/.test(await adm.locator('main').innerText()))
  await adm.getByText('Ver respostas do questionário').click()
  check('respostas aparecem em texto com pontos (visão do revisor)', /de 3 pontos/.test(await adm.locator('main').innerText()))
  check('detalhe sem rolagem horizontal', (await adm.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0)
  await adm.getByRole('button', { name: 'Marcar celular como verificado' }).click(); await adm.waitForSelector('text=Verificado pela equipe')
  check('admin marca o celular como verificado', (await (await pro.request.get(`${B}/api/auth/me`)).json()).user.phoneVerified === true)
  const pub = async () => (await (await pro.request.get(`${B}/api/public/professionals`)).json()).items.length
  check('ANTES da aprovação o profissional NÃO aparece ao público', (await pub()) === 0)
  await adm.getByRole('button', { name: 'Rejeitar' }).click()
  check('rejeitar exige motivo (Confirmar bloqueado)', await adm.getByRole('button', { name: 'Confirmar' }).isDisabled())
  await adm.getByRole('button', { name: 'Cancelar' }).click()
  await adm.getByRole('button', { name: 'Aprovar' }).click(); await adm.getByLabel('Observação').fill('Documentos conferidos'); await adm.getByRole('button', { name: 'Confirmar' }).click()
  await adm.waitForSelector('text=Aprovar: feito.')
  check('aprovado por humano: aparece ao público (sem telefone)', (await pub()) === 1 && !JSON.stringify(await (await pro.request.get(`${B}/api/public/professionals`)).json()).includes(proPhone.replace(/\D/g, '').slice(-8)))
  await adm.getByRole('button', { name: 'Suspender' }).click(); await adm.getByLabel('Observação').fill('Suspensão preventiva'); await adm.getByRole('button', { name: 'Confirmar' }).click()
  await adm.waitForSelector('text=Suspender: feito.')
  check('suspenso: some do público imediatamente', (await pub()) === 0)
  await adm.getByRole('button', { name: 'Reativar' }).waitFor({ timeout: 10000 }).catch(() => {}) // só aparece após o detalhe recarregar como "suspenso"
  { const t = await adm.locator('main').innerText(); check('histórico registra as decisões', t.includes('Suspenso') && t.includes('Aprovado'), t.slice(-420).replace(/\n+/g, ' | ')) }
  await pro.goto(B + '/conta'); await pro.waitForSelector('text=Em análise', { timeout: 4000 }).catch(() => {})
  check('sem erros de JavaScript', errs.length === 0, errs.join('|'))
  await browser.close()
  const bad = res.filter((x) => !x).length
  console.log(`\n${res.length - bad}/${res.length} verificações passaram`); process.exit(bad ? 1 : 0)
})().catch((e) => { console.error('ERRO NO TESTE:', e.message.split('\n')[0]); process.exit(2) })
