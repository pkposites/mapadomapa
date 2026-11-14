// Ajustes de usabilidade: banner de cookies, 404 do app, passos do cadastro, erros de formulário, Pedidos, instalar app, mobile.
// Requer: VITE_META_PIXEL_ID=1234567890 CAPTCHA_PROVIDER=pow npx vite --port 5173
const { chromium } = require('playwright')
const B = process.env.BASE_URL ?? 'http://localhost:5173'
// Banner de cookies: testado no build de produção (o servidor de desenvolvimento não funciona com o armazenamento bloqueado)
const P = process.env.PREVIEW_URL ?? 'http://localhost:4173'
const rnd = (n) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, '0')
const res = []
const check = (n, ok, x = '') => { res.push(ok); console.log(`${ok ? '  ✓' : '  ✗'} ${n}${ok ? '' : '  ← ' + x}`) }
const hideDev = () => document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '[data-testid=dev-sms]{display:none!important}'; document.head.appendChild(s) })
;(async () => {
  const browser = await chromium.launch()

  console.log('\n[1] Banner de cookies')
  // 1a) armazenamento bloqueado (aba privada / automação): Recusar precisa fechar na hora e não disparar a Meta
  let ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await ctx.addInitScript(() => { const boom = () => { throw new DOMException('bloqueado', 'SecurityError') }; Storage.prototype.getItem = boom; Storage.prototype.setItem = boom; Storage.prototype.removeItem = boom })
  await ctx.addInitScript(hideDev)
  let page = await ctx.newPage(); const meta = []
  page.on('request', (r) => { if (/facebook\.(com|net)|fbcdn/.test(r.url())) meta.push(r.url()) })
  await page.goto(P + '/cadastro'); await page.waitForSelector('[role=dialog]')
  await page.getByRole('button', { name: 'Recusar' }).click(); await page.waitForTimeout(300)
  check('Recusar fecha o banner na hora (mesmo sem armazenamento)', (await page.locator('[role=dialog]').count()) === 0)
  await page.goto(P + '/', { waitUntil: 'load' }).catch(() => {}); await page.waitForTimeout(500)
  await page.getByRole('link', { name: /Quero me cadastrar/ }).first().click(); await page.waitForTimeout(400)
  check('não reaparece ao navegar entre rotas', (await page.locator('[role=dialog]').count()) === 0)
  await page.waitForTimeout(800)
  check('Recusar: nenhuma requisição à Meta', meta.length === 0, meta.join(','))
  await ctx.close()
  // 1b) normal: Aceitar fecha e persiste
  ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); await ctx.addInitScript(hideDev)
  page = await ctx.newPage(); await page.goto(P + '/entrar'); await page.waitForSelector('[role=dialog]')
  await page.getByRole('button', { name: 'Aceitar' }).click(); await page.waitForTimeout(300)
  check('Aceitar fecha o banner', (await page.locator('[role=dialog]').count()) === 0)
  await page.reload(); await page.waitForTimeout(600)
  check('escolha salva (não reaparece após recarregar)', (await page.locator('[role=dialog]').count()) === 0)
  await ctx.close()

  console.log('\n[2] Cadastro: passos e erros de formulário')
  ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await ctx.addInitScript(() => localStorage.setItem('mdm_consent_v1', JSON.stringify({ marketing: false, at: 'x' }))); await ctx.addInitScript(hideDev)
  page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e)))
  await page.request.post(`${B}/api/dev/reset-limits`, { data: {} })
  await page.goto(B + '/'); await page.waitForTimeout(800)
  const t0 = Date.now(); await page.getByRole('link', { name: /Quero me cadastrar/ }).first().click()
  await page.waitForSelector('[data-testid=signup-steps]', { timeout: 5000 }); const dt = Date.now() - t0
  check(`/cadastro abre sem tela de "Carregando" (${dt} ms)`, (await page.getByRole('status', { name: 'Carregando' }).count()) === 0)
  check('mostra "Passo 1 de 4" e o que vem depois', /passo 1 de 4/i.test(await page.locator('[data-testid=signup-steps]').innerText()) && /profissões/.test(await page.locator('[data-testid=signup-steps]').innerText()))
  await page.waitForSelector('text=Verificação de segurança concluída', { timeout: 30000 })
  await page.getByLabel('Seu celular').fill('(11) 9123'); await page.getByLabel('Crie uma senha').fill('abc'); await page.getByRole('button', { name: 'Criar minha conta' }).click(); await page.waitForTimeout(300)
  const near = async (inputSel, textRe) => page.evaluate(([sel, re]) => { const i = document.querySelector(sel); const e = [...document.querySelectorAll('[role=alert]')].find((x) => new RegExp(re).test(x.textContent)); if (!i || !e) return null; const a = i.getBoundingClientRect(), b = e.getBoundingClientRect(); return { gap: Math.round(b.top - a.bottom), visible: b.height > 0 } }, [inputSel, textRe.source])
  const ep = await near('#phone', /Digite o celular com DDD/), es = await near('input[type=password]', /pelo menos 8 caracteres/)
  check('erro do celular aparece logo abaixo do campo', !!ep && ep.visible && ep.gap >= 0 && ep.gap < 40, JSON.stringify(ep))
  check('erro da senha aparece logo abaixo do campo', !!es && es.visible && es.gap >= 0 && es.gap < 60, JSON.stringify(es))
  check('celular NÃO é apagado após erro', (await page.getByLabel('Seu celular').inputValue()).includes('9123'))
  await page.getByLabel('Seu celular').fill('(11) 91234-5678'); await page.getByLabel('Crie uma senha').fill('12345678'); await page.getByLabel(/Li e aceito/).check()
  await page.getByRole('button', { name: 'Criar minha conta' }).click(); await page.waitForSelector('text=fácil de adivinhar', { timeout: 10000 })
  check('erro do servidor (senha fraca): celular preservado', (await page.getByLabel('Seu celular').inputValue()).includes('91234-5678'))

  console.log('\n[3] Área do profissional')
  const phone = `(11) 9${rnd(4)}-${rnd(4)}`
  await page.getByLabel('Seu celular').fill(phone); await page.getByLabel('Crie uma senha').fill('ajuste-senha-' + rnd(4))
  await page.waitForSelector('text=Verificação de segurança concluída', { timeout: 30000 })
  await page.getByRole('button', { name: 'Criar minha conta' }).click(); await page.waitForURL('**/profissional')
  await page.goto(B + '/area'); await page.waitForSelector('[data-testid=greeting]')
  check('Pedidos tem destaque leve (ponto)', (await page.locator('[data-testid=pedidos-dot]').count()) === 1)
  check('botão "Instalar app" visível', (await page.locator('[data-testid=install-btn]').first().isVisible()))
  await page.locator('[data-testid=install-btn]').first().click()
  check('instruções de instalação aparecem', (await page.locator('[data-testid=install-steps]').count()) === 1)
  check('aviso de celular não verificado explica como/quando', /manualmente durante a análise/.test(await page.locator('[data-testid=phone-note]').innerText()))
  await page.getByRole('link', { name: 'Pedidos' }).last().click(); await page.waitForSelector('[data-testid=requests-date]')
  await page.getByRole('link', { name: 'Início' }).first().click(); await page.waitForSelector('[data-testid=greeting]')
  check('destaque some depois de abrir Pedidos', (await page.locator('[data-testid=pedidos-dot]').count()) === 0)
  await page.goto(B + '/area/inexistente'); await page.waitForSelector('[data-testid=not-found]')
  check('rota inexistente no app mostra a página 404 amigável', /Página não encontrada/.test(await page.locator('main').innerText()) && (await page.getByRole('link', { name: 'Quero me cadastrar' }).count()) >= 1)

  console.log('\n[4] Mobile 360 e 390 (nada cortado, alvos ≥ 44 px, banner sem cobrir o CTA)')
  for (const w of [360, 390]) {
    const c2 = await browser.newContext({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true }); await c2.addInitScript(hideDev)
    const p2 = await c2.newPage()
    for (const path of ['/', '/cadastro', '/entrar', '/privacidade']) {
      await p2.goto(B + path); await p2.waitForTimeout(700)
      const ov = await p2.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      const small = await p2.evaluate(() => [...document.querySelectorAll('main a[class*="min-h"], main button, header a, header button, input:not([type=hidden]):not([type=checkbox])')].filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && r.height < 43.5 && !e.closest('[aria-hidden=true]') && (e.offsetParent !== null) && getComputedStyle(e).position !== 'absolute' }).map((e) => ((e.innerText || e.getAttribute('aria-label') || e.id || e.tagName).slice(0, 24)) + ':' + Math.round(e.getBoundingClientRect().height)))
      check(`${w}px ${path}: sem rolagem horizontal; alvos pequenos: ${small.length ? small.join(' | ') : 'nenhum'}`, ov <= 0 && small.length === 0, `overflow ${ov}`)
    }
    // banner × CTA do hero
    await p2.goto(B + '/'); await p2.waitForSelector('[role=dialog]'); await p2.waitForTimeout(300)
    const o = await p2.evaluate(() => { const b = document.querySelector('[role=dialog]').getBoundingClientRect(); const c = document.getElementById('hero-cta').getBoundingClientRect(); return { banner: Math.round(b.top), cta: Math.round(c.bottom), vh: innerHeight } })
    check(`${w}px: banner de cookies não cobre o botão "Quero me cadastrar" (banner topo ${o.banner} × CTA fim ${o.cta})`, o.cta <= o.banner, JSON.stringify(o))
    await c2.close()
  }
  check('sem erros de JavaScript', errs.length === 0, errs.join(' | '))
  await browser.close()
  const ok = res.filter(Boolean).length; console.log(`\n${ok}/${res.length} verificações`); process.exit(ok === res.length ? 0 : 1)
})()
