import { useMemo } from 'react';
import type { ScoreDefinition } from './types';

interface MiniCanvasPreviewProps {
  score: ScoreDefinition;
  width?: number | string;
  height?: number | string;
  className?: string;
}

export function MiniCanvasPreview({
  score,
  width = '100%',
  height = '100%',
  className = '',
}: MiniCanvasPreviewProps) {
  const { viewBox, nodes, edges } = useMemo(() => {
    const terminals = score.nodes.terminals ?? [];
    const notes = score.nodes.notes ?? [];
    const portals = score.nodes.portals ?? [];
    const allEdges = score.edges ?? [];

    const allItems: Array<{
      id: string;
      kind: 'terminal' | 'note' | 'portal';
      name: string;
      x: number;
      y: number;
      w: number;
      h: number;
      agent?: string;
      persona?: string | null;
      color?: string;
    }> = [];

    for (const t of terminals) {
      allItems.push({
        id: t.name,
        kind: 'terminal',
        name: t.name,
        x: t.position?.x ?? 0,
        y: t.position?.y ?? 0,
        w: t.size?.width ?? 280,
        h: t.size?.height ?? 180,
        agent: t.agent,
        persona: t.persona,
      });
    }

    for (const n of notes) {
      allItems.push({
        id: n.name,
        kind: 'note',
        name: n.name,
        x: n.position?.x ?? 0,
        y: n.position?.y ?? 0,
        w: n.size?.width ?? 240,
        h: n.size?.height ?? 160,
      });
    }

    for (const p of portals) {
      allItems.push({
        id: p.name ?? p.id ?? 'portal',
        kind: 'portal',
        name: p.name ?? 'Portal',
        x: p.position?.x ?? 0,
        y: p.position?.y ?? 0,
        w: p.size?.width ?? 320,
        h: p.size?.height ?? 220,
      });
    }

    if (allItems.length === 0) {
      return {
        viewBox: '0 0 400 300',
        nodes: [],
        edges: [],
      };
    }

    // Calcula bounding box
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const item of allItems) {
      if (item.x < minX) minX = item.x;
      if (item.y < minY) minY = item.y;
      if (item.x + item.w > maxX) maxX = item.x + item.w;
      if (item.y + item.h > maxY) maxY = item.y + item.h;
    }

    const padding = 60;
    const boxX = minX - padding;
    const boxY = minY - padding;
    const boxW = Math.max(200, maxX - minX + padding * 2);
    const boxH = Math.max(150, maxY - minY + padding * 2);

    const nodeCenterMap = new Map<string, { x: number; y: number }>();
    for (const item of allItems) {
      nodeCenterMap.set(item.id, {
        x: item.x + item.w / 2,
        y: item.y + item.h / 2,
      });
    }

    const computedEdges: Array<{
      source: string;
      target: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    }> = [];

    for (const edge of allEdges) {
      const src = edge.source ?? edge.a ?? '';
      const tgt = edge.target ?? edge.b ?? '';
      const c1 = nodeCenterMap.get(src);
      const c2 = nodeCenterMap.get(tgt);
      if (c1 && c2) {
        computedEdges.push({
          source: src,
          target: tgt,
          x1: c1.x,
          y1: c1.y,
          x2: c2.x,
          y2: c2.y,
        });
      }
    }

    return {
      viewBox: `${boxX} ${boxY} ${boxW} ${boxH}`,
      nodes: allItems,
      edges: computedEdges,
    };
  }, [score]);

  return (
    <div
      className={`mini-canvas-preview ${className}`}
      style={{
        width,
        height,
        background: '#0d1117',
        borderRadius: 8,
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      data-testid="mini-canvas-preview"
    >
      <svg
        viewBox={viewBox}
        style={{ width: '100%', height: '100%', display: 'block' }}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <pattern id="grid-dots" width="40" height="40" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.5" fill="#ffffff08" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid-dots)" />

        {/* Conexões (Arestas) */}
        {edges.map((e, idx) => (
          <line
            key={`edge-${idx}`}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            stroke="#f2a33a"
            strokeWidth="2.5"
            strokeOpacity="0.45"
            strokeDasharray="6 4"
          />
        ))}

        {/* Nós do Canvas */}
        {nodes.map((node) => {
          if (node.kind === 'note') {
            return (
              <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
                <rect
                  width={node.w}
                  height={node.h}
                  rx="6"
                  fill="#fef08a"
                  fillOpacity="0.9"
                  stroke="#ca8a04"
                  strokeWidth="2"
                />
                <text
                  x="12"
                  y="22"
                  fill="#713f12"
                  fontSize="10"
                  fontWeight="600"
                  fontFamily="system-ui, sans-serif"
                >
                  {node.name}
                </text>
                <line x1="12" y1="34" x2={node.w - 16} y2="34" stroke="#a16207" strokeWidth="2" strokeOpacity="0.5" />
                <line x1="12" y1="46" x2={node.w - 30} y2="46" stroke="#a16207" strokeWidth="2" strokeOpacity="0.4" />
                <line x1="12" y1="58" x2={node.w - 50} y2="58" stroke="#a16207" strokeWidth="2" strokeOpacity="0.3" />
              </g>
            );
          }

          if (node.kind === 'portal') {
            return (
              <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
                <rect
                  width={node.w}
                  height={node.h}
                  rx="6"
                  fill="#161e2e"
                  stroke="#3b82f6"
                  strokeWidth="2"
                  strokeOpacity="0.8"
                />
                <rect width={node.w} height="22" rx="6" fill="#1e293b" />
                <circle cx="10" cy="11" r="3.5" fill="#ef4444" />
                <circle cx="20" cy="11" r="3.5" fill="#f59e0b" />
                <circle cx="30" cy="11" r="3.5" fill="#10b981" />
                <rect x="42" y="6" width={node.w - 54} height="10" rx="3" fill="#334155" />
              </g>
            );
          }

          // Terminal
          return (
            <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
              <rect
                width={node.w}
                height={node.h}
                rx="6"
                fill="#161a21"
                stroke="#30363d"
                strokeWidth="2"
              />
              <rect width={node.w} height="22" rx="6" fill="#0d1117" />
              <circle cx="10" cy="11" r="3.5" fill="#f2a33a" />
              <text
                x="20"
                y="14"
                fill="#8b949e"
                fontSize="10"
                fontFamily="system-ui, sans-serif"
                fontWeight="500"
              >
                {node.name.length > 20 ? `${node.name.slice(0, 18)}…` : node.name}
              </text>
              {node.persona ? (
                <g transform={`translate(${node.w - 75}, 4)`}>
                  <rect width="70" height="14" rx="7" fill="#6366f125" stroke="#6366f1" strokeWidth="1" />
                  <text x="35" y="10" fill="#a5b4fc" fontSize="8" textAnchor="middle" fontWeight="bold">
                    {node.persona.length > 10 ? `${node.persona.slice(0, 9)}…` : node.persona}
                  </text>
                </g>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
