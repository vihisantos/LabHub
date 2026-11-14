/**
 * Types for editorial submission flow (local fixtures only).
 *
 * These types are intentionally separate from TvEvent/TvPlaylist to avoid
 * coupling with Supabase schemas or real DB constraints. The prototype uses
 * plain JS objects that match these shapes; no persistence is performed.
 */

// ---------------------------------------------------------------------------
// Content types accepted for submission
// ---------------------------------------------------------------------------

export type EditorialContentType =
  | 'event'
  | 'informative'
  | 'gallery'
  | 'video'
  | 'course'

export type EditorialFormErrors = Record<keyof EditorialFormValues, string | undefined>

export interface EditorialFormValues {
  contentType: EditorialContentType
  title: string
  campus: string
  startDate: string
  endDate: string
  // Conditional fields — only some types use these
  description?: string
  location?: string
  inscriptionInfo?: string
  durationMinutes?: number
  callToAction?: string
  hasCaptions?: boolean
  mediaReference?: string // path or placeholder name
  galleryCaption?: string
  modalitie?: string
  accessInfo?: string
}

// ---------------------------------------------------------------------------
// Submission record (local state only)
// ---------------------------------------------------------------------------

export interface EditorialSubmission {
  id: string
  createdAt: string
  // Values copied from the form at submission time
  values: EditorialFormValues
  // Audit state machine
  status: 'pending' | 'underReview' | 'adjustmentsRequested' | 'approved' | 'rejected' | 'expired'
  // Who performed the last action + when (session only)
  lastActionBy: string | null
  lastActionAt: string | null
  // Free-form justification (for "adjustments requested" or "rejected")
  justification?: string
  // Campus filter — used in programming view
  campus: string
}

// ---------------------------------------------------------------------------
// Audit action history entry (session-only replay)
// ---------------------------------------------------------------------------

export type EditorialAction =
  | { type: 'submit'; submission: EditorialSubmission }
  | { type: 'approve'; submissionId: string; approvedBy: string }
  | { type: 'reject'; submissionId: string; justification: string; rejectedBy: string }
  | { type: 'adjustments'; submissionId: string; justification: string; adjustedBy: string }
  | { type: 'expire'; submissionId: string; expiredBy: string }

// ---------------------------------------------------------------------------
// Programming item (what appears in the simulated programming view)
// ---------------------------------------------------------------------------

export interface SimulatedProgramItem {
  id: string
  title: string
  contentType: EditorialContentType
  campus: string
  startDate: string
  endDate: string
  status: 'active' | 'expired'
  // Visual preview thumbnail/placeholder
  thumbnail: string
  // Short description shown on TV
  tvDescription: string
}

// ---------------------------------------------------------------------------
// Fixtures – initial local state (never sent to backend)
// ---------------------------------------------------------------------------

export const initialEditorialSubmissions: EditorialSubmission[] = [
  {
    id: 'sub-001',
    createdAt: new Date().toISOString(),
    values: {
      contentType: 'event',
      title: 'Seminário de Inovação Tecnológica',
      campus: 'Piracicaba',
      startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      description: 'Seminário sobre tecnologias emergentes e desenvolvimento de software.',
      location: 'Auditório Principal',
      inscriptionInfo: 'Inscrições até 3 dias antes do evento',
      durationMinutes: 120,
      callToAction: 'Inscreva-se',
      hasCaptions: true,
      mediaReference: 'seminario-inovacao.mp4',
    },
    status: 'pending',
    lastActionBy: null,
    lastActionAt: new Date().toISOString(),
    campus: 'Piracicaba',
  },
  {
    id: 'sub-002',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    values: {
      contentType: 'informative',
      title: 'Campanha de Doação de Sangue',
      campus: 'Piracicaba',
      startDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      description: 'Campanha emergencial em parceria com Hemocentro local.',
      location: 'Frente ao Bloco A',
      inscriptionInfo: 'Não necessário',
      hasCaptions: false,
      mediaReference: 'doacao-sangue.jpg',
    },
    status: 'underReview',
    lastActionBy: 'prototype-user',
    lastActionAt: new Date().toISOString(),
    campus: 'Piracicaba',
  },
  {
    id: 'sub-003',
    createdAt: new Date().toISOString(),
    values: {
      contentType: 'video',
      title: 'Comercial Institucional',
      campus: 'Campinas',
      startDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      description: 'Apresentação dos laboratórios e corpos docentes.',
      durationMinutes: 90,
      callToAction: 'Saiba mais',
      hasCaptions: true,
      mediaReference: 'comercial-campinas.mp4',
    },
    status: 'pending',
    lastActionBy: null,
    lastActionAt: new Date().toISOString(),
    campus: 'Campinas',
  },
]

export const initialEditorialActions: EditorialAction[] = []

export const initialSimulatedProgram: SimulatedProgramItem[] = [
  // Only approved items appear here; expired/pending/rejected do not
  {
    id: 'prog-001',
    title: 'Palestra: Transformação Digital',
    contentType: 'event',
    campus: 'Piracicaba',
    startDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date(Date.now() + 17 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    status: 'active',
    thumbnail: '/placeholder-event.png',
    tvDescription: 'Seminário de Inovação Tecnológica — Auditório Principal',
  },
]

// ---------------------------------------------------------------------------
// Allowed status transitions (centralized)
// - pending          → underReview, rejected
// - underReview      → approved, adjustmentsRequested, rejected
// - adjustmentsRequested → approved, rejected (after resubmission)
// - rejected         → (resubmission required, new submission)
// - expired          → (no transition, stays expired)
// - approved         → (stays approved; can be manually expired if needed)
// ---------------------------------------------------------------------------

export const editorialAllowedTransitions: Record<
  EditorialSubmission['status'],
  EditorialSubmission['status'][]
> = {
  pending: ['underReview', 'rejected'],
  underReview: ['approved', 'adjustmentsRequested', 'rejected'],
  adjustmentsRequested: ['approved', 'rejected'],
  rejected: [], // requires new submission
  expired: [],
  approved: [], // stays approved (may be expired manually if desired)
}

// ---------------------------------------------------------------------------
// Helper: check if a transition is valid for the current status
// ---------------------------------------------------------------------------

export function canTransitionTo(
  from: EditorialSubmission['status'],
  to: EditorialSubmission['status'],
): boolean {
  // Only approved can stay in the same state; rejected and expired require new actions
  if (from === 'approved' && to === 'approved') return true
  return editorialAllowedTransitions[from]?.includes(to) ?? false
}

// ---------------------------------------------------------------------------
// Helper: check if an item is visible in the simulated programming
// ---------------------------------------------------------------------------

export function isProgramItemActive(item: SimulatedProgramItem): boolean {
  return item.status === 'active' && new Date(item.endDate).getTime() > Date.now()
}

// ---------------------------------------------------------------------------
// Helper: filter program items by campus
// ---------------------------------------------------------------------------

export function filterProgramByCampus(
  items: SimulatedProgramItem[],
  campus: string,
): SimulatedProgramItem[] {
  if (campus === 'Todos') {
    return items
  }
  return items.filter((item) => item.campus === campus)
}

// ---------------------------------------------------------------------------
// Helper: check if a submission is expired (end date passed)
// ---------------------------------------------------------------------------

export function isSubmissionExpired(submission: EditorialSubmission): boolean {
  return new Date(submission.values.endDate).getTime() < Date.now()
}

// ---------------------------------------------------------------------------
// Helper: check if a submission is within its display period
// ---------------------------------------------------------------------------

export function isSubmissionActive(submission: EditorialSubmission): boolean {
  const start = new Date(submission.values.startDate).getTime()
  const end = new Date(submission.values.endDate).getTime()
  return start <= Date.now() && Date.now() <= end
}