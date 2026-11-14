import {
  Armchair,
  Bug,
  Droplets,
  Drill,
  KeyRound,
  PaintRoller,
  Sparkles,
  Truck,
  Zap,
  type LucideIcon,
} from 'lucide-react'

export type Category = {
  /** Identificador estável (slug). Reutilizar no quiz e no banco de dados. */
  id: string
  name: string
  examples: string
  icon: LucideIcon
}

/** Máximo de profissões que o profissional pode escolher no cadastro. */
export const MAX_PROFESSIONS = 2

// Categorias aprovadas — fonte única para landing, futuro quiz e banco de dados.
export const CATEGORIES: Category[] = [
  { id: 'encanadores', name: 'Encanadores', examples: 'Vazamentos, torneiras, desentupimento', icon: Droplets },
  { id: 'eletricistas', name: 'Eletricistas', examples: 'Tomadas, chuveiros, quadros de luz', icon: Zap },
  { id: 'instaladores', name: 'Instaladores', examples: 'Ar-condicionado, TV, prateleiras', icon: Drill },
  { id: 'pintores', name: 'Pintores', examples: 'Casas, apartamentos, comércios', icon: PaintRoller },
  { id: 'faxineiras', name: 'Faxineiras', examples: 'Faxina e limpeza', icon: Sparkles },
  { id: 'montadores-de-moveis', name: 'Montadores de móveis', examples: 'Guarda-roupas, camas, estantes', icon: Armchair },
  { id: 'dedetizacao', name: 'Dedetização', examples: 'Insetos, ratos, cupins', icon: Bug },
  { id: 'guincho', name: 'Guincho', examples: 'Reboque de carros e motos', icon: Truck },
  { id: 'chaveiros', name: 'Chaveiros', examples: 'Aberturas, cópias, troca de fechadura', icon: KeyRound },
]
