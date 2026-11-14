// E2E do cadastro profissional (Etapa 3) em tela de celular. Requer `npm run dev` ligado.
const { chromium } = require('playwright')
const B = process.env.BASE_URL ?? 'http://localhost:5173'
const rnd = (n) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, '0')
const res = []
const check = (n, ok, x = '') => { res.push(ok); console.log(`${ok ? '  ✓' : '  ✗'} ${n}${ok ? '' : '  ← ' + x}`) }
const smsCode = async (page, d) => { for (let i = 0; i < 20; i++) { const { messages } = await (await page.request.get(`${B}/api/dev/sms`)).json(); const m = messages.find((x) => x.phone.endsWith(d)); if (m) return m.body.match(/\b(\d{6})\b/)[1]; await page.waitForTimeout(250) } throw new Error('sem SMS') }
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
const smallTargets = (page) => page.evaluate(() => [...document.querySelectorAll('main button, main input, main textarea')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.height < 43.5 && !e.closest('[data-testid=dev-sms]') }).map((e) => (e.innerText || e.getAttribute('aria-label') || e.id || e.tagName).slice(0, 20) + ':' + Math.round(e.getBoundingClientRect().height)))

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await ctx.addInitScript(() => localStorage.setItem('mdm_consent_v1', JSON.stringify({ marketing: false, at: 'x' })))
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e)))
  await page.request.post(`${B}/api/dev/reset-limits`, { data: {} })

  // conta fictícia criada pela API (cadastro de contas já foi testado na Etapa 2)
  const phone = `(11) 9${rnd(4)}-${rnd(4)}`, d = phone.replace(/\D/g, '')
  await page.request.post(`${B}/api/auth/register`, { data: { phone, password: 'homolog-senha-123', acceptTerms: true, captchaToken: 'dev-captcha-pass' } })
  await page.request.post(`${B}/api/auth/verify-phone`, { data: { phone, code: await smsCode(page, d) } })

  console.log('\n[1] Entrada e limites')
  await page.goto(B + '/conta'); await page.getByRole('link', { name: 'Começar cadastro profissional' }).click(); await page.waitForURL('**/profissional')
  await page.waitForSelector('text=Qual é a sua profissão?')
  check('conta mostra o botão e abre o passo 1', true)
  for (const n of ['Pintores', 'Eletricistas']) await page.getByRole('checkbox', { name: n }).click()
  check('contador mostra "2 de 2"', (await page.locator('main').innerText()).includes('2 de 2'))
  check('a 3ª profissão fica bloqueada na tela', await page.getByRole('checkbox', { name: 'Guincho' }).isDisabled())
  check('passo 1 sem rolagem horizontal e alvos ≥ 44px', (await overflow(page)) <= 0 && (await smallTargets(page)).length === 0, JSON.stringify(await smallTargets(page)))
  await page.getByRole('button', { name: 'Continuar', exact: true }).click(); await page.waitForSelector('text=Onde você atende?')

  await page.getByRole('checkbox', { name: 'Zona Sul' }).click(); await page.getByRole('checkbox', { name: 'Centro' }).click()
  check('a 3ª região fica bloqueada', await page.getByRole('checkbox', { name: 'Zona Norte' }).isDisabled())
  await page.getByRole('button', { name: 'Continuar', exact: true }).click(); await page.waitForSelector('text=Conte sobre o seu trabalho')

  console.log('\n[2] Experiência, disponibilidade, ferramentas, veículo, estrutura')
  check('"Continuar" começa bloqueado (faltam dados)', await page.getByRole('button', { name: 'Continuar', exact: true }).isDisabled())
  for (const y of await page.locator('input[type=number]').all()) await y.fill('6')
  for (const r of await page.getByRole('radio', { name: /^Avançado/ }).all()) await r.click()
  for (const n of ['Seg', 'Ter']) await page.getByRole('button', { name: n, exact: true }).click()
  await page.getByRole('button', { name: 'Manhã' }).click(); await page.getByRole('checkbox', { name: /urgência/ }).click()
  await page.getByRole('radio', { name: 'Kit completo próprio' }).click(); await page.getByRole('radio', { name: 'Carro' }).click(); await page.getByRole('radio', { name: 'Trabalho sozinho' }).click()
  check('passo 3 sem rolagem horizontal e alvos ≥ 44px', (await overflow(page)) <= 0 && (await smallTargets(page)).length === 0, JSON.stringify(await smallTargets(page)))
  await page.getByRole('button', { name: 'Continuar', exact: true }).click(); await page.waitForSelector('text=Pergunta 1 de 10')

  console.log('\n[3] Questionário técnico e continuidade')
  await page.getByRole('radio').first().click(); await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Próxima' }).click(); await page.waitForSelector('text=Pergunta 2 de 10')
  await page.reload(); await page.waitForSelector('text=Pergunta 2 de 10')
  check('ao recarregar, continua exatamente de onde parou (pergunta 2)', true)
  const st = await (await page.request.get(`${B}/api/pro/profile`)).json()
  check('o servidor guardou a resposta da pergunta 1', Object.keys(st.answers.pintores ?? st.answers.eletricistas ?? {}).length === 1)
  check('a página de perguntas não mostra pontos nem a "resposta certa"', !/pontos|correta|gabarito/i.test(await page.locator('main').innerText()))
  for (let i = 2; i <= 10; i++) {
    await page.waitForSelector(`text=Pergunta ${i} de 10`)
    if (await page.getByRole('textbox').count()) await page.getByRole('textbox').fill('Primeiro verifico a origem do problema, faço o teste, explico o orçamento e garanto a segurança.')
    else await page.getByRole('radio').first().click()
    if (i === 2) check('perguntas objetivas: 1 por tela, sem rolagem horizontal', (await overflow(page)) <= 0)
    await page.getByRole('button', { name: i === 10 ? 'Revisar' : 'Próxima' }).click()
  }

  console.log('\n[4] Revisão e envio')
  await page.waitForSelector('text=Confira e envie')
  check('a revisão avisa que a aprovação não é automática', (await page.locator('main').innerText()).includes('Nenhuma aprovação é automática'))
  await page.getByRole('button', { name: 'Enviar para análise' }).click(); await page.waitForSelector('text=Cadastro enviado!')
  const fin = await (await page.request.get(`${B}/api/pro/profile`)).json()
  check('status = em análise (nunca aprovado pela IA)', fin.profile.reviewStatus === 'pending_review')
  check('depois de enviado, a edição é recusada (409)', (await page.request.put(`${B}/api/pro/regions`, { data: { regions: ['centro'] } })).status() === 409)
  await page.goto(B + '/conta'); await page.waitForSelector('text=Em análise', { timeout: 8000 }).catch(() => {}); check('a conta passa a mostrar "Em análise"', (await page.locator('main').innerText()).includes('Em análise'))

  console.log('\n[5] Tela estreita (320px)')
  await page.setViewportSize({ width: 320, height: 700 })
  for (const p of ['/conta', '/profissional']) { await page.goto(B + p); await page.waitForTimeout(500); check(`320px ${p}: sem rolagem horizontal`, (await overflow(page)) <= 0, `+${await overflow(page)}`) }
  check('sem erros de JavaScript', errs.length === 0, errs.join('|'))
  await browser.close()
  const bad = res.filter((x) => !x).length
  console.log(`\n${res.length - bad}/${res.length} verificações passaram`); process.exit(bad ? 1 : 0)
})().catch((e) => { console.error('ERRO NO TESTE:', e.message.split('\n')[0]); process.exit(2) })
