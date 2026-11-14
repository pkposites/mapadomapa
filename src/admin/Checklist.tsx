import { AlertTriangle, CheckCircle2, Circle } from 'lucide-react'
import type { Detail } from './types'

type Row = { ok: boolean; warn?: boolean; text: string; hint?: string }
/** Resumo para decidir: o que está certo e o que merece atenção antes de aprovar. */
export function checklist(d: Detail): Row[] {
  const flags = d.assessments.reduce((n, a) => n + (a.scores?.flags.length ?? 0), 0)
  const scored = d.assessments.length > 0 && d.assessments.every((a) => a.scores)
  return [
    { ok: d.reviewStatus !== 'not_submitted', text: 'Cadastro enviado para análise', hint: d.reviewStatus === 'not_submitted' ? 'Ainda não foi enviado.' : undefined },
    { ok: Boolean(d.fullName), text: 'Nome informado', hint: d.fullName ? undefined : 'O profissional ainda não informou o nome.' },
    { ok: d.professions.length > 0 && d.regions.length > 0, text: `Profissões e regiões (${d.professions.map((p) => p.name).join(', ') || '—'} · ${d.regions.join(', ') || '—'})` },
    { ok: scored && flags === 0, warn: scored && flags > 0, text: scored ? (flags === 0 ? 'Questionário sem alertas de risco' : `Questionário com ${flags} alerta(s) de risco`) : 'Questionário sem pontuação', hint: flags > 0 ? 'Veja as respostas abaixo antes de decidir.' : undefined },
    { ok: d.phoneVerified, warn: !d.phoneVerified, text: d.phoneVerified ? 'Celular verificado' : 'Celular ainda não verificado', hint: d.phoneVerified ? undefined : 'Confirme por WhatsApp ou mensagem e marque como verificado.' },
    { ok: d.hasPhoto && Boolean(d.bio) && Boolean(d.services), text: 'Perfil completo (foto, apresentação e serviços)', hint: 'Recomendado; não impede a aprovação.' },
  ]
}

export default function Checklist({ d }: { d: Detail }) {
  const rows = checklist(d)
  const core = rows.slice(0, 3).every((r) => r.ok)
  return (
    <section className="mt-4 rounded-3xl bg-white p-5" data-testid="checklist" aria-label="Resumo para decidir">
      <h2 className="mb-1 text-[18px] font-semibold tracking-tight">Para decidir</h2>
      <p className={`mb-3 text-[14px] font-medium ${core ? 'text-[#2b8a00]' : 'text-muted'}`}>{d.reviewStatus === 'pending_review' ? (core ? 'Dados essenciais conferidos. Veja os alertas abaixo e decida.' : 'Faltam dados essenciais.') : 'Resumo do cadastro.'}</p>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.text} className="flex gap-2.5 text-[15px] leading-snug" data-ok={r.ok}>
            {r.ok ? <CheckCircle2 size={19} className="mt-0.5 shrink-0 text-[#2b8a00]" aria-hidden="true" /> : r.warn ? <AlertTriangle size={19} className="mt-0.5 shrink-0 text-[#b26a00]" aria-hidden="true" /> : <Circle size={19} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />}
            <span><span className="font-medium">{r.text}</span>{r.hint && <span className="block text-[13px] text-muted">{r.hint}</span>}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
