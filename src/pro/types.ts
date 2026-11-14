export type Opt = { id: string; label: string; hint?: string }
export type Catalog = {
  professions: { slug: string; name: string }[]
  regions: { slug: string; name: string }[]
  options: { levels: Opt[]; ownTools: Opt[]; vehicle: Opt[]; workStructure: Opt[]; weekdays: Opt[]; periods: Opt[] }
  limits: { professions: number; regions: number; openMin: number; openMax: number }
}
export type PublicQuestion =
  | { id: string; kind: 'choice'; prompt: string; options: { id: string; text: string }[] }
  | { id: string; kind: 'open'; prompt: string; hint: string }
export type ProState = {
  profile: {
    reviewStatus: 'not_submitted' | 'pending_review' | 'needs_changes' | 'approved' | 'rejected'
    submittedAt: string | null
    availability: { weekdays: string[]; periods: string[]; emergency: boolean } | null
    ownTools: string | null
    vehicle: string | null
    workStructure: string | null
  }
  professions: { slug: string; name: string; experienceYears: number | null; selfLevel: string | null }[]
  regions: string[]
  questionnaires: Record<string, PublicQuestion[]>
  answers: Record<string, Record<string, { choice?: string; text?: string }>>
  progress: { professions: boolean; regions: boolean; work: boolean; assessment: Record<string, { answered: number; total: number }>; assessmentDone: boolean }
  nextStep: 1 | 2 | 3 | 4 | 5
  locked: boolean
  approvalNote: string
}
