// Persistência real: cria conta, reinicia o servidor de desenvolvimento e confere os dados.
// Uso: node e2e/persistence.e2e.cjs before | after <celular> <senha> <cookie>
const B = 'http://localhost:5173'
const j = async (m, p, body, cookie) => {
  const r = await fetch(B + '/api' + p, { method: m, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined })
  return { status: r.status, body: await r.json().catch(() => null), cookie: r.headers.get('set-cookie')?.split(';')[0] }
}
;(async () => {
  const phase = process.argv[2]
  if (phase === 'before') {
    await j('POST', '/dev/reset-limits', {})
    const phone = `(11) 9${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`
    const pass = 'persist-senha-' + Math.floor(Math.random() * 1e4)
    const reg = await j('POST', '/auth/register', { phone, password: pass, acceptTerms: true })
    const sms = (await j('GET', '/dev/sms')).body.messages.find((m) => m.phone.endsWith(phone.replace(/\D/g, '')))
    const ver = await j('POST', '/auth/verify-phone', { phone, code: sms.body.match(/\b(\d{6})\b/)[1] })
    const me = await j('GET', '/auth/me', null, ver.cookie)
    console.log(JSON.stringify({ phone, pass, cookie: ver.cookie, ok: reg.status === 200 && ver.status === 200 && me.status === 200 }))
  } else {
    const [, , , phone, pass, cookie] = process.argv
    const me = await j('GET', '/auth/me', null, cookie)
    const login = await j('POST', '/auth/login', { phone, password: pass })
    const dup = await j('POST', '/auth/register', { phone, password: 'outra-senha-forte-9', acceptTerms: true })
    console.log('sessão antiga ainda válida após reiniciar:', me.status === 200 && me.body.user.phone.replace(/\D/g, '') === phone.replace(/\D/g, ''))
    console.log('login com a mesma senha após reiniciar:   ', login.status === 200)
    console.log('telefone continua protegido (duplicado):  ', dup.status === 409)
  }
})()
