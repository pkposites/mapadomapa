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
        <p className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.1em] text-lime"><Rocket size={16} aria-hidden="true" /> Destaque Mapa do Mapa · em breve</p>
        <h2 className="mt-3 text-[24px] font-bold leading-[1.15] tracking-[-0.02em]">Quero ter destaque e receber serviços com maior frequência</h2>
        <div className="mt-4 flex items-center gap-4 rounded-2xl bg-white/10 p-4">
          <p className="text-[44px] font-bold leading-none tracking-[-0.04em] text-lime">3+</p>
          <p className="text-[15px] leading-snug text-on-dark"><strong className="text-white">contatos por semana</strong> é a nossa meta para quem usar o Destaque.*</p>
        </div>
        <Link to="/area/destaque" data-testid="boost-cta" className="mt-4 inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-lime px-6 font-semibold text-graphite">
          {done ? <><Check size={18} aria-hidden="true" /> Interesse registrado · ver ou editar</> : <>Tenho interesse <ArrowRight size={18} aria-hidden="true" /></>}
        </Link>
        <p className="mt-3 text-[12px] leading-snug text-on-dark">*Meta de referência, sem garantia: o resultado depende da profissão, da região e da demanda. Registrar interesse não cobra nada.</p>
      </div>
    </section>
  )
}
