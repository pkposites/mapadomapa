import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, BadgeCheck, CheckCircle2, ListChecks, Rocket, Sparkles } from 'lucide-react'
import AreaShell from '../../area/Shell'
import Alert from '../../components/ui/Alert'
import Spinner from '../../components/ui/Spinner'
import SubmitButton from '../../components/ui/SubmitButton'
import { api, ApiError } from '../../lib/api'

type Opt = { id: string; label: string }
type Data = { options: { budgets: Opt[]; priorities: Opt[] }; interest: { budget: string; priorities: string[]; note: string } | null }

export default function Destaque() {
  const [d, setD] = useState<Data | null>(null)
  const [budget, setBudget] = useState('')
  const [pri, setPri] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const apply = (x: Data) => { setD(x); setBudget(x.interest?.budget ?? ''); setPri(x.interest?.priorities ?? []); setNote(x.interest?.note ?? ''); setEditing(!x.interest) }
  useEffect(() => { api.get<Data>('/pro/boost').then(apply).catch(() => setErr('Não foi possível carregar. Confira a internet e tente de novo.')) }, [])

  const save = async () => {
    setBusy(true); setErr(null)
    try { const x = await api.put<Data>('/pro/boost', { budget, priorities: pri, note }); setD(x); setEditing(false) } catch (e) { setErr(e instanceof ApiError ? e.message : 'Algo deu errado.') } finally { setBusy(false) }
  }
  const remove = async () => { setBusy(true); try { apply(await api.del<Data>('/pro/boost')) } catch { setErr('Não foi possível remover agora.') } finally { setBusy(false) } }
  const toggle = (id: string) => setPri((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  return (
    <AreaShell>
      <Link to="/area" className="inline-flex min-h-11 items-center gap-2 text-[15px] font-semibold"><ArrowLeft size={18} aria-hidden="true" /> Voltar</Link>
      <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-[-0.03em]">Quero ter destaque</h1>
      <p className="mt-1 text-[16px] leading-snug text-muted">Receba serviços com mais frequência com um perfil que aparece mais e se apresenta melhor.</p>

      <section className="mt-5 rounded-3xl bg-graphite p-5 text-white" aria-label="Meta">
        <p className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.1em] text-lime"><Rocket size={16} aria-hidden="true" /> Nossa meta</p>
        <p className="mt-2 flex items-end gap-3"><span className="text-[56px] font-bold leading-none tracking-[-0.04em] text-lime">3+</span><span className="pb-1 text-[17px] leading-tight">contatos de clientes<br />por semana</span></p>
        <p className="mt-3 text-[13px] leading-snug text-on-dark">Meta de referência, <strong className="text-white">sem garantia</strong>. Depende da profissão, da região e da demanda, e os pedidos reais começam em 25/11/2026.</p>
      </section>

      <section className="mt-5 rounded-3xl bg-white p-5">
        <h2 className="text-[18px] font-bold">O que o Destaque deve oferecer</h2>
        <ul className="mt-3 space-y-3 text-[15px] leading-snug">
          <li className="flex gap-3"><Sparkles size={20} className="mt-0.5 shrink-0" aria-hidden="true" /><span><strong>Prioridade na sua região:</strong> seu perfil aparece antes para quem pede orçamento.</span></li>
          <li className="flex gap-3"><ListChecks size={20} className="mt-0.5 shrink-0" aria-hidden="true" /><span><strong>Apresentação mais completa:</strong> mais espaço para mostrar seu trabalho e seus diferenciais.</span></li>
          <li className="flex gap-3"><BadgeCheck size={20} className="mt-0.5 shrink-0" aria-hidden="true" /><span><strong>Selo de destaque</strong> que passa mais confiança ao cliente.</span></li>
        </ul>
        <p className="mt-3 rounded-2xl bg-ice p-3 text-[14px] leading-snug">Ainda <strong>não está disponível</strong> e <strong>não cobramos nada agora</strong>. Registrando seu interesse, você ajuda a definir o plano e fala com a equipe antes de qualquer cobrança.</p>
      </section>

      {!d && !err && <div className="mt-8 flex justify-center"><Spinner /></div>}
      {err && <div className="mt-4"><Alert tone="error">{err}</Alert></div>}

      {d && !editing && d.interest && (
        <section className="mt-5 rounded-3xl bg-white p-5" data-testid="boost-done">
          <p className="flex items-center gap-2 text-[18px] font-bold"><CheckCircle2 size={22} className="text-[#2b8a00]" aria-hidden="true" /> Interesse registrado!</p>
          <p className="mt-2 text-[15px] leading-snug text-muted">Obrigado! Você está na lista e a equipe vai avisar você aqui, em Mensagens, quando o Destaque estiver disponível, antes de qualquer cobrança.</p>
          <p className="mt-3 text-[14px]"><strong>Investimento:</strong> {d.options.budgets.find((b) => b.id === d.interest!.budget)?.label}</p>
          <p className="mt-1 text-[14px]"><strong>Mais importa:</strong> {d.interest.priorities.map((p) => d.options.priorities.find((o) => o.id === p)?.label).join('; ')}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <SubmitButton type="button" variant="ghost" className="border border-line" onClick={() => setEditing(true)}>Editar</SubmitButton>
            <SubmitButton type="button" variant="ghost" className="border border-line" loading={busy} onClick={remove}>Remover interesse</SubmitButton>
          </div>
        </section>
      )}

      {d && editing && (
        <form className="mt-5 rounded-3xl bg-white p-5" onSubmit={(e) => { e.preventDefault(); void save() }} data-testid="boost-form">
          <h2 className="text-[18px] font-bold">Registrar meu interesse</h2>
          <fieldset className="mt-4"><legend className="text-[15px] font-semibold">Quanto você investiria por mês para ter mais clientes?</legend>
            <div className="mt-2 space-y-2">{d.options.budgets.map((b) => (
              <label key={b.id} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border px-4 text-[15px] ${budget === b.id ? 'border-graphite bg-ice font-semibold' : 'border-line'}`}>
                <input type="radio" name="budget" className="size-5 accent-graphite" checked={budget === b.id} onChange={() => setBudget(b.id)} />{b.label}</label>))}</div>
            <p className="mt-2 text-[12px] text-muted">É só uma pesquisa para definir o plano. Não é um compromisso.</p>
          </fieldset>
          <fieldset className="mt-5"><legend className="text-[15px] font-semibold">O que mais importa para você?</legend>
            <div className="mt-2 space-y-2">{d.options.priorities.map((p) => (
              <label key={p.id} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border px-4 py-2 text-[15px] ${pri.includes(p.id) ? 'border-graphite bg-ice font-semibold' : 'border-line'}`}>
                <input type="checkbox" className="size-5 shrink-0 accent-graphite" checked={pri.includes(p.id)} onChange={() => toggle(p.id)} />{p.label}</label>))}</div>
          </fieldset>
          <label htmlFor="note" className="mt-5 block text-[15px] font-semibold">Algo mais que você gostaria? (opcional)</label>
          <textarea id="note" rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} className="mt-2 block w-full rounded-2xl border border-line p-3 text-[16px] focus:outline-2 focus:outline-offset-2 focus:outline-graphite" />
          <div className="mt-5 space-y-2">
            <SubmitButton loading={busy} disabled={!budget || pri.length === 0} data-testid="boost-save">Registrar meu interesse</SubmitButton>
            {d.interest && <SubmitButton type="button" variant="ghost" className="border border-line" onClick={() => apply(d)}>Cancelar</SubmitButton>}
          </div>
        </form>
      )}
    </AreaShell>
  )
}
