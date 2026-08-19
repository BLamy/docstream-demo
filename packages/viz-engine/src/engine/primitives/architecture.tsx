import type { ReactNode } from 'react';
import { ArchitectureEdge as RoutedEdge } from './architecture-edge';

export type ArchitectureTone =
  | 'blue'
  | 'green'
  | 'coral'
  | 'pink'
  | 'violet'
  | 'amber'
  | 'neutral';

export interface ArchitecturePoint {
  x: number;
  y: number;
}

export interface ArchitectureGridCell {
  label: string;
  tone?: ArchitectureTone;
  active?: number;
  status?: 'idle' | 'ready' | 'hot' | 'conflict';
}

const clamp01 = (u: number): number => (u < 0 ? 0 : u > 1 ? 1 : u);

const TONE = {
  blue: { line: '#5b86e5', fill: '#e7eefc', ink: '#345eb5' },
  green: { line: '#45a56f', fill: '#e4f2e8', ink: '#2e7e50' },
  coral: { line: '#ef775d', fill: '#fbe8e1', ink: '#bf503b' },
  pink: { line: '#d94879', fill: '#fae3ec', ink: '#a82f59' },
  violet: { line: '#7d83cc', fill: '#ecebfa', ink: '#565ca5' },
  amber: { line: '#d19b42', fill: '#fbf0d7', ink: '#986d22' },
  neutral: { line: '#a5a6a1', fill: '#f2f2ee', ink: '#5d5f5b' },
} as const;

const INK = '#2b2c2a';
const MUTED = '#858780';
const GRID = '#d8d9d3';
const PAPER = '#fbfbf8';

export function ArchitectureFrame({
  x = 0,
  y = 0,
  w,
  h,
  label,
  rightLabel,
  footer,
  u = 1,
  children,
}: {
  x?: number;
  y?: number;
  w: number;
  h: number;
  label?: string;
  rightLabel?: string;
  footer?: string;
  u?: number;
  children?: ReactNode;
}) {
  const reveal = clamp01(u);
  if (reveal <= 0) return null;
  return (
    <g opacity={reveal}>
      <rect x={x} y={y} width={w} height={h} rx={18} fill={PAPER} stroke="#c9cac4" strokeWidth={1.5} />
      {label && (
        <text x={x + 24} y={y + 34} fill={INK} fontSize={14} fontWeight={800} letterSpacing="0.12em">
          {label.toUpperCase()}
        </text>
      )}
      {rightLabel && (
        <text x={x + w - 24} y={y + 34} textAnchor="end" fill={MUTED} fontSize={12} fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
          {rightLabel.toUpperCase()}
        </text>
      )}
      <line x1={x + 22} y1={y + 50} x2={x + w - 22} y2={y + 50} stroke={GRID} strokeWidth={1} />
      {children}
      {footer && (
        <text x={x + w - 24} y={y + h - 18} textAnchor="end" fill={MUTED} fontSize={11} fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
          {footer}
        </text>
      )}
    </g>
  );
}

export function ArchitectureCard({
  x,
  y,
  w = 170,
  h = 58,
  label,
  meta,
  badge,
  tone = 'neutral',
  status,
  u = 1,
  dim = 0,
  dashed = false,
  children,
}: {
  x: number;
  y: number;
  w?: number;
  h?: number;
  label: string;
  meta?: string;
  badge?: string;
  tone?: ArchitectureTone;
  status?: 'ready' | 'warn' | 'offline' | 'conflict';
  u?: number;
  dim?: number;
  dashed?: boolean;
  children?: ReactNode;
}) {
  const reveal = clamp01(u);
  if (reveal <= 0) return null;
  const palette = TONE[tone];
  const statusColor = status === 'offline' || status === 'conflict' ? TONE.pink.line : status === 'warn' ? TONE.amber.line : palette.line;
  const opacity = reveal * (1 - 0.72 * clamp01(dim));
  const scale = 0.96 + 0.04 * reveal;
  return (
    <g transform={`translate(${x}, ${y}) scale(${scale})`} opacity={opacity}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={9} fill={palette.fill} stroke={statusColor} strokeWidth={1.5} strokeDasharray={dashed ? '5 4' : undefined} />
      <rect x={-w / 2} y={-h / 2} width={5} height={h} rx={2.5} fill={statusColor} />
      <text x={-w / 2 + 18} y={meta ? -3 : 5} fill={INK} fontSize={14} fontWeight={800} letterSpacing="0.04em">
        {label.toUpperCase()}
      </text>
      {meta && (
        <text x={-w / 2 + 18} y={17} fill={MUTED} fontSize={10.5} fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" letterSpacing="0.05em">
          {meta.toUpperCase()}
        </text>
      )}
      {badge && (
        <g transform={`translate(${w / 2 - 8}, ${-h / 2 + 8})`}>
          <rect x={-34} y={-10} width={34} height={18} rx={9} fill={PAPER} stroke={statusColor} strokeWidth={1} />
          <text x={-17} y={3} textAnchor="middle" fill={statusColor} fontSize={10} fontWeight={800} fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
            {badge}
          </text>
        </g>
      )}
      {status && (
        <circle cx={w / 2 - 14} cy={h / 2 - 13} r={3.5} fill={statusColor} />
      )}
      {children}
    </g>
  );
}

export function ArchitectureEdge({
  from,
  to,
  via,
  label,
  tone = 'neutral',
  u = 1,
  flow = 0,
  dashed = false,
  arrow = true,
  dim = 0,
}: {
  from: ArchitecturePoint;
  to: ArchitecturePoint;
  via?: ArchitecturePoint[];
  label?: string;
  tone?: ArchitectureTone;
  u?: number;
  flow?: number;
  dashed?: boolean;
  arrow?: boolean;
  dim?: number;
}) {
  return (
    <RoutedEdge
      from={from}
      to={to}
      via={via}
      label={label}
      color={TONE[tone].line}
      labelColor={TONE[tone].ink}
      labelFill={PAPER}
      u={u}
      flow={flow}
      dashed={dashed}
      arrow={arrow}
      dim={dim}
    />
  );
}

export function ArchitectureGrid({
  x,
  y,
  columns,
  rows,
  cells,
  cellW = 82,
  cellH = 38,
  gap = 6,
  u = 1,
  dim = 0,
}: {
  x: number;
  y: number;
  columns: number;
  rows: number;
  cells: ArchitectureGridCell[];
  cellW?: number;
  cellH?: number;
  gap?: number;
  u?: number;
  dim?: number;
}) {
  const reveal = clamp01(u);
  if (reveal <= 0) return null;
  return (
    <g opacity={reveal * (1 - 0.72 * clamp01(dim))}>
      {Array.from({ length: columns * rows }, (_, i) => {
        const cell = cells[i] ?? { label: '' };
        const col = i % columns;
        const row = Math.floor(i / columns);
        const palette = TONE[cell.tone ?? 'neutral'];
        const hot = cell.status === 'hot' || cell.status === 'conflict';
        const statusColor = cell.status === 'conflict' ? TONE.pink.line : hot ? palette.line : '#d2d3ce';
        const cellU = clamp01(reveal * (columns * rows + 3) - i) * 1;
        return (
          <g key={`${cell.label}-${i}`} transform={`translate(${x + col * (cellW + gap)}, ${y + row * (cellH + gap)})`} opacity={cellU}>
            <rect width={cellW} height={cellH} rx={6} fill={hot ? palette.fill : '#f5f5f1'} stroke={statusColor} strokeWidth={hot ? 1.35 : 0.8} />
            <text x={10} y={16} fill={hot ? palette.ink : MUTED} fontSize={10.5} fontWeight={hot ? 800 : 600} fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
              {cell.label}
            </text>
            {cell.active !== undefined && (
              <g transform={`translate(${cellW - 28}, ${cellH / 2 - 4})`}>
                {Array.from({ length: 4 }, (_, j) => (
                  <rect key={j} x={j * 6} width={4} height={8} rx={1} fill={j < cell.active! ? palette.line : '#d7d8d2'} />
                ))}
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}

export function ArchitecturePhaseRail({
  x,
  y,
  w,
  phases,
  active = 0,
  u = 1,
}: {
  x: number;
  y: number;
  w: number;
  phases: string[];
  active?: number;
  u?: number;
}) {
  const reveal = clamp01(u);
  if (reveal <= 0 || phases.length === 0) return null;
  const itemW = w / phases.length;
  return (
    <g opacity={reveal}>
      {phases.map((phase, i) => {
        const selected = i === active;
        return (
          <g key={phase} transform={`translate(${x + i * itemW}, ${y})`}>
            <rect width={itemW - 1} height={42} fill={selected ? TONE.coral.fill : '#f1f1ed'} stroke={selected ? TONE.coral.line : GRID} strokeWidth={selected ? 1.5 : 0.8} />
            <text x={itemW / 2} y={25} textAnchor="middle" fill={selected ? TONE.coral.ink : MUTED} fontSize={11} fontWeight={selected ? 800 : 600} letterSpacing="0.04em">
              {`${i + 1} · ${phase}`.toUpperCase()}
            </text>
          </g>
        );
      })}
    </g>
  );
}
