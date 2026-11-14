import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, BadgeCheck, ShieldAlert } from 'lucide-react'
import Header from '../components/Header'
import Footer from '../components/Footer'
import Alert from '../components/ui/Alert'
import Spinner from '../components/ui/Spinner'
import SubmitButton from '../components/ui/SubmitButton'
import AdminGate from '../admin/AdminGate'
import StatusBadge from '../admin/StatusBadge'
import type { Detail, Status } from '../admin/types'
import { Thread } from './area/Mensagens'
import type { Msg } from '../area/types'
import { api, ApiError } from '../lib/api'

type Action = 'approve' | 'request_changes' | 'reject' | 'suspend' | 'reinstate'
const ACTIONS: Record<Action, { label: string; needsNotes: boolean; hint: string }> = {
  approve: { label: 'Aprovar', needsNotes: false, hint: 'O profissional passa a poder aparecer ao público.' },
  request_changes: { label: 'Pedir ajustes', needsNotes: true, hint: 'O profissional poderá editar e reenviar. Explique o que ajustar.' },
  reject: { label: 'Rejeitar', needsNotes: true, hint: 'O cadastro fica rejeitado e travado. Explique o motivo.' },
  suspend: { label: 'Suspender', needsNotes: true, hint: 'O profissional deixa de aparecer ao público. Explique o motivo.' },
  reinstate: { label: 'Reativar', needsNotes: false, hint: 'Volta a ficar aprovado.' },
}
const FOR_STATUS: Partial<Record<Status, Action[]>> = {
  pending_review: ['approve', 'request_changes', 'reject'], needs_changes: ['reject'], approved: ['suspend'], suspended: ['reinstate'],
}
const DAY: Record<string, string> = { seg: 'Seg', ter: 'Ter', qua: 'Qua', qui: 'Qui', sex: 'Sex', sab: 'Sáb', dom: 'Dom' }
const PERIOD: Record<string, string> = { manha: 'manhã', tarde: 'tarde', noite: 'noite' }
const ACTION_LABEL: Record<string, string> = { approve: 'Aprovado', reject: 'Rejeitado', request_changes: 'Ajustes pedidos', suspend: 'Suspenso', reinstate: 'Reativado', verify_phone: 'Celular verificado', unverify_phone: 'Verificação do celular removida' }
const fmt = (d: string) => new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

export default function AdminProfissional() {
  return <AdminGate><Page /></AdminGate>
}

function Page() {
  const { id } = useParams()
  const [d, setD] = useState<Detail | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [action, setAction] = useState<Action | null>(null)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    try { setD(await api.get<Detail>(`/admin/professionals/${id}`)) } catch (e) { setErr(e instanceof ApiError ? e.message : 'Não foi possível carregar.') }
  }, [id])
  useEffect(() => { void load() }, [load])

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true); setErr(null); setMsg(null)
    try { await fn(); setMsg(ok); setAction(null); setNotes(''); await load() } catch (e) { setErr(e instanceof ApiError ? e.message : 'Algo deu errado.') } finally { setBusy(false) }
  }
  if (err && !d) return <Shell><Alert tone="error">{err}</Alert></Shell>
  if (!d) return <Spinner fullPage />

  const allowed = FOR_STATUS[d.reviewStatus] ?? []
  const a = action ? ACTIONS[action] : null
  const notesOk = !a?.needsNotes || notes.trim().length >= 5

  return (
    <Shell>
      <Link to="/admin" className="inline-flex min-h-11 items-center gap-2 text-[15px] font-semibold"><ArrowLeft size={20} aria-hidden="true" /> Voltar à lista</Link>
      <div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="text-[28px] font-bold tracking-[-0.02em]">{d.fullName ?? d.phone}</h1><StatusBadge status={d.reviewStatus} /></div>
      {msg && <div className="mt-3"><Alert tone="success">{msg}</Alert></div>}
      {err && <div className="mt-3"><Alert tone="error">{err}</Alert></div>}
      {d.reviewNotes && <p className="mt-3 rounded-2xl bg-white p-4 text-[15px]"><strong>Última observação:</strong> {d.reviewNotes}</p>}

      <Block title="Perfil">
        <div className="flex items-start gap-4">
          <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-full bg-ice text-muted">
            {d.hasPhoto ? <img src={`/api/admin/professionals/${d.id}/photo`} alt="Foto do profissional" className="size-full object-cover" /> : '—'}
          </div>
          <div className="min-w-0 text-[15px] leading-snug">
            <p><strong>Nome:</strong> {d.fullName ?? 'não informado'}</p>
            <p className="mt-1"><strong>Apresentação:</strong> {d.bio ?? '—'}</p>
            <p className="mt-1"><strong>Serviços:</strong> {d.services ?? '—'}</p>
            <p className="mt-1"><strong>Outras informações:</strong> {d.extraInfo ?? '—'}</p>
          </div>
        </div>
        {d.profileEvents.length > 0 && (
          <div className="mt-4 rounded-2xl bg-ice p-3"><p className="text-[14px] font-semibold">Alterações feitas pelo profissional</p>
            <ul className="mt-1 space-y-1 text-[14px]">{d.profileEvents.map((e, i) => <li key={i}>{fmt(e.at)} · {e.details ?? e.kind}</li>)}</ul></div>
        )}
      </Block>

      <Block title={`Mensagens${d.unreadMessages ? ` (${d.unreadMessages} não lida(s))` : ''}`}>
        <Thread mine="admin"
          load={() => api.get<{ messages: Msg[] }>(`/admin/professionals/${d.id}/messages`).then((r) => r.messages)}
          send={(body) => api.post<{ messages: Msg[] }>(`/admin/professionals/${d.id}/messages`, { body }).then((r) => r.messages)} />
      </Block>

      <Block title="Celular">
        <p className="flex items-center gap-2 text-[16px]">{d.phoneVerified ? <><BadgeCheck size={20} aria-hidden="true" /> Verificado pela equipe</> : <><ShieldAlert size={20} aria-hidden="true" /> Ainda não verificado</>}</p>
        <div className="mt-3"><SubmitButton type="button" variant="ghost" className="border border-line" loading={busy} onClick={() => run(() => api.post(`/admin/professionals/${d.id}/phone`, { verified: !d.phoneVerified }), d.phoneVerified ? 'Verificação removida.' : 'Celular marcado como verificado.')}>
          {d.phoneVerified ? 'Remover verificação' : 'Marcar celular como verificado'}</SubmitButton></div>
        <p className="mt-2 text-[13px] text-muted">Conta criada em {fmt(d.createdAt)}{d.submittedAt ? ` · enviado em ${fmt(d.submittedAt)}` : ' · cadastro profissional ainda não enviado'}</p>
      </Block>

      <Block title="Profissões e regiões">
        {d.professions.length === 0 && <p className="text-muted">Nenhuma profissão escolhida.</p>}
        {d.professions.map((p) => <p key={p.slug} className="text-[16px]"><strong>{p.name}</strong> · {p.experienceYears ?? '?'} anos · {p.level ?? 'nível não informado'}</p>)}
        <p className="mt-2 text-[16px]">Regiões: {d.regions.join(' e ') || '—'}</p>
      </Block>

      {d.work && (
        <Block title="Trabalho">
          <p className="text-[16px]">Atende: {d.work.availability?.weekdays.map((x) => DAY[x] ?? x).join(', ') || '—'} ({d.work.availability?.periods.map((x) => PERIOD[x] ?? x).join(', ') || '—'}){d.work.availability?.emergency ? ' · urgências' : ''}</p>
          <p className="text-[16px]">Ferramentas: {d.work.ownTools ?? '—'} · Veículo: {d.work.vehicle ?? '—'}</p>
          <p className="text-[16px]">Estrutura: {d.work.workStructure ?? '—'}</p>
        </Block>
      )}

      {d.assessments.map((s) => (
        <Block key={s.slug} title={`Avaliação técnica · ${s.name}`}>
          {s.scores ? (
            <>
              <p className="text-[16px]"><strong>Nota técnica {s.scores.technical}</strong> <span className="text-muted">(objetivas {s.scores.rule}{s.scores.ai !== null ? ` · resposta aberta ${s.scores.ai}` : ' · IA indisponível'})</span></p>
              {s.scores.flags.length > 0 && <ul className="mt-2 space-y-1">{s.scores.flags.map((f) => <li key={f} className="flex items-start gap-2 text-[14px] font-medium text-danger"><AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />{f.replace(/[_:]/g, ' ')}</li>)}</ul>}
              <p className="mt-2 text-[13px] text-muted">A nota é apenas apoio à sua decisão. Nada é aprovado automaticamente.</p>
            </>
          ) : <p className="text-muted">Ainda sem pontuação (cadastro não enviado).</p>}
          <details className="mt-3 rounded-2xl bg-ice p-3">
            <summary className="min-h-11 cursor-pointer py-2 text-[15px] font-semibold">Ver respostas do questionário</summary>
            <ol className="mt-2 space-y-4">
              {s.questions.map((q, i) => (
                <li key={q.id} className="text-[15px] leading-snug">
                  <p className="font-semibold">{i + 1}. {q.prompt}</p>
                  <p className="mt-1">{q.answer ?? <span className="text-muted">Sem resposta</span>}</p>
                  {q.kind === 'choice' && q.points !== null && <p className={`mt-1 text-[13px] ${q.points === q.best ? 'text-muted' : 'font-semibold'}`}>{q.points} de {q.best} pontos{q.risk ? ` · risco: ${q.risk.replace(/_/g, ' ')}` : ''}</p>}
                </li>
              ))}
            </ol>
          </details>
        </Block>
      ))}

      {d.aiEvaluations.length > 0 && (
        <Block title="Avaliação por IA">
          {d.aiEvaluations.map((e, i) => <p key={i} className="text-[14px]"><strong>{e.provider === 'sim' ? 'Simulada' : 'OpenAI'}</strong> · {e.status === 'ok' ? `nota ${e.score}` : 'falhou'}{e.summary ? ` — ${e.summary}` : ''}</p>)}
        </Block>
      )}

      {d.history.length > 0 && (
        <Block title="Histórico de decisões">
          <ul className="space-y-2">{d.history.map((h, i) => <li key={i} className="text-[14px]"><strong>{ACTION_LABEL[h.action] ?? h.action}</strong> · {fmt(h.at)}{h.notes ? ` — ${h.notes}` : ''}</li>)}</ul>
        </Block>
      )}

      {allowed.length > 0 && (
        <div className="sticky bottom-0 -mx-5 mt-6 border-t border-line bg-ice px-5 py-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          {!action ? (
            <div className="mx-auto grid max-w-2xl gap-2" role="group" aria-label="Decisão">
              {allowed.map((k, idx) => <SubmitButton key={k} type="button" variant={idx === 0 ? 'primary' : 'ghost'} className={idx === 0 ? '' : 'border border-line'} onClick={() => setAction(k)}>{ACTIONS[k].label}</SubmitButton>)}
            </div>
          ) : (
            <div className="mx-auto max-w-2xl">
              <p className="text-[15px] font-semibold">{a!.label}: {a!.hint}</p>
              <label htmlFor="notes" className="sr-only">Observação</label>
              <textarea id="notes" rows={3} maxLength={1000} placeholder={a!.needsNotes ? 'Motivo (obrigatório)' : 'Observação (opcional)'} value={notes} onChange={(e) => setNotes(e.target.value)}
                className="mt-2 block w-full rounded-2xl border border-line bg-white p-3 text-[16px] focus:outline-2 focus:outline-offset-2 focus:outline-graphite" />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <SubmitButton type="button" variant="ghost" className="border border-line" onClick={() => { setAction(null); setNotes('') }}>Cancelar</SubmitButton>
                <SubmitButton type="button" loading={busy} disabled={!notesOk} onClick={() => run(() => api.post(`/admin/professionals/${d.id}/decision`, { action, notes }), `${a!.label}: feito.`)}>Confirmar</SubmitButton>
              </div>
            </div>
          )}
        </div>
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (<><Header variant="page" /><main className="bg-ice"><div className="mx-auto max-w-2xl px-5 pb-6 pt-4 md:pt-8">{children}</div></main><Footer /></>)
}
const Block = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mt-4 rounded-3xl bg-white p-5"><h2 className="mb-3 text-[18px] font-semibold tracking-tight">{title}</h2>{children}</section>
)
