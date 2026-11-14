// Concede o papel "admin" a um celular — SOMENTE no banco LOCAL de desenvolvimento.
// Uso: npm run admin:grant -- "(11) 91234-5678"
// Em produção NÃO use este script: o primeiro admin deve ser criado por uma migração
// de dados revisada (ver docs/ETAPA-2.md).
import { execFileSync } from 'node:child_process'

const digits = (process.argv[2] ?? '').replace(/\D/g, '').replace(/^55(?=\d{11}$)/, '')
if (!/^[1-9]\d9\d{8}$/.test(digits)) {
  console.error('Informe um celular brasileiro válido. Ex.: npm run admin:grant -- "(11) 91234-5678"')
  process.exit(1)
}

const connect = (args) => execFileSync('npx', ['netlify', 'database', 'connect', ...args], { encoding: 'utf8' })

// TRAVA: confirma que a conexão é da própria máquina antes de escrever qualquer coisa.
let host = ''
try {
  host = new URL(JSON.parse(connect(['--json'])).connection_string).hostname
} catch {
  console.error('Não foi possível confirmar o banco. Rode "npm run dev" em outro terminal e tente de novo.')
  process.exit(1)
}
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
  console.error(`RECUSADO: o banco conectado (${host}) não é local. Este script nunca altera produção.`)
  process.exit(1)
}

const sql = `INSERT INTO user_roles (user_id, role_id)
SELECT p.user_id, r.id FROM phones p, roles r
WHERE p.e164 = '+55${digits}' AND r.name = 'admin'
ON CONFLICT DO NOTHING RETURNING user_id`
const out = JSON.parse(connect(['--query', sql, '--json']))
const rows = out.rows ?? out
console.log(Array.isArray(rows) && rows.length ? `Admin concedido a +55${digits} (banco local).` : 'Nada alterado: celular não encontrado ou já era admin.')
