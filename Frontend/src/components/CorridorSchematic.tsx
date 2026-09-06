import React, { useState, useMemo } from 'react';
import { Layers, AlertTriangle, ShieldCheck, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';

interface StationNode {
  code: string;
  name: string;
  isJunction?: boolean;
}

interface CorridorSchematicProps {
  corridorName?: string;
  jurisdiction?: string;
  stations?: StationNode[];
  highlightSection?: { from: string; to: string; label?: string };
  blockDetails?: {
    from: string;
    to: string;
    window?: string;
    department?: string;
    type?: string;
  };
  conflicts?: Array<{
    station: string;
    trainNumber: string | number;
    description: string;
  }>;
  trains?: Array<{
    trainNumber: string | number;
    station: string;
    isDelayed?: boolean;
    delayMinutes?: number;
    direction?: 'UP' | 'DOWN';
  }>;
}

// Minimum horizontal distance between adjacent stations to guarantee zero overlap of labels and circles
const MIN_NODE_GAP = 120;
const LEFT_PADDING = 80;
const RIGHT_PADDING = 80;

export const CorridorSchematic: React.FC<CorridorSchematicProps> = ({
  corridorName = 'Monitored Railway Corridor',
  jurisdiction = 'Main Line Track Operations',
  stations = [],
  highlightSection,
  blockDetails,
  conflicts = [],
  trains = [],
}) => {
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  // Layer visibility state
  const [layers, setLayers] = useState({
    trains: true,
    proposedBlock: true,
    speedRestriction: true,
    conflicts: true,
  });

  const [activeStationTooltip, setActiveStationTooltip] = useState<StationNode | null>(null);

  const getStationIndex = (code?: string) => {
    if (!code || code === 'MISSING DATA' || code === 'NOT AVAILABLE') return -1;
    return stations.findIndex((s) => s.code.toUpperCase() === code.toUpperCase());
  };

  const stationCount = stations.length;

  // Dynamic content width ensuring MIN_NODE_GAP is strictly respected across all station counts
  const contentWidth = useMemo(() => {
    if (stationCount <= 1) return 800;
    return LEFT_PADDING + (stationCount - 1) * MIN_NODE_GAP + RIGHT_PADDING;
  }, [stationCount]);

  // Precise x position for station at index i
  const getStationX = (index: number) => {
    if (stationCount <= 1) return LEFT_PADDING;
    return LEFT_PADDING + index * MIN_NODE_GAP;
  };

  // Compute maintenance overlay blocks with lane allocation to prevent vertical collisions
  const overlayLanes = useMemo(() => {
    const overlays: Array<{
      id: string;
      fromIdx: number;
      toIdx: number;
      startX: number;
      endX: number;
      width: number;
      department: string;
      window?: string;
      label: string;
      type: 'HIGHLIGHT' | 'BLOCK';
      lane: number;
    }> = [];

    // 1. Highlight Section
    if (highlightSection) {
      const fromIdx = getStationIndex(highlightSection.from);
      const toIdx = getStationIndex(highlightSection.to);
      if (fromIdx >= 0 && toIdx >= 0 && fromIdx !== toIdx) {
        const startIdx = Math.min(fromIdx, toIdx);
        const endIdx = Math.max(fromIdx, toIdx);
        const startX = getStationX(startIdx);
        const endX = getStationX(endIdx);
        overlays.push({
          id: 'highlight',
          fromIdx: startIdx,
          toIdx: endIdx,
          startX,
          endX,
          width: Math.max(endX - startX, 60),
          department: 'CORRIDOR',
          label: highlightSection.label || 'HIGHLIGHTED OPERATIONAL CORRIDOR',
          type: 'HIGHLIGHT',
          lane: 0,
        });
      }
    }

    // 2. Proposed Block
    if (layers.proposedBlock && blockDetails) {
      const fromIdx = getStationIndex(blockDetails.from);
      const toIdx = getStationIndex(blockDetails.to);
      if (fromIdx >= 0 && toIdx >= 0) {
        const startIdx = Math.min(fromIdx, toIdx);
        const endIdx = Math.max(fromIdx, toIdx);
        const startX = getStationX(startIdx);
        const endX = startIdx === endIdx ? startX + MIN_NODE_GAP * 0.8 : getStationX(endIdx);
        overlays.push({
          id: 'block',
          fromIdx: startIdx,
          toIdx: endIdx,
          startX,
          endX,
          width: Math.max(endX - startX, 100),
          department: blockDetails.department || 'MAINTENANCE',
          window: blockDetails.window,
          label: `${blockDetails.department || 'MAINTENANCE'} BLOCK ${blockDetails.window ? `· ${blockDetails.window}` : ''}`,
          type: 'BLOCK',
          lane: 0,
        });
      }
    }

    // Deterministic greedy lane allocation
    const laneOccupancy: Array<{ startX: number; endX: number }[]> = [];
    for (const ov of overlays) {
      let assignedLane = 0;
      while (true) {
        const currentLane = laneOccupancy[assignedLane] || [];
        const hasCollision = currentLane.some(
          (occupied) => ov.startX < occupied.endX + 20 && ov.endX + 20 > occupied.startX
        );
        if (!hasCollision) {
          if (!laneOccupancy[assignedLane]) laneOccupancy[assignedLane] = [];
          laneOccupancy[assignedLane].push({ startX: ov.startX, endX: ov.endX });
          ov.lane = assignedLane;
          break;
        }
        assignedLane++;
      }
    }

    return overlays;
  }, [highlightSection, blockDetails, layers.proposedBlock, stationCount]);

  const maxLane = overlayLanes.reduce((m, o) => Math.max(m, o.lane), 0);
  const laneHeight = 36;
  const trackY = 85; // Fixed Y baseline for rail track
  const overlayStartY = trackY + 45; // Dedicated lane below railway line and station circles
  const totalCanvasHeight = Math.max(overlayStartY + (maxLane + 1) * laneHeight + 35, 200);

  const scrollBy = (offset: number) => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    }
  };

  const resetScroll = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ left: 0, behavior: 'smooth' });
    }
  };

  if (stationCount === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg shadow-subtle p-8 text-center">
        <span className="text-xs font-mono font-bold text-slate-500 uppercase">
          TOPOLOGY DATA UNAVAILABLE
        </span>
        <p className="text-xs text-slate-400 mt-1">
          No verified corridor station coordinates or section connectivity records loaded.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-subtle overflow-hidden flex flex-col">
      {/* Top Bar with Corridor Title and Layer Controls */}
      <div className="bg-slate-50/80 px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold font-mono uppercase text-rail-navy">
              CORRIDOR CONTEXT
            </span>
            <span className="text-slate-400">|</span>
            <span className="text-xs font-semibold text-slate-700">{corridorName}</span>
          </div>
          <p className="text-[11px] text-slate-500">{jurisdiction}</p>
        </div>

        {/* Controls: Scroll buttons + Layer Checkboxes */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Scroll Navigation Controls for Wide Corridors */}
          <div className="flex items-center space-x-1 bg-white p-1 rounded border border-slate-200 shadow-xs">
            <button
              onClick={() => scrollBy(-300)}
              className="p-1 hover:bg-slate-100 rounded text-slate-600 transition-colors"
              title="Scroll Left"
              aria-label="Scroll Corridor Left"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={resetScroll}
              className="px-1.5 py-0.5 hover:bg-slate-100 rounded text-[10px] font-mono text-slate-600 font-bold"
              title="Reset to Origin"
            >
              <RotateCcw className="h-3 w-3 inline mr-0.5" /> ORIGIN
            </button>
            <button
              onClick={() => scrollBy(300)}
              className="p-1 hover:bg-slate-100 rounded text-slate-600 transition-colors"
              title="Scroll Right"
              aria-label="Scroll Corridor Right"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Layer Checkboxes */}
          <div className="flex items-center space-x-3 bg-white px-3 py-1.5 rounded border border-slate-200 text-xs text-slate-700">
            <Layers className="h-3.5 w-3.5 text-slate-400" />
            <label className="flex items-center space-x-1 cursor-pointer">
              <input
                type="checkbox"
                checked={layers.trains}
                onChange={(e) => setLayers({ ...layers, trains: e.target.checked })}
                className="rounded border-slate-300 text-rail-navy focus:ring-rail-navy h-3.5 w-3.5"
              />
              <span className="text-[11px] font-medium">Trains</span>
            </label>

            <label className="flex items-center space-x-1 cursor-pointer">
              <input
                type="checkbox"
                checked={layers.proposedBlock}
                onChange={(e) => setLayers({ ...layers, proposedBlock: e.target.checked })}
                className="rounded border-slate-300 text-rail-navy focus:ring-rail-navy h-3.5 w-3.5"
              />
              <span className="text-[11px] font-medium">Proposed block</span>
            </label>

            <label className="flex items-center space-x-1 cursor-pointer">
              <input
                type="checkbox"
                checked={layers.speedRestriction}
                onChange={(e) => setLayers({ ...layers, speedRestriction: e.target.checked })}
                className="rounded border-slate-300 text-rail-navy focus:ring-rail-navy h-3.5 w-3.5"
              />
              <span className="text-[11px] font-medium">Speed restriction</span>
            </label>

            <label className="flex items-center space-x-1 cursor-pointer">
              <input
                type="checkbox"
                checked={layers.conflicts}
                onChange={(e) => setLayers({ ...layers, conflicts: e.target.checked })}
                className="rounded border-slate-300 text-rail-navy focus:ring-rail-navy h-3.5 w-3.5"
              />
              <span className="text-[11px] font-medium">Conflicts</span>
            </label>
          </div>
        </div>
      </div>

      {/* Scrollable Viewport for arbitrary station count (Phase 13 Layout Model) */}
      <div
        ref={scrollContainerRef}
        className="w-full overflow-x-auto overflow-y-hidden bg-slate-50/40 select-none custom-scrollbar relative"
        style={{ scrollBehavior: 'smooth' }}
      >
        <div
          className="relative"
          style={{ width: `${contentWidth}px`, height: `${totalCanvasHeight}px`, minWidth: '100%' }}
        >
          {/* Main Continuous Track Line */}
          <div
            className="absolute left-0 right-0 h-3 flex items-center"
            style={{
              top: `${trackY}px`,
              left: `${LEFT_PADDING - 20}px`,
              width: `${contentWidth - LEFT_PADDING - RIGHT_PADDING + 40}px`,
            }}
          >
            {/* Sleepers background bar */}
            <div className="absolute inset-x-0 h-3 bg-slate-200 rounded border border-slate-300" />
            {/* Top steel rail */}
            <div className="absolute inset-x-0 top-1 h-[2px] bg-slate-700" />
            {/* Bottom steel rail */}
            <div className="absolute inset-x-0 bottom-1 h-[2px] bg-slate-700" />
          </div>

          {/* Section Connector Links */}
          {stations.slice(0, -1).map((st, i) => {
            const x1 = getStationX(i);
            const x2 = getStationX(i + 1);
            return (
              <div
                key={`sec-line-${st.code}-${i}`}
                className="absolute top-[86px] h-[3px] bg-slate-400"
                style={{
                  left: `${x1}px`,
                  width: `${x2 - x1}px`,
                }}
              />
            );
          })}

          {/* Dedicated Maintenance Overlay Lanes (Non-colliding, placed below track) */}
          {overlayLanes.map((ov) => {
            const laneY = overlayStartY + ov.lane * laneHeight;
            const isHighlight = ov.type === 'HIGHLIGHT';

            return (
              <div
                key={ov.id}
                className={`absolute rounded px-2.5 py-1 text-[10px] font-mono font-bold flex items-center shadow-xs transition-all z-20 ${
                  isHighlight
                    ? 'border-2 border-dashed border-blue-500 bg-blue-50/90 text-blue-800'
                    : 'bg-amber-500 text-white border border-amber-600 shadow-sm'
                }`}
                style={{
                  left: `${ov.startX}px`,
                  width: `${ov.width}px`,
                  top: `${laneY}px`,
                  height: '26px',
                }}
                title={ov.label}
              >
                <span className="truncate w-full text-center">
                  {ov.label}
                </span>
              </div>
            );
          })}

          {/* Station Markers (Labels dedicated ABOVE track, circles ON track) */}
          {stations.map((st, i) => {
            const x = getStationX(i);

            return (
              <div
                key={`station-${st.code}-${i}`}
                className="absolute flex flex-col items-center z-30"
                style={{
                  left: `${x}px`,
                  top: '20px',
                  transform: 'translateX(-50%)',
                  width: '100px',
                }}
                onMouseEnter={() => setActiveStationTooltip(st)}
                onMouseLeave={() => setActiveStationTooltip(null)}
              >
                {/* Station Code Label (Placed strictly ABOVE track) */}
                <div className="flex flex-col items-center mb-1">
                  <span className="font-mono text-xs font-extrabold text-slate-800 bg-white/90 px-1.5 py-0.5 rounded shadow-xs border border-slate-200">
                    {st.code}
                  </span>
                  {st.name && st.name !== st.code && (
                    <span className="text-[10px] text-slate-500 font-sans truncate max-w-[95px] text-center" title={st.name}>
                      {st.name}
                    </span>
                  )}
                </div>

                {/* Station Circle Node (Centered directly on rail) */}
                <div
                  className={`w-4 h-4 rounded-full border-2 bg-white flex items-center justify-center shadow-xs cursor-pointer transition-transform hover:scale-125 ${
                    st.isJunction
                      ? 'border-blue-600 ring-2 ring-blue-100'
                      : 'border-slate-800 hover:border-blue-700'
                  }`}
                  style={{ marginTop: '12px' }}
                >
                  {st.isJunction ? (
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                  ) : (
                    <div className="w-1 h-1 rounded-full bg-slate-600" />
                  )}
                </div>
              </div>
            );
          })}

          {/* Running / Delayed Trains (Strictly on Verified Locations) */}
          {layers.trains &&
            trains
              .filter((tr) => getStationIndex(tr.station) >= 0)
              .map((tr, idx) => {
                const stIdx = getStationIndex(tr.station);
                const x = getStationX(stIdx) + (idx % 2 === 0 ? 12 : -12);
                const isDelayed = tr.isDelayed || (tr.delayMinutes && tr.delayMinutes > 0);

                return (
                  <div
                    key={`tr-${tr.trainNumber}-${idx}`}
                    className="absolute z-40 -translate-x-1/2 flex flex-col items-center pointer-events-none"
                    style={{ left: `${x}px`, top: '48px' }}
                  >
                    <div
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold font-mono flex items-center gap-1 shadow-sm text-white ${
                        isDelayed ? 'bg-rose-600 ring-2 ring-rose-200' : 'bg-blue-600 ring-2 ring-blue-100'
                      }`}
                    >
                      <span>🚆</span>
                      <span>{tr.trainNumber}</span>
                      {tr.delayMinutes ? <span>+{tr.delayMinutes}m</span> : null}
                    </div>
                  </div>
                );
              })}

          {/* Conflicts Marker */}
          {layers.conflicts &&
            conflicts
              .filter((c) => getStationIndex(c.station) >= 0)
              .map((c, idx) => {
                const stIdx = getStationIndex(c.station);
                const x = getStationX(stIdx) + 20;

                return (
                  <div
                    key={`conf-${idx}`}
                    className="absolute z-40 -translate-x-1/2 flex flex-col items-center"
                    style={{ left: `${x}px`, top: `${trackY + 18}px` }}
                    title={c.description}
                  >
                    <div className="flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-300 px-2 py-0.5 rounded-full text-[10px] font-bold shadow-xs">
                      <span className="text-rose-600">✕</span>
                      <span>CONFLICT ({c.trainNumber})</span>
                    </div>
                  </div>
                );
              })}
        </div>
      </div>

      {/* Corridor Metric Footer Strip */}
      <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between text-xs text-slate-600 gap-2 font-mono">
        <div className="flex items-center space-x-3">
          <span className="flex items-center gap-1 text-slate-700 font-bold">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            <span>CORRIDOR STATIONS: {stationCount}</span>
          </span>
          <span>·</span>
          <span className="flex items-center gap-1 text-slate-600">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            <span>ACTIVE CONFLICTS: {conflicts.length}</span>
          </span>
          {stationCount > 8 && (
            <>
              <span>·</span>
              <span className="text-[11px] text-slate-500">
                Use scroll buttons or trackpad to pan full corridor
              </span>
            </>
          )}
        </div>

        <div className="text-[10px] font-mono font-bold uppercase bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded">
          STATIC TOPOLOGY · LIVE LOCATION DATA UNAVAILABLE
        </div>
      </div>
    </div>
  );
};
