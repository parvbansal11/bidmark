import { get, getBlob, patch, post, put } from '@/app/lib/api'
import { telemetryHeaders, type FormSignals } from '@/app/lib/telemetry'
import type {
  AuditEntry, Bidder, BidderCase, BidderEvaluation, BidSubmission, CaseDetail, ChainStatus, Clarification,
  CopilotAnswer, CopilotStatus, Decision, DocumentEvidence, DocumentRecord, Home, Notification, PortalRequirementStatus,
  PortalTender, QueueRow, Requirement, Role, RuleReliability, Tender, TenderIntelligence, TimelineEvent, User,
} from './types'

export * from './types'

export const auth = {
  async login(email: string, password: string, signals?: FormSignals) {
    const headers = await telemetryHeaders(signals)
    return post<{ access_token: string; token_type: string; user: User }>('/auth/login', { email, password }, { headers })
  },
  register(body: { email: string; password: string; full_name: string; company_name: string }) {
    return post<User>('/auth/register', { ...body, role: 'BIDDER' })
  },
  me: () => get<User>('/auth/me'),
}

export const home = () => get<Home>('/home')

export const cases = {
  queue: (tenderId?: string) => get<QueueRow[]>('/cases/queue', { params: tenderId ? { tender_id: tenderId } : undefined }),
  get: (id: string) => get<CaseDetail>(`/cases/${id}`),
  mine: () => get<BidderCase[]>('/cases/mine'),
  startReview: (id: string) => post<CaseDetail>(`/cases/${id}/start-review`),
  rescreen: (id: string) => post<CaseDetail>(`/cases/${id}/screen`),
  dispose: (id: string, findingId: string, outcome: 'UPHELD' | 'DISMISSED', note: string) =>
    post(`/cases/${id}/dispositions`, { finding_id: findingId, outcome, note }),
  clarify: (id: string, body: { question: string; finding_id?: string | null; requested_category?: string | null; due_days: number }) =>
    post<Clarification>(`/cases/${id}/clarifications`, body),
  decide: (id: string, decision: Decision, reason: string) => post<CaseDetail>(`/cases/${id}/decision`, { decision, reason }),
  reopen: (id: string, reason: string) => post<CaseDetail>(`/cases/${id}/reopen`, { reason }),
  timeline: (id: string) => get<{ chain: ChainStatus; events: TimelineEvent[] }>(`/cases/${id}/timeline`),
}

export const clarifications = {
  answer: (id: string, text: string, documentId?: string | null) =>
    post<Clarification>(`/clarifications/${id}/answer`, { text, document_id: documentId ?? null }),
}

export const tenders = {
  list: () => get<Tender[]>('/tenders'),
  get: (id: string) => get<Tender>(`/tenders/${id}`),
  requirements: (id: string) => get<Requirement[]>(`/tenders/${id}/requirements`),
  bidders: (id: string) => get<Bidder[]>(`/tenders/${id}/bidders`),
  intelligence: (id: string) => get<TenderIntelligence>(`/tenders/${id}/intelligence`),
  addRequirement: (id: string, body: Omit<Requirement, 'id' | 'tender_id'>) => post<Requirement>(`/tenders/${id}/requirements`, body),
  update: (id: string, body: Partial<Tender>) => put<Tender>(`/tenders/${id}`, body),
}

export const bids = {
  get: (tenderId: string, bidderId: string) => get<BidSubmission>(`/tenders/${tenderId}/bidders/${bidderId}/bid-submission`),
  async submit(tenderId: string, bidderId: string, body: { quoted_price: number; local_content_percent: number; declared_turnover_crore: number }, signals?: FormSignals) {
    const headers = await telemetryHeaders(signals)
    return post<BidSubmission>(`/tenders/${tenderId}/bidders/${bidderId}/bid-submission`, body, { headers })
  },
}

export const bidders = {
  get: (id: string) => get<Bidder>(`/bidders/${id}`),
  documents: (id: string) => get<DocumentRecord[]>(`/bidders/${id}/documents`),
  evaluation: (bidderId: string, tenderId: string) => get<BidderEvaluation>(`/dashboard/bidders/${bidderId}/${tenderId}`),
  updateContact: (id: string, body: Partial<Pick<Bidder, 'contact_email' | 'contact_phone' | 'website'>>) => put<Bidder>(`/bidders/${id}`, body),
  async upload(bidderId: string, category: string, file: File, tenderId?: string) {
    const form = new FormData()
    form.append('category', category)
    form.append('file', file)
    if (tenderId) form.append('tender_id', tenderId)
    const headers = await telemetryHeaders()
    return post<DocumentRecord>(`/bidders/${bidderId}/documents`, form, { headers })
  },
}

export const evidence = {
  document: (id: string) => get<DocumentEvidence>(`/documents/${id}/evidence`),
  pageImage: (id: string, page: number) => getBlob(`/documents/${id}/pages/${page}.png?scale=2`),
  file: (id: string) => getBlob(`/documents/${id}/file`),
}

export const audit = {
  chain: () => get<ChainStatus>('/audit/chain/verify'),
  feed: (params: { limit?: number; action?: string } = {}) => get<AuditEntry[]>('/audit/feed', { params: { limit: 200, ...params } }),
}

export const rules = {
  reliability: () => get<RuleReliability[]>('/rules/reliability'),
}

export const copilot = {
  status: () => get<CopilotStatus>('/copilot/status'),
  ask: (bidderId: string, tenderId: string, question: string) =>
    post<CopilotAnswer>('/copilot/ask', { bidder_id: bidderId, tender_id: tenderId, question }),
}

export const portal = {
  profile: () => get<Bidder>('/portal/profile'),
  tenders: () => get<PortalTender[]>('/portal/tenders'),
  compliance: (tenderId: string) =>
    get<{ tender_id: string; requirements: PortalRequirementStatus[] }>(`/portal/compliance/${tenderId}`),
  notifications: () => get<Notification[]>('/portal/notifications'),
  markRead: (id: string) => post(`/portal/notifications/${id}/read`),
  requestCorrection: (body: { field: string; requested_value: string; reason: string }) => post('/portal/profile/request-correction', body),
}

export const users = {
  list: () => get<User[]>('/users'),
  create: (body: { email: string; password: string; full_name: string; role: Role }) => post<User>('/users', body),
  update: (id: string, body: { is_active?: boolean; role?: Role }) => patch<User>(`/users/${id}`, body),
}
