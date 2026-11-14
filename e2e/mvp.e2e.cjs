// E2E do cadastro MVP (sem SMS, celular não verificado, sem recuperação de senha, anti-robô próprio).
// Requer o servidor local com: CAPTCHA_PROVIDER=pow npx vite --port 5173
const { chromium } = require('playwright')
const B = process.env.BASE_URL ?? 'http://localhost:5173'
const rnd = (n) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, '0')
const res = []
const check = (n, ok, x = '') => { res.push(ok); console.log(`${ok ? '  ✓' : '  ✗'} ${n}${ok ? '' : '  ← ' + x}`) }
;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await ctx.addInitScript(() => localStorage.setItem('mdm_consent_v1', JSON.stringify({ marketing: false, at: 'x' })))
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e)))
  await page.request.post(`${B}/api/dev/reset-limits`, { data: {} })
  const phone = `(11) 9${rnd(4)}-${rnd(4)}`, d = phone.replace(/\D/g, ''), pass = 'mvp-senha-' + rnd(4)

  console.log('\n[1] Cadastro de um passo')
  await page.goto(B + '/cadastro'); await page.waitForSelector('text=Crie sua conta')
  const t0 = Date.now()
  await page.waitForSelector('text=Verificação de segurança concluída', { timeout: 30000 })
  check(`anti-robô (prova de trabalho) resolvido sozinho em ${Date.now() - t0} ms, sem caixa para marcar`, (await page.getByLabel(/Não sou um robô/).count()) === 0)
  check('texto não menciona SMS/código', !/SMS|código/i.test(await page.locator('main').innerText()))
  check('campo-isca existe, mas fora da tela (invisível a pessoas)', await page.evaluate(() => { const i = document.querySelector('input[name=contato_extra]'); const b = i.getBoundingClientRect(); return !!i && b.right <= 0 }))
  await page.getByLabel('Seu celular').fill(phone); await page.getByLabel('Crie uma senha').fill(pass); await page.getByLabel(/Li e aceito/).check()
  check('cadastro sem rolagem horizontal', (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0)
  await page.getByRole('button', { name: 'Criar minha conta' }).click()
  await page.waitForURL('**/profissional'); await page.waitForSelector('text=Qual é a sua profissão?')
  check('conta criada na hora e direto no cadastro profissional (sem etapa de código)', true)
  const sms = (await (await page.request.get(`${B}/api/dev/sms`)).json()).messages.filter((m) => m.phone.endsWith(d))
  check('NENHum SMS foi gerado', sms.length === 0, String(sms.length))

  console.log('\n[2] Celular não verificado e conta')
  await page.goto(B + '/conta'); await page.waitForSelector('text=Celular ainda não verificado')
  check('Minha conta mostra "Celular ainda não verificado"', true)
  const me = await (await page.request.get(`${B}/api/auth/me`)).json()
  check('API: phoneVerified = false, sem papel de admin', me.user.phoneVerified === false && me.user.isAdmin === false)

  console.log('\n[3] Login e ausência de recuperação de senha')
  await page.getByRole('button', { name: 'Sair da conta' }).click(); await page.waitForURL(B + '/')
  await page.goto(B + '/entrar'); await page.waitForSelector('text=Entrar na sua conta')
  check('"Esqueci minha senha" não aparece', (await page.getByText(/esqueci/i).count()) === 0)
  await page.goto(B + '/recuperar-senha'); await page.waitForTimeout(600)
  check('/recuperar-senha não existe mais (volta ao início)', new URL(page.url()).pathname === '/')
  const api404 = await page.request.post(`${B}/api/auth/forgot-password`, { data: { phone } })
  check('API de recuperação desligada (404 feature_disabled)', api404.status() === 404 && (await api404.json()).error.code === 'feature_disabled')
  await page.goto(B + '/entrar'); await page.getByLabel('Seu celular').fill(phone); await page.getByLabel('Senha', { exact: true }).fill(pass)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click(); await page.waitForURL('**/conta')
  check('login funciona com celular não verificado', true)

  console.log('\n[4] Proteções mantidas')
  const dup = await page.request.post(`${B}/api/auth/register`, { data: { phone, password: pass, acceptTerms: true, captchaToken: 'qualquer' } })
  check('cadastro sem desafio válido é recusado', dup.status() === 400 && ['captcha_failed', 'captcha_required'].includes((await dup.json()).error.code))
  const hp = await page.request.post(`${B}/api/auth/register`, { data: { phone: '(21) 98765-4321', password: pass, acceptTerms: true, contato_extra: 'x', captchaToken: 'y' } })
  check('robô que preenche o campo-isca é recusado', hp.status() === 400)
  check('sem erros de JavaScript', errs.length === 0, errs.join('|'))
  await browser.close()
  const bad = res.filter((x) => !x).length
  console.log(`\n${res.length - bad}/${res.length} verificações passaram`); process.exit(bad ? 1 : 0)
})().catch((e) => { console.error('ERRO NO TESTE:', e.message.split('\n')[0]); process.exit(2) })
