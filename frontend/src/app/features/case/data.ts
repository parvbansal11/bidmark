import { toApiError, type ApiError } from '@/app/lib/api'
import { useResource } from '@/app/lib/useResource'
import {
  bidders, bids, cases, tenders,
  type Bidder, type BidderEvaluation, type BidSubmission, type CaseDetail, type DocumentRecord, type QueueRow, type Requirement, type Role, type Tender,
} from '@/app/services/bidmark'

export type Part<T> = { ok: true; value: T } | { ok: false; error: ApiError }

async function part<T>(p: Promise<T>): Promise<Part<T>> {
  try {
    return { ok: true, value: await p }
  } catch (e) {
    return { ok: false, error: toApiError(e) }
  }
}

export const canEvaluate = (role: Role) => role === 'PROCUREMENT_OFFICER' || role === 'ADMIN'

export function useCase(caseId: string | undefined) {
  return useResource(caseId ? `case:${caseId}` : null, () => cases.get(caseId!))
}

export function useCaseContext(c: CaseDetail | undefined, role: Role) {
  const bidder = useResource(c ? `bidder:${c.bidder_id}` : null, () => bidders.get(c!.bidder_id))
  const tender = useResource(c ? `tender:${c.tender_id}` : null, () => tenders.get(c!.tender_id))
  const requirements = useResource(c ? `requirements:${c.tender_id}` : null, () => tenders.requirements(c!.tender_id))
  const documents = useResource(c ? `documents:${c.bidder_id}` : null, () => bidders.documents(c!.bidder_id))
  const bid = useResource(c ? `bid:${c.tender_id}:${c.bidder_id}` : null, () => bids.get(c!.tender_id, c!.bidder_id))
  const evaluation = useResource(c && canEvaluate(role) ? `evaluation:${c.bidder_id}:${c.tender_id}` : null,
    () => bidders.evaluation(c!.bidder_id, c!.tender_id))
  return { bidder, tender, requirements, documents, bid, evaluation }
}

export interface BoardRow {
  queue: QueueRow
  detail: Part<CaseDetail>
  bidder: Part<Bidder>
  documents: Part<DocumentRecord[]>
  bid: Part<BidSubmission>
  evaluation: Part<BidderEvaluation> | null
}

export interface Board {
  tender: Tender
  requirements: Requirement[]
  rows: BoardRow[]
}

export function useTenderBoard(tenderId: string | undefined, role: Role) {
  return useResource<Board>(tenderId ? `board:${tenderId}` : null, async () => {
    const [tender, requirements, queue] = await Promise.all([
      tenders.get(tenderId!), tenders.requirements(tenderId!), cases.queue(tenderId!),
    ])
    const rows = await Promise.all(queue.map(async q => {
      const [detail, bidder, documents, bid, evaluation] = await Promise.all([
        part(cases.get(q.case_id)),
        part(bidders.get(q.bidder_id)),
        part(bidders.documents(q.bidder_id)),
        part(bids.get(q.tender_id, q.bidder_id)),
        canEvaluate(role) ? part(bidders.evaluation(q.bidder_id, q.tender_id)) : Promise.resolve(null),
      ])
      return { queue: q, detail, bidder, documents, bid, evaluation }
    }))
    return { tender, requirements, rows }
  })
}

export const valueOf = <T,>(p: Part<T> | null | undefined): T | null => (p && p.ok ? p.value : null)
