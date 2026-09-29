import { apiClient, unwrap } from './client'
import type { RedFlagCascadeItem, RelationshipGraph, SimulationResult } from '@/types'

export function getRelationshipGraph(tenderId: string) {
  return unwrap<RelationshipGraph>(apiClient.get(`/api/v1/cross-bidder/graph/${tenderId}`))
}

export function getRedFlagCascade(bidderId: string, tenderId: string) {
  return unwrap<RedFlagCascadeItem[]>(apiClient.get(`/api/v1/red-flag-cascade/${bidderId}/${tenderId}`))
}

export interface SimulateOverride {
  requirement_id: string
  threshold?: number
  is_mandatory?: boolean
  weight?: number
}

export function runSimulation(tenderId: string, overrides: SimulateOverride[], bidderIds?: string[]) {
  return unwrap<SimulationResult>(
    apiClient.post(`/api/v1/simulator/${tenderId}`, { overrides, bidder_ids: bidderIds ?? null }),
  )
}

export interface CopilotAnswer {
  answer: string
  evidence: string[]
  question: string
  disclaimer: string
}

export function askCopilot(bidderId: string, tenderId: string, question: string, compareBidderId?: string) {
  return unwrap<CopilotAnswer>(
    apiClient.post('/api/v1/copilot/ask', { bidder_id: bidderId, tender_id: tenderId, question, compare_bidder_id: compareBidderId }),
  )
}
