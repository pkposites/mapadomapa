// E2E dos pedidos manuais: admin cadastra e publica; profissional compatível vê e demonstra interesse; admin acompanha. Dados só do banco LOCAL.
const { chromium } = require('playwright')
const { execSync } = require('node:child_process')
const B = process.env.BASE_URL ?? 'http://localhost:5173'
const rnd = (n) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, '0')
const res = []
const check = (n, ok, x = '') => { res.push(ok); console.log(`${ok ? '  ✓' : '  ✗'} ${n}${ok ? '' : '  ← ' + x}`) }
const hideDev = () => document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '[data-testid=dev-sms]{display:none!important}'; document.head.appendChild(s) })
async function signup(browser, phone) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await ctx.addInitScript(() => localStorage.setItem('mdm_consent_v1', JSON.stringify({ marketing: false, at: 'x' }))); await ctx.addInitScript(hideDev)
  const page = await ctx.newPage()
  await page.request.post(`${B}/api/dev/reset-limits`, { data: {} })
  await page.goto(B + '/cadastro'); await page.waitForSelector('text=Verificação de segurança concluída', { timeout: 30000 })
  await page.getByLabel('Seu celular').fill(phone); await page.getByLabel('Crie uma senha').fill('pedido-senha-' + rnd(4)); await page.getByLabel(/Li e aceito/).check()
  await page.getByRole('button', { name: 'Criar minha conta' }).click(); await page.waitForURL('**/profissional')
  return { ctx, page }
}
;(async () => {
  const browser = await chromium.launch()
  const adminPhone = `(11) 9${rnd(4)}-${rnd(4)}`, proPhone = `(11) 9${rnd(4)}-${rnd(4)}`
  const admin = await signup(browser, adminPhone); execSync(`npm run admin:grant -- "${adminPhone}"`, { stdio: 'ignore' })
  const pro = await signup(browser, proPhone)
  const errs = []; admin.page.on('pageerror', (e) => errs.push(String(e))); pro.page.on('pageerror', (e) => errs.push(String(e)))
  const h = { 'content-type': 'application/json', origin: B }, pr = pro.page.request, ar = admin.page.request
  await pr.put(`${B}/api/pro/me`, { data: { fullName: 'Paulo Pintor Souza' }, headers: h })
  await pr.put(`${B}/api/pro/professions`, { data: { professions: ['pintores'] }, headers: h }); await pr.put(`${B}/api/pro/regions`, { data: { regions: ['zona-sul'] }, headers: h })
  await pr.put(`${B}/api/pro/work`, { data: { experience: { pintores: { years: 6, level: 'advanced' } }, availability: { weekdays: ['seg'], periods: ['manha'], emergency: false }, ownTools: 'complete', vehicle: 'car', workStructure: 'solo' }, headers: h })
  const st = await (await pr.get(`${B}/api/pro/profile`)).json()
  await pr.put(`${B}/api/pro/answers`, { data: { profession: 'pintores', answers: st.questionnaires.pintores.map((q) => ({ questionId: q.id, choice: q.options[0].id })) }, headers: h })
  await pr.post(`${B}/api/pro/submit`, { data: {}, headers: h })
  const list = await (await ar.get(`${B}/api/admin/professionals?status=pending_review`)).json()
  await ar.post(`${B}/api/admin/professionals/${list.items[0].id}/decision`, { data: { action: 'approve' }, headers: h })

  console.log('\n[1] Sem pedidos: comunicação do lançamento')
  let page = pro.page
  await page.goto(B + '/area/pedidos'); await page.waitForSelector('[data-testid=requests-date]')
  check('profissional aprovado sem pedidos vê 25/11/2026 e "Nenhum pedido ainda"', /25\/11\/2026/.test(await page.locator('main').innerText()) && /Nenhum pedido ainda/.test(await page.locator('main').innerText()))

  console.log('\n[2] Admin cadastra e publica um pedido')
  page = admin.page
  await page.goto(B + '/admin'); await page.locator('[data-testid=link-pedidos]').click(); await page.waitForSelector('[data-testid=new-request]')
  await page.locator('[data-testid=new-request]').click(); await page.waitForSelector('[data-testid=request-form]')
  check('publicar fica bloqueado sem autorização do cliente', await page.locator('[data-testid=publish]').isDisabled())
  await page.locator('#cn').fill('Dona Cliente Reservada'); await page.getByLabel('Telefone / WhatsApp do cliente').fill('(11) 98877-6655')
  await page.locator('#pf').selectOption('pintores'); await page.locator('#rg').selectOption('zona-sul'); await page.locator('#nb').fill('Vila Mariana')
  await page.locator('#tt').fill('Pintar sala e quarto'); await page.locator('#ds').fill('Apartamento de 60 m², paredes em bom estado, duas demãos de tinta.')
  await page.getByLabel('Nesta semana').check()
  await page.locator('#ds').fill('Ligue 11 98877-6655 para combinar'); await page.locator('[data-testid=consent]').check(); await page.locator('[data-testid=save-draft]').click()
  await page.waitForSelector('[role=alert]'); check('texto público com telefone é recusado', /Não coloque telefone/.test(await page.locator('[role=alert]').first().innerText()))
  await page.locator('#ds').fill('Apartamento de 60 m², paredes em bom estado, duas demãos de tinta.')
  await page.locator('[data-testid=publish]').click(); await page.waitForSelector('[data-testid=request-public]')
  check('pedido publicado (Aberto) e "1 profissional compatível"', /Aberto/.test(await page.locator('main').innerText()) && /^[1-9]\d* profissional/.test(await page.locator('[data-testid=eligible]').innerText()))
  check('dados do cliente visíveis só no painel', /Dona Cliente Reservada/.test(await page.locator('[data-testid=request-client]').innerText()) && /98877-6655/.test(await page.locator('[data-testid=request-client]').innerText()))

  console.log('\n[3] Profissional compatível vê e demonstra interesse')
  page = pro.page
  await page.goto(B + '/area/pedidos'); await page.waitForSelector('[data-testid=opportunity]')
  const o = await page.locator('[data-testid=opportunities]').innerText()
  check('mostra tipo, região/bairro, descrição, urgência, data e botão', /Pintores/.test(o) && /Vila Mariana · Zona Sul/.test(o) && /duas demãos/.test(o) && /Nesta semana/.test(o) && /Publicado em/.test(o) && (await page.locator('[data-testid=interest]').count()) === 1)
  check('NÃO mostra nome nem telefone do cliente', !/Dona Cliente|Reservada|98877|6655/.test(await page.locator('body').innerText()))
  await page.locator('[data-testid=interest]').click(); await page.waitForSelector('[data-testid=interested]')
  check('após o clique vira "Interesse enviado" (sem botão para repetir)', (await page.locator('[data-testid=interest]').count()) === 0)
  await page.reload(); await page.waitForSelector('[data-testid=opportunity]')
  check('interesse persiste ao recarregar', (await page.locator('[data-testid=interested]').count()) === 1)

  console.log('\n[4] Admin acompanha')
  page = admin.page
  await page.reload(); await page.waitForSelector('[data-testid=interested-row]', { timeout: 15000 })
  const ir = await page.locator('[data-testid=interested]').innerText()
  check('interessado listado com nome e contato', /Paulo Pintor Souza/.test(ir) && /\(11\) 9\d{4}-\d{4}/.test(ir) && (await page.getByRole('link', { name: /WhatsApp/ }).count()) >= 1)
  page.once('dialog', (d) => d.accept()); await page.locator('[data-testid=close]').click(); await page.waitForSelector('text=Encerrado', { timeout: 15000 })
  page = pro.page; await page.goto(B + '/area/pedidos'); await page.waitForSelector('[data-testid=requests-date]')
  check('encerrado: some do app do profissional e volta a comunicação do lançamento', (await page.locator('[data-testid=opportunity]').count()) === 0 && /25\/11\/2026/.test(await page.locator('main').innerText()))
  check('sem rolagem horizontal e sem erros de JS', (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0 && errs.length === 0, errs.join(' | '))
  await browser.close()
  const ok = res.filter(Boolean).length; console.log(`\n${ok}/${res.length} verificações`); process.exit(ok === res.length ? 0 : 1)
})()
