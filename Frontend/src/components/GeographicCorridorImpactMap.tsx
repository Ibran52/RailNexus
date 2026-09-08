import React, { useMemo } from 'react';
import { AlertTriangle, MapPinned } from 'lucide-react';
import { CorridorSection, MaintenanceRequest, StationDetail } from '../types';

interface GeographicCorridorImpactMapProps {
  stations: StationDetail[];
  sections: CorridorSection[];
  request?: MaintenanceRequest | null;
  candidate?: {
    conflicts?: Array<{ train_number?: number | string; from_station?: string; to_station?: string; conflict_type?: string; overlap_minutes?: number }>;
    affected_trains?: Array<{ train_number?: number | string; delay_minutes?: number }>;
  } | null;
}

const MISSING = 'MISSING DATA';

export const GeographicCorridorImpactMap: React.FC<GeographicCorridorImpactMapProps> = ({
  stations,
  sections,
  request,
  candidate,
}) => {
  const validStations = useMemo(
    () => stations.filter((station) => (
      Number.isFinite(station.latitude) &&
      Number.isFinite(station.longitude) &&
      station.latitude >= -90 && station.latitude <= 90 &&
      station.longitude >= -180 && station.longitude <= 180
    )),
    [stations]
  );
  const byCode = useMemo(() => new Map(validStations.map((station) => [station.station_code, station])), [validStations]);

  const bounds = useMemo(() => {
    if (validStations.length === 0) return null;
    const lats = validStations.map((station) => station.latitude);
    const lngs = validStations.map((station) => station.longitude);
    return { minLat: Math.min(...lats), maxLat: Math.max(...lats), minLng: Math.min(...lngs), maxLng: Math.max(...lngs) };
  }, [validStations]);

  const project = (station: StationDetail) => {
    if (!bounds) return { x: 0, y: 0 };
    const lngSpan = Math.max(bounds.maxLng - bounds.minLng, 0.001);
    const latSpan = Math.max(bounds.maxLat - bounds.minLat, 0.001);
    return {
      x: 40 + ((station.longitude - bounds.minLng) / lngSpan) * 720,
      y: 330 - ((station.latitude - bounds.minLat) / latSpan) * 280,
    };
  };

  const selectedKey = request ? `${request.fromStation}-${request.toStation}` : null;
  const conflictKeys = new Set(
    (candidate?.conflicts || []).flatMap((conflict) =>
      conflict.from_station && conflict.to_station
        ? [`${conflict.from_station}-${conflict.to_station}`, `${conflict.to_station}-${conflict.from_station}`]
        : []
    )
  );

  if (!bounds || validStations.length === 0) {
    return <div className="min-h-[360px] bg-slate-950 text-slate-300 flex items-center justify-center text-sm">{MISSING}</div>;
  }

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
      <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 text-white">
        <div className="flex items-center gap-2">
          <MapPinned className="h-4 w-4 text-amber-400" />
          <div>
            <h3 className="text-xs font-bold font-mono uppercase tracking-wider">Geographic Corridor Impact</h3>
            <p className="text-[10px] text-slate-400">Verified station coordinates · schematic section connections</p>
          </div>
        </div>
        <span className="text-[10px] font-mono text-amber-300">STATIC TOPOLOGY · LIVE LOCATION DATA UNAVAILABLE</span>
      </div>

      <div className="overflow-x-auto">
        <svg viewBox="0 0 800 380" role="img" aria-label="Geographic railway corridor schematic" className="w-full min-w-[620px] h-[360px]">
          <rect width="800" height="380" fill="#020617" />
          {sections.map((section) => {
            const from = byCode.get(section.from_station);
            const to = byCode.get(section.to_station);
            if (!from || !to) return null;
            const a = project(from);
            const b = project(to);
            const key = `${section.from_station}-${section.to_station}`;
            const selected = key === selectedKey || key === `${request?.toStation}-${request?.fromStation}`;
            const conflict = conflictKeys.has(key);
            return <line key={`${key}-${section.section_id || ''}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={conflict ? '#ef4444' : selected ? '#f59e0b' : '#334155'} strokeWidth={selected || conflict ? 6 : 2} strokeLinecap="round" />;
          })}
          {validStations.map((station) => {
            const point = project(station);
            const selected = station.station_code === request?.fromStation || station.station_code === request?.toStation;
            return (
              <g key={station.station_code}>
                <title>{`${station.station_name || station.station_code} (${station.station_code})`}</title>
                <circle cx={point.x} cy={point.y} r={selected ? 7 : 4} fill={selected ? '#f59e0b' : '#e2e8f0'} stroke="#0f172a" strokeWidth="2" />
                <text x={point.x + 8} y={point.y - 8} fill="#e2e8f0" fontSize="10" fontFamily="monospace">{station.station_code}</text>
              </g>
            );
          })}
          {(candidate?.conflicts || []).map((conflict, index) => {
            const station = byCode.get(conflict.from_station || '') || byCode.get(conflict.to_station || '');
            if (!station) return null;
            const point = project(station);
            return <g key={`conflict-${index}`}><circle cx={point.x} cy={point.y} r="10" fill="none" stroke="#ef4444" strokeWidth="2" /><text x={point.x + 12} y={point.y + 4} fill="#fca5a5" fontSize="10">CONFLICT · {conflict.train_number ?? MISSING}</text></g>;
          })}
        </svg>
      </div>

      <div className="px-4 py-3 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px] font-mono">
        <div className="text-amber-300">MAINTENANCE BLOCK<br /><span className="text-slate-200">{request ? `${request.fromStation} → ${request.toStation}` : MISSING}</span></div>
        <div className="text-red-300"><AlertTriangle className="inline h-3 w-3 mr-1" />CONFLICTS<br /><span className="text-slate-200">{candidate?.conflicts ? candidate.conflicts.length : MISSING}</span></div>
        <div className="text-emerald-300">AFFECTED TRAINS<br /><span className="text-slate-200">{candidate?.affected_trains ? candidate.affected_trains.length : MISSING}</span></div>
      </div>
    </div>
  );
};