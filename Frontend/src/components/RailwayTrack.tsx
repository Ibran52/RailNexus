import React from 'react';

interface StationNode {
  name: string;
  code: string;
  isJunction?: boolean;
}

interface TrackBlock {
  id: string;
  department: 'ENGINEERING' | 'SNT' | 'OHE' | string;
  fromStationIndex: number;
  toStationIndex: number;
  startPercent?: number;
  widthPercent?: number;
  label?: string;
  timeWindow?: string;
  isRecommended?: boolean;
}

interface TrackTrain {
  trainNumber: string | number;
  positionPercent: number; // 0 - 100%
  direction: 'UP' | 'DOWN';
  status?: 'ON_TIME' | 'DELAYED' | 'HELD';
  delayMinutes?: number;
}

interface TrackConflict {
  positionPercent: number;
  trainNumber?: string | number;
  description?: string;
}

interface RailwayTrackProps {
  stations?: StationNode[];
  blocks?: TrackBlock[];
  trains?: TrackTrain[];
  conflicts?: TrackConflict[];
  title?: string;
  subtitle?: string;
  directionLabel?: string;
  highlightWindow?: string;
  height?: number;
}

export const RailwayTrack: React.FC<RailwayTrackProps> = ({
  stations = [],
  blocks = [],
  trains = [],
  conflicts = [],
  title,
  subtitle,
  directionLabel = 'UP LINE · CORRIDOR DIRECTION →',
  highlightWindow,
  height = 90,
}) => {
  const departmentColors: Record<string, { bg: string; border: string; text: string }> = {
    ENGINEERING: { bg: 'rgba(245, 158, 11, 0.85)', border: '#D97706', text: '#FFFFFF' },
    SNT: { bg: 'rgba(16, 185, 129, 0.85)', border: '#059669', text: '#FFFFFF' },
    OHE: { bg: 'rgba(37, 99, 235, 0.85)', border: '#1D4ED8', text: '#FFFFFF' },
    COORDINATED: { bg: 'rgba(16, 185, 129, 0.95)', border: '#047857', text: '#FFFFFF' },
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-subtle select-none">
      {/* Header */}
      {(title || subtitle || highlightWindow) && (
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3 text-xs">
          <div>
            {title && <h4 className="font-bold text-slate-800 tracking-wide">{title}</h4>}
            {subtitle && <p className="text-[11px] text-slate-500">{subtitle}</p>}
          </div>
          {highlightWindow && (
            <div className="flex items-center space-x-2">
              <span className="text-[11px] text-slate-500 font-mono">COORDINATED BLOCK:</span>
              <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold border border-emerald-300 font-mono">
                {highlightWindow}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Track SVG Rendering */}
      <div className="relative w-full" style={{ height: `${height}px` }}>
        <svg className="w-full h-full" viewBox="0 0 1000 100" preserveAspectRatio="none">
          {/* Sleepers (cross-ties) */}
          {Array.from({ length: 100 }).map((_, i) => (
            <line
              key={`sleeper-${i}`}
              x1={i * 10 + 5}
              y1="40"
              x2={i * 10 + 5}
              y2="60"
              stroke="#CBD5E1"
              strokeWidth="2"
            />
          ))}

          {/* Top Rail */}
          <line x1="0" y1="44" x2="1000" y2="44" stroke="#1E293B" strokeWidth="2.5" />
          {/* Bottom Rail */}
          <line x1="0" y1="56" x2="1000" y2="56" stroke="#1E293B" strokeWidth="2.5" />

          {/* Maintenance Blocks */}
          {blocks.map((b, idx) => {
            const startPct =
              b.startPercent !== undefined
                ? b.startPercent
                : (b.fromStationIndex / Math.max(stations.length - 1, 1)) * 100;
            const widthPct =
              b.widthPercent !== undefined
                ? b.widthPercent
                : ((b.toStationIndex - b.fromStationIndex) / Math.max(stations.length - 1, 1)) * 100;

            const x = (startPct / 100) * 1000;
            const w = Math.max((widthPct / 100) * 1000, 30);
            const deptConfig = departmentColors[b.department] || departmentColors.ENGINEERING;

            return (
              <g key={`block-${b.id || idx}`}>
                <rect
                  x={x}
                  y="36"
                  width={w}
                  height="28"
                  rx="3"
                  fill={deptConfig.bg}
                  stroke={deptConfig.border}
                  strokeWidth="1.5"
                />
                <text
                  x={x + w / 2}
                  y="54"
                  fill={deptConfig.text}
                  fontSize="9"
                  fontWeight="bold"
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  {b.label || `${b.department} BLOCK`}
                </text>
              </g>
            );
          })}

          {/* Station Nodes */}
          {stations.map((st, idx) => {
            const cx = (idx / Math.max(stations.length - 1, 1)) * 1000;
            const isFirst = idx === 0;
            const isLast = idx === stations.length - 1;
            const textAnchor = isFirst ? 'start' : isLast ? 'end' : 'middle';

            return (
              <g key={`st-${st.code}-${idx}`}>
                {/* Station Node Circle */}
                <circle
                  cx={cx}
                  cy="50"
                  r={st.isJunction ? '6' : '4.5'}
                  fill="#FFFFFF"
                  stroke="#0B192C"
                  strokeWidth="2.5"
                />
                {st.isJunction && (
                  <circle cx={cx} cy="50" r="2.5" fill="#2563EB" />
                )}

                {/* Station code & name */}
                <text
                  x={cx}
                  y="82"
                  fill="#1E293B"
                  fontSize="10"
                  fontWeight="bold"
                  fontFamily="monospace"
                  textAnchor={textAnchor}
                >
                  {st.code}
                </text>
                <text
                  x={cx}
                  y="94"
                  fill="#64748B"
                  fontSize="8"
                  fontFamily="sans-serif"
                  textAnchor={textAnchor}
                >
                  {st.name} {st.isJunction ? '(Jct)' : ''}
                </text>
              </g>
            );
          })}

          {/* Train Icons */}
          {trains.map((tr, idx) => {
            const x = (tr.positionPercent / 100) * 1000;
            const isDelayed = tr.status === 'DELAYED' || (tr.delayMinutes && tr.delayMinutes > 0);
            const fill = isDelayed ? '#EF4444' : '#2563EB';

            return (
              <g key={`train-${tr.trainNumber}-${idx}`} transform={`translate(${x - 14}, 16)`}>
                <rect x="0" y="0" width="28" height="15" rx="3" fill={fill} />
                <polygon points="28,4 33,7.5 28,11" fill={fill} />
                <circle cx="6" cy="15" r="2.5" fill="#0B192C" />
                <circle cx="22" cy="15" r="2.5" fill="#0B192C" />
                <text
                  x="14"
                  y="11"
                  fill="#FFFFFF"
                  fontSize="8"
                  fontWeight="bold"
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  {tr.trainNumber}
                </text>
              </g>
            );
          })}

          {/* Conflicts */}
          {conflicts.map((c, idx) => {
            const cx = (c.positionPercent / 100) * 1000;
            return (
              <g key={`conflict-${idx}`} transform={`translate(${cx}, 70)`}>
                <circle cx="0" cy="0" r="8" fill="#FEF2F2" stroke="#EF4444" strokeWidth="2" />
                <line x1="-4" y1="-4" x2="4" y2="4" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" />
                <line x1="4" y1="-4" x2="-4" y2="4" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" />
                <text x="0" y="16" fill="#EF4444" fontSize="8" fontWeight="bold" textAnchor="middle">
                  CONFLICT
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Bottom Direction & Legend Strip */}
      <div className="flex items-center justify-between text-[10px] text-slate-500 pt-2 border-t border-slate-100 mt-2">
        <span className="font-mono tracking-wider text-slate-400">{directionLabel}</span>
        <div className="flex items-center space-x-4">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" /> Engineering
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> S&T
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-600 inline-block" /> Traction/OHE
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full border border-rose-500 text-rose-500 font-bold inline-flex items-center justify-center text-[9px]">
              ✕
            </span>{' '}
            Conflict
          </span>
        </div>
      </div>
    </div>
  );
};
