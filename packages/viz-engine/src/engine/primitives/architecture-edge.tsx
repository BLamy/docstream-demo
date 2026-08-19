import { useMemo } from 'react';
import type { Pt } from './connection';
import { pointAlong, polylineLength } from './connection';

const clamp01 = (u: number): number => (u < 0 ? 0 : u > 1 ? 1 : u);

function routePoints(from: Pt, to: Pt, via: Pt[] | undefined): Pt[] {
  return via?.length ? [from, ...via, to] : [from, to];
}

export function ArchitectureEdge({
  from,
  to,
  via,
  label,
  color,
  labelColor,
  labelFill,
  u = 1,
  flow = 0,
  dashed = false,
  arrow = true,
  dim = 0,
}: {
  from: Pt;
  to: Pt;
  via?: Pt[];
  label?: string;
  color: string;
  labelColor: string;
  labelFill: string;
  u?: number;
  flow?: number;
  dashed?: boolean;
  arrow?: boolean;
  dim?: number;
}) {
  const uu = clamp01(u);
  const viaKey = via?.map((p) => `${p.x},${p.y}`).join(';') ?? '';
  const points = useMemo(() => routePoints(from, to, via), [from.x, from.y, to.x, to.y, viaKey]);
  const total = useMemo(() => polylineLength(points), [points]);
  if (uu <= 0 || total <= 0) return null;
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const alpha = 1 - 0.72 * clamp01(dim);
  const tip = pointAlong(points, 1);
  const mid = pointAlong(points, 0.5);
  return (
    <g opacity={alpha}>
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeDasharray={dashed ? '5 5' : total} strokeDashoffset={dashed ? 0 : total * (1 - uu)} opacity={dashed ? uu : 0.84} />
      {flow > 0 && uu >= 0.98 && (
        <path d={d} fill="none" stroke={color} strokeWidth={3.2} strokeLinecap="round" strokeDasharray="2 12" strokeDashoffset={-flow * 30} opacity={0.82} />
      )}
      {arrow && uu >= 0.98 && (
        <polygon points="0,0 -8,4 -8,-4" transform={`translate(${tip.x}, ${tip.y}) rotate(${(tip.angle * 180) / Math.PI})`} fill={color} />
      )}
      {label && uu >= 0.72 && (
        <g transform={`translate(${mid.x}, ${mid.y})`} opacity={clamp01(uu * 3 - 2)}>
          <rect x={-label.length * 3.1 - 8} y={-10} width={label.length * 6.2 + 16} height={20} rx={10} fill={labelFill} stroke={color} strokeWidth={0.8} />
          <text y={4} textAnchor="middle" fill={labelColor} fontSize={10.5} fontWeight={700} fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
            {label}
          </text>
        </g>
      )}
    </g>
  );
}
