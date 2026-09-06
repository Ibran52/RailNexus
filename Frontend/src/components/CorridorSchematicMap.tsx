import React, { useState, useMemo } from 'react';
import { CorridorSection, MaintenanceRequest, RequestStatus } from '../types';
import {
  Maximize2,
  Minimize2,
  RotateCcw,
  Info,
  Radio,
  AlertCircle,
  Clock,
  Layers,
  CheckCircle2,
} from 'lucide-react';

interface CorridorSchematicMapProps {
  sections?: CorridorSection[];
  requests?: MaintenanceRequest[];
  title?: string;
  className?: string;
}

// Verified contiguous stations order on the Central Railway Mumbai-Pune corridor
const VERIFIED_CORRIDOR_ORDER = [
  'MLND',
  'TNA',
  'KLVA',
  'MBQ',
  'DIVA',
  'KOPR',
  'DI',
  'THK',
  'KYN',
];

export const CorridorSchematicMap: React.FC<CorridorSchematicMapProps> = ({
  sections = [],
  requests = [],
  title = 'CENTRAL CORRIDOR NETWORK TOPOLOGY',
  className = '',
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [showLegend, setShowLegend] = useState<boolean>(true);
  const [selectedSectionKey, setSelectedSectionKey] = useState<string | null>(null);

  // Group active maintenance blocks by normalized section key
  const blocksBySection = useMemo(() => {
    const map = new Map<string, MaintenanceRequest[]>();
    for (const req of requests) {
      if (!req.fromStation || !req.toStation) continue;
      const key = `${req.fromStation.toUpperCase()}-${req.toStation.toUpperCase()}`;
      const revKey = `${req.toStation.toUpperCase()}-${req.fromStation.toUpperCase()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(req);
      if (!map.has(revKey)) map.set(revKey, []);
      map.get(revKey)!.push(req);
    }
    return map;
  }, [requests]);

  // Contiguous corridor segments derived from verified stations
  const corridorSegments = useMemo(() => {
    const segments = [];
    for (let i = 0; i < VERIFIED_CORRIDOR_ORDER.length - 1; i++) {
      const from = VERIFIED_CORRIDOR_ORDER[i];
      const to = VERIFIED_CORRIDOR_ORDER[i + 1];
      const key = `${from}-${to}`;
      const matchingSec = sections.find(
        (s) =>
          (s.from_station === from && s.to_station === to) ||
          (s.from_station === to && s.to_station === from)
      );

      const activeReqs = blocksBySection.get(key) || [];
      const hasApproved = activeReqs.some((r) => r.status === RequestStatus.APPROVED);
      const hasRecommended = activeReqs.some((r) => r.status === RequestStatus.RECOMMENDED);
      const hasPending = activeReqs.some((r) => r.status === RequestStatus.PENDING || r.status === RequestStatus.ANALYZING);

      segments.push({
        from,
        to,
        key,
        distanceKm: matchingSec?.block_section_km ?? null,
        durationMins: matchingSec?.occupancy_duration_mins ?? null,
        activeRequests: activeReqs,
        hasApproved,
        hasRecommended,
        hasPending,
      });
    }
    return segments;
  }, [sections, blocksBySection]);

  const selectedSegment = useMemo(() => {
    if (!selectedSectionKey) return null;
    return corridorSegments.find((s) => s.key === selectedSectionKey) || null;
  }, [selectedSectionKey, corridorSegments]);

  const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`bg-white border border-slate-200 rounded-xl shadow-subtle overflow-hidden flex flex-col ${className}`}>
      {/* Console Map Header */}
      <div className="px-4 py-3 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <Radio className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-mono font-bold tracking-wider uppercase text-slate-100">
                {title}
              </h3>
              {/* Compliance Indicator: Verified Static Topology with Unavailable Live Telemetry Notice */}
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                STATIC TOPOLOGY · LIVE LOCATION DATA UNAVAILABLE
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 font-sans">
              Verified Central Railway corridor nodes & active block requisition overlays
            </p>
          </div>
        </div>

        {/* Console Controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700">
            <button
              onClick={() => setZoomLevel((z) => Math.min(z + 0.15, 1.6))}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors"
              title="Zoom In"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setZoomLevel((z) => Math.max(z - 0.15, 0.75))}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors"
              title="Zoom Out"
            >
              <Minimize2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => {
                setZoomLevel(1);
                setSelectedSectionKey(null);
              }}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors"
              title="Reset View"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            onClick={() => setShowLegend((v) => !v)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold border transition-colors flex items-center gap-1.5 ${
              showLegend
                ? 'bg-slate-800 border-slate-700 text-emerald-400'
                : 'bg-transparent border-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Legend</span>
          </button>
        </div>
      </div>

      {/* Schematic Canvas Container */}
      <div className="relative bg-slate-950 p-6 overflow-x-auto min-h-[190px] flex items-center justify-center">
        {/* Subtle coordinate grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.07] pointer-events-none"
          style={{
            backgroundImage: 'linear-gradient(#94a3b8 1px, transparent 1px), linear-gradient(90deg, #94a3b8 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />

        <div
          className="transition-transform duration-200 ease-out w-full max-w-[1300px] select-none"
          style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'center center' }}
        >
          {/* Main Corridor Track Line */}
          <div className="relative flex items-center justify-between w-full px-4">
            {/* Base Double-Track Line */}
            <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-[6px] bg-slate-800 rounded-full" />
            <div className="absolute left-6 right-6 top-1/2 -translate-y-[1px] h-[2px] bg-slate-700" />

            {/* Segment Sections Overlays */}
            {corridorSegments.map((seg, idx) => {
              const segCount = corridorSegments.length;
              const leftPercent = (idx / segCount) * 100;
              const widthPercent = (1 / segCount) * 100;

              let trackHighlight = 'bg-slate-700/60';
              let badgeBorder = 'border-slate-700';
              let badgeBg = 'bg-slate-900/90 text-slate-400';
              let badgeText = `${seg.distanceKm ? `${seg.distanceKm} km` : 'Contiguous'}`;

              if (seg.hasApproved) {
                trackHighlight = 'bg-emerald-500 h-[6px] shadow-[0_0_12px_rgba(16,185,129,0.7)] animate-pulse';
                badgeBorder = 'border-emerald-500';
                badgeBg = 'bg-emerald-950/90 text-emerald-300';
                badgeText = 'APPROVED BLOCK';
              } else if (seg.hasRecommended) {
                trackHighlight = 'bg-sky-500 h-[6px] shadow-[0_0_12px_rgba(14,165,233,0.6)]';
                badgeBorder = 'border-sky-500';
                badgeBg = 'bg-sky-950/90 text-sky-300';
                badgeText = 'RECOMMENDED';
              } else if (seg.hasPending) {
                trackHighlight = 'bg-amber-500 h-[6px] shadow-[0_0_12px_rgba(245,158,11,0.6)]';
                badgeBorder = 'border-amber-500';
                badgeBg = 'bg-amber-950/90 text-amber-300';
                badgeText = 'ANALYZING';
              }

              const isSelected = selectedSectionKey === seg.key;

              return (
                <div
                  key={seg.key}
                  onClick={() => setSelectedSectionKey(isSelected ? null : seg.key)}
                  className={`absolute top-1/2 -translate-y-1/2 cursor-pointer transition-all ${
                    isSelected ? 'z-20' : 'z-10'
                  }`}
                  style={{
                    left: `calc(${leftPercent}% + 20px)`,
                    width: `calc(${widthPercent}% - 30px)`,
                  }}
                  title={`Section: ${seg.from} -> ${seg.to}${seg.activeRequests.length > 0 ? ` (${seg.activeRequests.length} active requisitions)` : ''}`}
                >
                  {/* Highlight track */}
                  <div className={`w-full rounded-full transition-all ${trackHighlight}`} />

                  {/* Section Label Badge */}
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase border transition-all ${badgeBg} ${badgeBorder} ${
                        isSelected ? 'ring-2 ring-white scale-105' : ''
                      }`}
                    >
                      {badgeText}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Station Nodes */}
            {VERIFIED_CORRIDOR_ORDER.map((stationCode) => {
              const isJunction = stationCode === 'KYN' || stationCode === 'TNA' || stationCode === 'DIVA';

              return (
                <div key={stationCode} className="relative z-30 flex flex-col items-center">
                  {/* Station Tag (Above Track) */}
                  <div className="mb-2.5">
                    <span className="px-2 py-0.5 rounded bg-slate-900/90 border border-slate-700 text-slate-100 font-mono text-[11px] font-bold tracking-wider shadow-sm">
                      {stationCode}
                    </span>
                  </div>

                  {/* Station Node Indicator */}
                  <div
                    className={`rounded-full border-2 transition-transform ${
                      isJunction
                        ? 'w-5 h-5 bg-white border-emerald-500 ring-4 ring-emerald-500/20'
                        : 'w-3.5 h-3.5 bg-slate-300 border-slate-900'
                    }`}
                  />

                  {/* Station Category (Below Track) */}
                  <div className="mt-2.5 text-[9px] font-mono text-slate-400 uppercase tracking-tight">
                    {isJunction ? 'Junction' : 'Station'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Selected Section Inspection Tray */}
      {selectedSegment && (
        <div className="bg-slate-900 px-5 py-3 border-t border-slate-800 text-white text-xs flex flex-wrap items-center justify-between gap-4 animate-in fade-in duration-150">
          <div className="flex items-center gap-3">
            <span className="font-mono font-bold text-emerald-400 text-sm">
              {selectedSegment.from} ⟷ {selectedSegment.to}
            </span>
            <span className="text-slate-400 text-[11px]">
              {selectedSegment.distanceKm ? `Distance: ${selectedSegment.distanceKm} km` : 'Contiguous Corridor Section'}
              {selectedSegment.durationMins ? ` · Avg Transit: ${selectedSegment.durationMins} min` : ''}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {selectedSegment.activeRequests.length > 0 ? (
              <span className="px-2.5 py-1 rounded bg-emerald-950/80 border border-emerald-500 text-emerald-300 text-[11px] font-mono font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>{selectedSegment.activeRequests.length} Active Maintenance Requisition(s) On Section</span>
              </span>
            ) : (
              <span className="text-slate-500 font-mono text-[11px]">
                No active track maintenance requisitions on this section
              </span>
            )}
            <button
              onClick={() => setSelectedSectionKey(null)}
              className="text-slate-400 hover:text-white text-xs underline font-mono"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Bottom Console Footer & Legend */}
      <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-200 text-xs flex flex-wrap items-center justify-between gap-4 text-slate-600">
        <div className="flex items-center gap-4 text-[11px]">
          <span className="font-mono text-slate-400 uppercase font-bold">
            Live GPS Stream: <strong className="text-amber-700">Not Connected</strong>
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-500 flex items-center gap-1">
            <Info className="h-3.5 w-3.5 text-slate-400" />
            Showing verified topology only · Live train movement telemetry not connected
          </span>
        </div>

        {showLegend && (
          <div className="flex items-center gap-4 text-[11px] font-mono">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span>Approved Block</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
              <span>Recommended</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span>Analyzing</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-300 border border-slate-500" />
              <span>Free Track</span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-500">
          <Clock className="h-3 w-3 text-slate-400" />
          <span>Last sync: {currentTime}</span>
        </div>
      </div>
    </div>
  );
};
