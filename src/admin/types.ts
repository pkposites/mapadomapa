export type Status = 'not_submitted' | 'pending_review' | 'needs_changes' | 'approved' | 'rejected' | 'suspended'
export const STATUS_LABEL: Record<Status, string> = {
  not_submitted: 'Cadastro não enviado', pending_review: 'Em análise', needs_changes: 'Ajustes pedidos', approved: 'Aprovado', rejected: 'Rejeitado', suspended: 'Suspenso',
}
export type Stats = { byStatus: Record<Status, number>; unverifiedPhones: number; unreadMessages: number }
export type Item = {
  id: string; name: string | null; unread: number; whatsapp: string; phone: string; phoneVerified: boolean; createdAt: string; accountStatus: string; reviewStatus: Status; submittedAt: string | null
  professions: string[]; regions: string[]; bestScore: number | null; flagged: number
}
export type Detail = {
  email?:string|null;emailVerified?:boolean;
  whatsappPhone: string; lastWhatsApp: string | null; phoneVerifiedAt: string | null
  fullName: string | null; bio: string | null; services: string | null; extraInfo: string | null; hasPhoto: boolean; unreadMessages: number; welcomeSent: boolean
  profileEvents: { kind: string; details: string | null; at: string }[]
  id: string; phone: string; phoneVerified: boolean; accountStatus: string; createdAt: string; reviewStatus: Status; submittedAt: string | null; reviewNotes: string | null
  work: { availability: { weekdays: string[]; periods: string[]; emergency: boolean } | null; ownTools: string | null; vehicle: string | null; workStructure: string | null } | null
  professions: { slug: string; name: string; experienceYears: number | null; level: string | null }[]
  regions: string[]
  assessments: {
    slug: string; name: string
    scores: { rule: number; ai: number | null; technical: number; flags: string[] } | null
    questions: { id: string; kind: 'choice' | 'open'; prompt: string; answer: string | null; points: number | null; risk: string | null; best: number | null }[]
  }[]
  aiEvaluations: { profession: string; provider: string; status: string; score: number | null; summary: string | null; flags: string[] }[]
  history: { action: string; from: string | null; to: string | null; notes: string | null; at: string }[]
}
