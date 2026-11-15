// E2E do mural (posts com tema e título, equipe identificada, aviso sem duplicidade). Requer: CAPTCHA_PROVIDER=pow npx vite --port 5173
const { chromium } = require('playwright')
const { execSync } = require('node:child_process')
const B = process.env.BASE_URL ?? 'http://localhost:5173'
const rnd = (n) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, '0')
const res = []
const check = (n, ok, x = '') => { res.push(ok); console.log(`${ok ? '  ✓' : '  ✗'} ${n}${ok ? '' : '  ← ' + x}`) }
const hideDev = () => document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '[data-testid=dev-sms]{display:none!important}'; document.head.appendChild(s) })
async function signup(browser, phone, pass) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await ctx.addInitScript(() => localStorage.setItem('mdm_consent_v1', JSON.stringify({ marketing: false, at: 'x' }))); await ctx.addInitScript(hideDev)
  const page = await ctx.newPage()
  await page.request.post(`${B}/api/dev/reset-limits`, { data: {} })
  await page.goto(B + '/cadastro'); await page.waitForSelector('text=Verificação de segurança concluída', { timeout: 30000 })
  await page.getByLabel('Seu celular').fill(phone); await page.getByLabel('Crie uma senha').fill(pass); await page.getByLabel(/Li e aceito/).check()
  await page.getByRole('button', { name: 'Criar minha conta' }).click(); await page.waitForURL('**/profissional')
  return { ctx, page }
}
;(async () => {
  const browser = await chromium.launch()
  const adminPhone = `(11) 9${rnd(4)}-${rnd(4)}`, memberPhone = `(11) 9${rnd(4)}-${rnd(4)}`
  const admin = await signup(browser, adminPhone, 'mural-senha-' + rnd(4))
  execSync(`npm run admin:grant -- "${adminPhone}"`, { stdio: 'ignore' })
  const member = await signup(browser, memberPhone, 'mural-senha-' + rnd(4))
  const errs = []; admin.page.on('pageerror', (e) => errs.push(String(e))); member.page.on('pageerror', (e) => errs.push(String(e)))

  console.log('\n[1] Equipe publica um post com tema e título')
  let page = admin.page
  await page.goto(B + '/area/mural'); await page.waitForSelector('[data-testid=new-post]')
  await page.locator('[data-testid=new-post]').click()
  check('sugestões de tema visíveis (Dúvida, Divulgando serviço realizado…)', (await page.locator('[data-testid=composer]').getByRole('button', { name: 'Divulgando serviço realizado' }).count()) === 1 && (await page.locator('[data-testid=composer]').getByRole('button', { name: 'Dúvida', exact: true }).count()) === 1)
  await page.locator('[data-testid=composer]').getByRole('button', { name: 'Novidade', exact: true }).click()
  check('o tema sugere o início do título', (await page.locator('#post-title').inputValue()) === 'Novidade: ')
  await page.locator('#post-title').fill('Novidade: bem-vindos ao mural'); await page.locator('#post-body').fill('Este é o espaço da comunidade. Postem dúvidas, dicas e serviços realizados! Veja https://mapadomapa.netlify.app')
  await page.locator('[data-testid=post-send]').click(); await page.waitForSelector('text=Post publicado!')
  check('post da equipe aparece identificado (selo "Equipe")', (await page.locator('[data-testid=post] [data-testid=staff-badge]').count()) >= 1)
  check('título em destaque e tema exibido', /Novidade: bem-vindos ao mural/.test(await page.locator('[data-testid=post]').first().innerText()) && (await page.locator('[data-testid=topic-pill]').first().innerText()) === 'Novidade')

  console.log('\n[2] Profissional em análise vê, mas não interage; sem aviso duplicado')
  page = member.page
  await page.goto(B + '/area/mural'); await page.waitForSelector('[data-testid=post]')
  check('vê o post da equipe com selo', (await page.locator('[data-testid=staff-badge]').count()) >= 1)
  check('aviso de liberação aparece uma única vez', (await page.getByText('liberam depois da aprovação').count()) === 1)
  await page.locator('[data-testid=like]').first().click({ force: true }); await page.waitForTimeout(400)
  check('tocar em curtir não gera segundo aviso', (await page.getByText('liberam depois da aprovação').count()) === 1 && (await page.locator('[role=alert]').count()) === 0)
  await page.locator('[data-testid=post-link]').first().click(); await page.waitForSelector('[data-testid=post-page]')
  check('post abre em página própria, com texto completo', /Veja https/.test(await page.locator('[data-testid=post-page]').innerText()))
  check('em análise não vê campo de comentário', (await page.locator('input[id^="c-"]').count()) === 0)

  console.log('\n[3] Equipe curte e comenta (sem aprovação)')
  page = admin.page
  await page.goto(B + '/area/mural'); await page.waitForSelector('[data-testid=post-link]'); await page.locator('[data-testid=post-link]').first().click(); await page.waitForSelector('[data-testid=post-page]')
  await page.locator('[data-testid=like]').click(); await page.waitForTimeout(500)
  check('curtida da equipe registrada', /1/.test(await page.locator('[data-testid=like]').innerText()))
  await page.locator('input[id^="c-"]').fill('Bem-vindos! Qualquer dúvida, respondam aqui.'); await page.keyboard.press('Enter'); await page.waitForSelector('text=Qualquer dúvida, respondam aqui.')
  check('comentário da equipe com selo', (await page.locator('[data-testid=comments] [data-testid=staff-badge]').count()) === 1)
  page = member.page
  await page.goto(B + '/area/mural'); await page.waitForSelector('[data-testid=post]')
  await page.getByRole('group', { name: 'Filtrar por tema' }).getByRole('button', { name: 'Novidade' }).click(); await page.waitForTimeout(500)
  await page.waitForTimeout(1500)
  check('filtro por tema funciona', (await page.locator('[data-testid=post]').count()) >= 1 && /Novidade: bem-vindos/.test(await page.locator('[data-testid=posts]').innerText()))
  await page.getByRole('group', { name: 'Filtrar por tema' }).getByRole('button', { name: 'Dúvida', exact: true }).click(); await page.waitForTimeout(500)
  await page.waitForSelector('text=Nenhum post por aqui', { timeout: 10000 }).catch(() => {})
  check('tema sem posts mostra mensagem vazia', /Nenhum post/.test(await page.locator('[data-testid=posts]').innerText()), (await page.locator('[data-testid=posts]').innerText()).slice(0,200))
  await page.goto(B + '/area'); await page.waitForSelector('[data-testid=greeting]')
  check('Início mostra resumo do mural com título', /Novidade: bem-vindos ao mural/.test(await page.locator('[data-testid=mural]').innerText()))
  check('sem rolagem horizontal', (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0)
  check('sem erros de JavaScript', errs.length === 0, errs.join(' | '))
  await browser.close()
  const ok = res.filter(Boolean).length; console.log(`\n${ok}/${res.length} verificações`); process.exit(ok === res.length ? 0 : 1)
})()
