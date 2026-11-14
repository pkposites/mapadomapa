import {
  Car,
  GraduationCap,
  Hammer,
  HeartPulse,
  Laptop,
  PartyPopper,
  Scissors,
  Sparkles,
  Zap,
  type LucideIcon,
} from 'lucide-react'

export type Category = {
  id: string
  name: string
  examples: string
  icon: LucideIcon
}

// Nomes provisórios das 9 categorias — edite aqui para ajustar a landing inteira.
export const CATEGORIES: Category[] = [
  { id: 'reformas', name: 'Reformas e obras', examples: 'Pedreiro, pintor, gesseiro', icon: Hammer },
  { id: 'eletrica-hidraulica', name: 'Elétrica e hidráulica', examples: 'Eletricista, encanador', icon: Zap },
  { id: 'limpeza', name: 'Limpeza e diaristas', examples: 'Faxina, pós-obra, limpeza pesada', icon: Sparkles },
  { id: 'beleza', name: 'Beleza e estética', examples: 'Cabelo, unhas, maquiagem', icon: Scissors },
  { id: 'saude', name: 'Saúde e bem-estar', examples: 'Massagem, personal, nutrição', icon: HeartPulse },
  { id: 'aulas', name: 'Aulas e reforço', examples: 'Idiomas, música, reforço escolar', icon: GraduationCap },
  { id: 'tecnologia', name: 'Tecnologia e design', examples: 'Suporte, sites, identidade visual', icon: Laptop },
  { id: 'eventos', name: 'Eventos e festas', examples: 'Buffet, DJ, fotografia', icon: PartyPopper },
  { id: 'automotivo', name: 'Automotivo', examples: 'Mecânica, funilaria, lava-rápido', icon: Car },
]
