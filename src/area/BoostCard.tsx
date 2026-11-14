import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, Rocket } from 'lucide-react'
import { api } from '../lib/api'

/** Convite para o futuro plano de destaque (só registra interesse; não cobra nada). */
export default function BoostCard() {
  const [done, setDone] = useState<boolean | null>(null)
  useEffect(() => { api.get<{ interest: unknown }>('/pro/boost').then((r) => setDone(Boolean(r.interest))).catch(() => setDone(null)) }, [])
  return (
    <section className="overflow-hidden rounded-3xl bg-graphite text-white" aria-label="Destaque" data-testid="boost-card">
      <div className="p-5">
        <p className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.1em] text-lime"><Rocket size={16} aria-hidden="true" /> Possibilidade futura · em estudo</p>
        <h2 className="mt-3 text-[24px] font-bold leading-[1.15] tracking-[-0.02em]">Quero ter destaque e receber serviços com maior frequência</h2>
        <p className="mt-3 text-[15px] leading-snug text-on-dark">Ideia em estudo: mais visibilidade e uma apresentação mais completa do perfil. Sem data, sem valor definido e sem garantia de resultado.</p>
        <Link to="/area/destaque" data-testid="boost-cta" className="mt-4 inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-lime px-6 font-semibold text-graphite">
          {done ? <><Check size={18} aria-hidden="true" /> Interesse registrado · ver ou editar</> : <>Tenho interesse <ArrowRight size={18} aria-hidden="true" /></>}
        </Link>
        <p className="mt-3 text-[12px] leading-snug text-on-dark">Registrar interesse não cobra nada e não é compromisso. Condições comerciais, se existirem, serão informadas antes de qualquer cobrança.</p>
      </div>
    </section>
  )
}
