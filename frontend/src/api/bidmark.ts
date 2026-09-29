import { apiClient } from './client'
import type { ApiEnvelope } from '@/types'
import type { BidmarkAnalysis, BidmarkSummary, BidmarkTenderSummaryRow } from '@/types/bidmark'

export async function runAnalysis(bidderId: string, tenderId: string): Promise<BidmarkAnalysis> {
  const res = await apiClient.post<ApiEnvelope<BidmarkAnalysis>>(
    `/api/v1/bidmark/analyse/${bidderId}/${tenderId}`,
  )
  return res.data.data
}

export async function getResult(bidderId: string, tenderId: string): Promise<BidmarkAnalysis> {
  const res = await apiClient.get<ApiEnvelope<BidmarkAnalysis>>(
    `/api/v1/bidmark/result/${bidderId}/${tenderId}`,
  )
  return res.data.data
}

export async function getBidderSummary(bidderId: string, tenderId: string): Promise<BidmarkSummary> {
  const res = await apiClient.get<ApiEnvelope<BidmarkSummary>>(
    `/api/v1/bidmark/result/${bidderId}/${tenderId}`,
  )
  return res.data.data as unknown as BidmarkSummary
}

export async function getTenderSummary(tenderId: string): Promise<BidmarkTenderSummaryRow[]> {
  const res = await apiClient.get<ApiEnvelope<BidmarkTenderSummaryRow[]>>(
    `/api/v1/bidmark/summary/${tenderId}`,
  )
  return res.data.data
}
