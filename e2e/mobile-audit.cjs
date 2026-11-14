// Auditoria de celular das telas de cadastro e recuperação (Chromium, vários tamanhos).
// Uso: node e2e/mobile-audit.cjs [pasta-de-capturas]  (requer `npm run dev` rodando)
const { chromium } = require('playwright')
const B = process.env.BASE_URL ?? 'http://localhost:5173'
const OUT = process.argv[2]
const problems = []
const note = (ok, msg, extra = '') => { console.log(`${ok ? '  ✓' : '  ✗'} ${msg}${ok ? '' : '  ← ' + extra}`); if (!ok) problems.push(msg + ' ' + extra) }
const digits = (s) => s.replace(/\D/g, '')
const rnd = (n) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, '0')

async function audit(page, label, vw) {
  const r = await page.evaluate(() => {
    const vis = (e) => { const b = e.getBoundingClientRect(); const s = getComputedStyle(e); return b.width > 0 && b.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
    const inText = (e) => e.tagName === 'A' && e.closest('p, label, li') && e.parentElement && e.parentElement.childNodes.length > 1 && e.closest('label')
    const small = []
    for (const e of document.querySelectorAll('main a, main button, main input, main label, header a, footer a')) {
      if (!vis(e) || e.closest('[data-testid=dev-sms]')) continue
      if (e.tagName === 'LABEL' && !e.querySelector('input')) continue
      if (e.tagName === 'INPUT' && e.type === 'checkbox') continue
      if (inText(e)) continue // link dentro de frase (aceite dos termos): isento (WCAG 2.5.8)
      const b = e.getBoundingClientRect()
      if (b.height < 43.5) small.push(`${e.tagName.toLowerCase()}:"${(e.innerText || e.getAttribute('aria-label') || e.placeholder || '').trim().slice(0, 28)}" ${Math.round(b.width)}x${Math.round(b.height)}`)
    }
    const fonts = [...document.querySelectorAll('main *, header *, footer *')].filter((e) => e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && vis(e) && !e.closest('[data-testid=dev-sms]')).map((e) => parseFloat(getComputedStyle(e).fontSize))
    const inputs = [...document.querySelectorAll('main input:not([type=checkbox])')].filter(vis).map((e) => parseFloat(getComputedStyle(e).fontSize))
    return { over: document.documentElement.scrollWidth - innerWidth, small, minFont: Math.min(...fonts), minInput: inputs.length ? Math.min(...inputs) : 99 }
  })
  note(r.over <= 0, `${vw}px · ${label}: sem rolagem horizontal`, `+${r.over}px`)
  note(r.small.length === 0, `${vw}px · ${label}: alvos de toque ≥ 44px`, r.small.join('; '))
  note(r.minFont >= 12, `${vw}px · ${label}: menor texto ≥ 12px`, `${r.minFont}px`)
  note(r.minInput >= 16, `${vw}px · ${label}: campos ≥ 16px (sem zoom no iPhone)`, `${r.minInput}px`)
}
const dump = async (page, where) => { console.error(`\n[diagnóstico em ${where}] url=${page.url()}\n` + (await page.locator('main').innerText().catch(() => '')).slice(0, 400)) }
const smsCode = async (page, d) => { for (let i = 0; i < 20; i++) { const { messages } = await (await page.request.get(`${B}/api/dev/sms`)).json(); const m = messages.find((x) => x.phone.endsWith(d)); if (m) return m.body.match(/\b(\d{6})\b/)[1]; await page.waitForTimeout(250) } throw new Error('sem SMS') }

;(async () => {
  const browser = await chromium.launch()
  for (const vw of [320, 375, 390, 414]) {
    console.log(`\n=== Tela ${vw}px ===`)
    const ctx = await browser.newContext({ viewport: { width: vw, height: 780 }, deviceScaleFactor: vw === 390 ? 2 : 1, isMobile: true, hasTouch: true })
    await ctx.addInitScript(() => localStorage.setItem('mdm_consent_v1', JSON.stringify({ marketing: false, at: 'teste' })))
    const page = await ctx.newPage()
    await page.request.post(`${B}/api/dev/reset-limits`, { data: {} })
    const shot = (n) => OUT && vw === 390 && page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true })

    await page.goto(B + '/cadastro'); await page.waitForSelector('text=Crie sua conta'); await page.waitForTimeout(300)
    await audit(page, 'cadastro (formulário)', vw); await shot('m-cadastro')
    await page.getByRole('button', { name: 'Continuar' }).click(); await page.waitForSelector('text=não é um robô'); await page.waitForTimeout(150)
    await audit(page, 'cadastro (com erros)', vw); await shot('m-cadastro-erros')

    const phone = `(11) 9${rnd(4)}-${rnd(4)}`
    await page.getByLabel('Seu celular').fill(phone); await page.getByLabel('Crie uma senha').fill('audit-senha-' + rnd(3))
    await page.getByLabel(/Li e aceito/).check(); await page.getByLabel(/Não sou um robô/).check()
    await page.getByRole('button', { name: 'Continuar' }).click(); await page.waitForSelector('text=Confirme seu celular'); await page.waitForTimeout(150)
    await audit(page, 'cadastro (código)', vw); await shot('m-codigo')
    const code = await smsCode(page, digits(phone))
    await page.getByLabel('Código do SMS').fill(code); await page.getByRole('button', { name: 'Confirmar celular' }).click(); await page.waitForURL('**/conta')
    await page.getByRole('button', { name: 'Sair da conta' }).click()

    await page.goto(B + '/recuperar-senha'); await page.waitForSelector('text=Esqueceu a senha?'); await page.waitForTimeout(200)
    await audit(page, 'recuperar (celular)', vw); await shot('m-recuperar')
    await page.getByLabel('Seu celular').fill(phone); await page.getByLabel(/Não sou um robô/).check()
    await page.getByRole('button', { name: 'Enviar código' }).click(); await page.waitForSelector('text=Crie uma nova senha', { timeout: 8000 }).catch(async (e) => { await dump(page, `${vw}px recuperar`); throw e }); await page.waitForTimeout(150)
    await audit(page, 'recuperar (código + nova senha)', vw); await shot('m-recuperar-codigo')

    await page.goto(B + '/entrar'); await page.waitForSelector('text=Entrar na sua conta'); await page.waitForTimeout(200)
    await audit(page, 'entrar', vw)

    // teclado aberto (tela baixa): o botão principal continua alcançável
    await page.setViewportSize({ width: vw, height: 380 })
    await page.goto(B + '/cadastro'); await page.waitForSelector('text=Crie sua conta')
    await page.getByLabel('Crie uma senha').focus()
    const reach = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Continuar')); b.scrollIntoView({ behavior: 'instant' }); const r = b.getBoundingClientRect(); return r.bottom <= innerHeight + 1 && r.top >= 0 })
    note(reach, `${vw}px · com teclado aberto (altura 380px) o botão "Continuar" é alcançável`)
    await ctx.close()
  }
  await browser.close()
  console.log(`\n${problems.length ? problems.length + ' problema(s):\n - ' + problems.join('\n - ') : 'Auditoria de celular: tudo aprovado.'}`)
  process.exit(problems.length ? 1 : 0)
})().catch((e) => { console.error('ERRO NA AUDITORIA:', e.message); process.exit(2) })
