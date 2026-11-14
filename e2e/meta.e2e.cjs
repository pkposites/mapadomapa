// E2E do rastreamento Meta (SIMULADO): consentimento, GPC/DNT, deduplicação e zero tráfego para a Meta.
// Uso: node e2e/meta.e2e.cjs   (requer `npm run dev` rodando)
const { chromium } = require('playwright')
const B = process.env.BASE_URL ?? 'http://localhost:5173'
const results = []
const check = (n, ok, extra = '') => { results.push(ok); console.log(`${ok ? '  ✓' : '  ✗'} ${n}${ok ? '' : '  ← ' + extra}`) }
const rnd = (n) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, '0')
const digits = (p) => p.replace(/\D/g, '')

async function newCtx(browser, { signal } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, extraHTTPHeaders: signal ? { 'Sec-GPC': '1' } : undefined })
  const metaRequests = []
  ctx.on('request', (r) => { if (/facebook\.(com|net)|fbcdn/.test(r.url())) metaRequests.push(r.url()) })
  if (signal) await ctx.addInitScript(() => Object.defineProperty(navigator, 'globalPrivacyControl', { value: true }))
  return { ctx, metaRequests }
}
const browserEvents = (page) => page.evaluate(() => (window.__metaEvents ?? []).filter((e) => e.type === 'track'))
const serverEvents = async (page) => (await (await page.request.get(`${B}/api/dev/tracking`)).json()).events
const smsCode = async (page, d) => { for (let i = 0; i < 20; i++) { const { messages } = await (await page.request.get(`${B}/api/dev/sms`)).json(); const m = messages.find((x) => x.phone.endsWith(d)); if (m) return m.body.match(/\b(\d{6})\b/)[1]; await page.waitForTimeout(250) } throw new Error('sem SMS') }
async function signup(page, phone) {
  await page.goto(B + '/cadastro'); await page.waitForSelector('text=Crie sua conta')
  await page.getByLabel('Seu celular').fill(phone); await page.getByLabel('Crie uma senha').fill('meta-senha-' + rnd(4))
  await page.getByLabel(/Li e aceito/).check(); await page.getByLabel(/Não sou um robô/).check()
  await page.getByRole('button', { name: 'Continuar' }).click(); await page.waitForSelector('text=Confirme seu celular')
  await page.getByLabel('Código do SMS').fill(await smsCode(page, digits(phone)))
  await page.getByRole('button', { name: 'Confirmar celular' }).click(); await page.waitForURL('**/conta')
}

;(async () => {
  const browser = await chromium.launch()
  const reset = async (p) => p.request.post(`${B}/api/dev/reset-limits`, { data: {} })

  console.log('\n[A] Antes de escolher: nada é rastreado')
  {
    const { ctx, metaRequests } = await newCtx(browser); const page = await ctx.newPage(); await reset(page)
    await page.goto(B + '/'); await page.waitForSelector('[role=dialog]')
    check('o aviso de privacidade aparece', true)
    const btns = await page.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].map((b) => ({ t: b.textContent.trim(), h: Math.round(b.getBoundingClientRect().height), w: Math.round(b.getBoundingClientRect().width) })))
    check('"Recusar" e "Aceitar" têm o mesmo tamanho e ≥ 52px de altura', btns.length === 2 && btns[0].h === btns[1].h && btns[0].w === btns[1].w && btns[0].h >= 52, JSON.stringify(btns))
    await page.waitForTimeout(500)
    check('sem escolha: nenhum evento no navegador', (await browserEvents(page)).length === 0)
    check('sem escolha: nenhuma requisição para facebook.com/net', metaRequests.length === 0, metaRequests.join(','))
    await ctx.close()
  }

  console.log('\n[B] Recusar')
  {
    const { ctx, metaRequests } = await newCtx(browser); const page = await ctx.newPage(); await reset(page)
    await page.goto(B + '/'); await page.getByRole('button', { name: 'Recusar' }).click()
    check('o aviso some depois de escolher', (await page.locator('[role=dialog]').count()) === 0)
    await page.goto(B + '/cadastro'); await page.waitForTimeout(400)
    const before = (await serverEvents(page)).length
    await signup(page, `(11) 9${rnd(4)}-${rnd(4)}`)
    check('recusado: nenhum PageView nem CompleteRegistration no navegador', (await browserEvents(page)).length === 0)
    check('recusado: o servidor NÃO registrou evento (cadastro funcionou)', (await serverEvents(page)).length === before)
    check('recusado: nenhuma requisição para a Meta', metaRequests.length === 0)
    await page.reload(); await page.waitForTimeout(300)
    check('a escolha persiste ao recarregar (aviso não volta)', (await page.locator('[role=dialog]').count()) === 0)
    await ctx.close()
  }

  console.log('\n[C] Aceitar + deduplicação navegador × servidor')
  {
    const { ctx, metaRequests } = await newCtx(browser); const page = await ctx.newPage(); await reset(page)
    await page.goto(B + '/'); await page.getByRole('button', { name: 'Aceitar' }).click(); await page.waitForTimeout(400)
    const pv = (await browserEvents(page)).filter((e) => e.name === 'PageView')
    check('aceito: PageView disparado no navegador (simulado)', pv.length >= 1)
    await signup(page, `(11) 9${rnd(4)}-${rnd(4)}`)
    await page.waitForTimeout(600)
    const be = (await browserEvents(page)).filter((e) => e.name === 'CompleteRegistration')
    const se = (await serverEvents(page)).filter((e) => e.event_name === 'CompleteRegistration')
    check('o navegador disparou CompleteRegistration com eventID', be.length === 1 && Boolean(be[0].eventID), JSON.stringify(be))
    check('o servidor registrou CompleteRegistration (modo simulado)', se.length >= 1 && se[0].mode === 'sim' && se[0].status === 'simulated')
    check('DEDUPLICAÇÃO: mesmo event_name e mesmo event_id nos dois lados', be.length === 1 && se.length >= 1 && se[0].event_id === be[0].eventID && se[0].event_name === be[0].name, `${be[0]?.eventID} x ${se[0]?.event_id}`)
    const payload = JSON.stringify(se[0].payload)
    check('o servidor só guardou telefone em hash (sem número, IP ou user agent)', !/\b9\d{8}\b/.test(payload) && !payload.includes('client_ip_address') && !payload.includes('client_user_agent'))
    check('modo simulado: NENHUMA requisição real para a Meta', metaRequests.length === 0, metaRequests.join(','))
    await page.getByRole('button', { name: 'Sair da conta' }).click()
    await ctx.close()
  }

  console.log('\n[D] Mudar de ideia depois (preferências no rodapé)')
  {
    const { ctx } = await newCtx(browser); const page = await ctx.newPage(); await reset(page)
    await page.goto(B + '/'); await page.getByRole('button', { name: 'Aceitar' }).click(); await page.waitForTimeout(300)
    await page.getByRole('button', { name: 'Preferências de privacidade' }).click()
    await page.waitForSelector('[role=dialog]')
    check('o rodapé reabre o aviso mostrando a escolha atual', (await page.locator('[role=dialog]').innerText()).includes('permitido'))
    await page.getByRole('button', { name: 'Recusar' }).click(); await page.waitForTimeout(300)
    check('o Pixel recebeu "consent revoke" ao recusar', await page.evaluate(() => (window.__metaEvents ?? []).some((e) => e.type === 'consent' && e.name === 'revoke')))
    const n = (await browserEvents(page)).length
    await page.goto(B + '/entrar'); await page.waitForTimeout(400)
    check('depois de recusar, novas telas não geram eventos', (await browserEvents(page)).length <= n)
    await ctx.close()
  }

  console.log('\n[E] Sinal de privacidade do navegador (Global Privacy Control)')
  {
    const { ctx, metaRequests } = await newCtx(browser, { signal: true }); const page = await ctx.newPage(); await reset(page)
    await page.goto(B + '/'); await page.waitForTimeout(500)
    check('com GPC o aviso nem aparece (recusa automática)', (await page.locator('[role=dialog]').count()) === 0)
    const before = (await serverEvents(page)).length
    await signup(page, `(11) 9${rnd(4)}-${rnd(4)}`)
    check('com GPC: nenhum evento no navegador', (await browserEvents(page)).length === 0)
    check('com GPC: o servidor não registrou evento (mesmo se o cliente pedisse)', (await serverEvents(page)).length === before)
    check('com GPC: nenhuma requisição para a Meta', metaRequests.length === 0)
    await ctx.close()
  }

  await browser.close()
  const bad = results.filter((x) => !x).length
  console.log(`\n${results.length - bad}/${results.length} verificações passaram`)
  process.exit(bad ? 1 : 0)
})().catch((e) => { console.error('ERRO NO TESTE:', e.message); process.exit(2) })
