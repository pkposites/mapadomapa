import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import Header from '../components/Header'
import Footer from '../components/Footer'
import Spinner from '../components/ui/Spinner'
import AdminGate from '../admin/AdminGate'
import { api } from '../lib/api'

type Opt = { id: string; label: string }
type D = { total: number; totalProfessionals: number; byBudget: Record<string, number>; budgets: Opt[]; priorities: Opt[]
  items: { id: string; name: string | null; phone: string | null; status: string; budget: string; priorities: string[]; note: string | null; at: string; professions: string[]; regions: string[] }[] }
export default function AdminDestaque() { return <AdminGate><Page /></AdminGate> }
function Page() {
  const [d, setD] = useState<D | null>(null)
  useEffect(() => { api.get<D>('/admin/boost').then(setD).catch(() => undefined) }, [])
  const pct = d && d.totalProfessionals ? Math.round((d.total / d.totalProfessionals) * 100) : 0
  return (
    <><Header variant="page" /><main className="bg-ice"><div className="mx-auto max-w-2xl px-5 pb-10 pt-4 md:pt-8">
      <Link to="/admin" className="inline-flex min-h-11 items-center gap-2 text-[15px] font-semibold"><ArrowLeft size={20} aria-hidden="true" /> Voltar</Link>
      <h1 className="mt-2 text-[28px] font-bold tracking-[-0.02em]">Interesse no Destaque</h1>
      <p className="mt-1 text-[15px] text-muted">Validação de demanda: ninguém foi cobrado. Use para decidir o plano antes de lançar.</p>
      {!d && <div className="mt-8 flex justify-center"><Spinner /></div>}
      {d && <>
        <div className="mt-5 rounded-2xl bg-white p-4"><p className="text-[32px] font-bold leading-none">{d.total}</p><p className="mt-1 text-[14px] text-muted">interessado(s) de {d.totalProfessionals} profissional(is) ({pct}%)</p>
          <ul className="mt-3 space-y-1 text-[14px]">{d.budgets.map((b) => <li key={b.id} className="flex justify-between"><span>{b.label}</span><strong>{d.byBudget[b.id]}</strong></li>)}</ul></div>
        <ul className="mt-4 space-y-3">{d.items.map((i) => (
          <li key={i.id} className="rounded-2xl bg-white p-4">
            <p className="text-[16px] font-semibold">{i.name ?? 'Sem nome'} <span className="font-normal text-muted">· {i.phone}</span></p>
            <p className="text-[13px] text-muted">{i.professions.join(' · ') || '—'} · {i.regions.join(' · ') || '—'} · {new Date(i.at).toLocaleDateString('pt-BR')}</p>
            <p className="mt-2 text-[14px]"><strong>{d.budgets.find((b) => b.id === i.budget)?.label}</strong></p>
            <p className="text-[14px] text-muted">{i.priorities.map((p) => d.priorities.find((o) => o.id === p)?.label).join('; ')}</p>
            {i.note && <p className="mt-1 text-[14px]">“{i.note}”</p>}
            <Link to={`/admin/profissionais/${i.id}`} className="mt-1 inline-flex min-h-11 items-center text-[14px] font-semibold underline">Abrir ficha e conversar</Link>
          </li>))}</ul>
        {d.items.length === 0 && <p className="mt-6 text-center text-muted">Ninguém registrou interesse ainda.</p>}
      </>}
    </div></main><Footer /></>
  )
}
