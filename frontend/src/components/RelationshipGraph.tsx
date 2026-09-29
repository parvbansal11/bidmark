import { useMemo } from 'react'
import type { RelationshipGraph as RelationshipGraphType } from '@/types'

const EDGE_COLORS: Record<string, string> = {
  PARTICIPATES_IN: '#cbd5e1',
  SAME_ADDRESS: '#f59e0b',
  DOCUMENT_SIMILARITY: '#ef4444',
  SHARED_DIRECTOR: '#8b5cf6',
  SIMILAR_PRICING: '#0ea5e9',
  SYNCHRONIZED_SUBMISSION: '#ec4899',
}

export function RelationshipGraph({ graph }: { graph: RelationshipGraphType }) {
  const size = 420
  const radius = 160
  const center = size / 2

  const positions = useMemo(() => {
    const map: Record<string, { x: number; y: number }> = {}
    const n = graph.nodes.length || 1
    graph.nodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2
      map[node.id] = { x: center + radius * Math.cos(angle), y: center + radius * Math.sin(angle) }
    })
    return map
  }, [graph.nodes, center])

  if (!graph.nodes.length) {
    return <p className="text-sm text-slate-500">No bidders linked to this tender yet.</p>
  }

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${size} ${size}`} className="mx-auto max-w-md">
        {graph.edges.map((edge, i) => {
          const a = positions[edge.source]
          const b = positions[edge.target]
          if (!a || !b) return null
          const color = EDGE_COLORS[edge.type] ?? '#cbd5e1'
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={color}
              strokeWidth={edge.type === 'PARTICIPATES_IN' ? 1 : 2}
              strokeDasharray={edge.type === 'PARTICIPATES_IN' ? '3,3' : undefined}
              opacity={0.7}
            >
              <title>{edge.evidence ?? edge.type}</title>
            </line>
          )
        })}
        {graph.nodes.map((node) => {
          const pos = positions[node.id]
          const isTender = node.type === 'TENDER'
          return (
            <g key={node.id} transform={`translate(${pos.x}, ${pos.y})`}>
              <circle r={isTender ? 14 : 10} fill={isTender ? '#1e293b' : '#2563eb'} stroke="#fff" strokeWidth={2} />
              <text y={isTender ? 28 : 22} textAnchor="middle" fontSize={10} fill="#334155">
                {node.label.length > 16 ? `${node.label.slice(0, 14)}…` : node.label}
              </text>
            </g>
          )
        })}
      </svg>
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-500">
        {Object.entries(EDGE_COLORS).map(([type, color]) => (
          <span key={type} className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
            {type.replace(/_/g, ' ')}
          </span>
        ))}
      </div>
      <p className="mt-2 text-[11px] italic text-slate-400">{graph.disclaimer}</p>
    </div>
  )
}
