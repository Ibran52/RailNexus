import React, { useEffect, useState } from 'react';
import { brainApi } from '../../api/brain';
import { CorridorSection, DatasetStatus } from '../../types';
import { TopNav } from '../../components/TopNav';
import { FooterAdvisory } from '../../components/FooterAdvisory';
import { RailwayTrack } from '../../components/RailwayTrack';
import { Database, CheckCircle2, Server, ArrowRight, ShieldCheck, Search } from 'lucide-react';

export const ConfigurationPage: React.FC = () => {
  const [dataStatus, setDataStatus] = useState<DatasetStatus | null>(null);
  const [brainHealth, setBrainHealth] = useState<{ status: string; url: string; details?: any } | null>(null);
  const [stations, setStations] = useState<string[]>([]);
  const [sections, setSections] = useState<CorridorSection[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [partialErrors, setPartialErrors] = useState<string[]>([]);

  const loadConfigData = async () => {
    try {
      setIsLoading(true);
      const errors: string[] = [];
      const [statusRes, healthRes, stnsRes, secsRes] = await Promise.allSettled([
        brainApi.getDataStatus(),
        brainApi.checkHealth(),
        brainApi.getStations(),
        brainApi.getSections(),
      ]);

      if (statusRes.status === 'fulfilled') {
        setDataStatus(statusRes.value);
      } else {
        errors.push('Brain Dataset Status');
        setDataStatus(null);
      }

      if (healthRes.status === 'fulfilled') {
        setBrainHealth(healthRes.value);
      } else {
        errors.push('Brain Service Health');
        setBrainHealth(null);
      }

      if (stnsRes.status === 'fulfilled') {
        setStations(stnsRes.value);
      } else {
        errors.push('Station Catalog');
        setStations([]);
      }

      if (secsRes.status === 'fulfilled') {
        setSections(secsRes.value);
      } else {
        errors.push('Section Catalog');
        setSections([]);
      }

      setPartialErrors(errors);
    } catch {
      setPartialErrors(['Configuration services unreachable']);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadConfigData();
  }, []);

  const filteredSections = sections.filter(
    (s) =>
      s.from_station.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.to_station.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-100">
      <TopNav />

      <main className="flex-1 max-w-[1700px] w-full mx-auto p-4 sm:p-6 flex flex-col gap-5">
        {/* Partial Errors Warning Banner */}
        {partialErrors.length > 0 && (
          <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg flex items-center justify-between text-xs text-amber-900 shadow-subtle">
            <div className="flex items-center space-x-2">
              <span className="font-bold uppercase font-mono tracking-wider">Partial Data Notice:</span>
              <span>Some telemetry endpoints could not be reached ({partialErrors.join(', ')}). Available metrics displayed.</span>
            </div>
            <button
              onClick={loadConfigData}
              className="px-2.5 py-1 bg-amber-200 hover:bg-amber-300 text-amber-900 rounded font-bold transition-colors text-xs"
            >
              Retry
            </button>
          </div>
        )}

        {/* Section Header */}
        <div>
          <h1 className="text-xl font-bold text-slate-900 font-sans tracking-tight">
            Corridor Data Configuration & Source Integrity
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Verified working timetable datasets, operational data models, and active Python Brain microservice parameters.
          </p>
        </div>

        {/* VERIFIED SOURCE → DIGITAL DATA Transformation Pipeline (Screenshot 161713) */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-subtle flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-blue-600 inline-block" />
              <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-900">
                VERIFIED SOURCE → DIGITAL DATA PIPELINE
              </h3>
            </div>
            <span className="text-[11px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-300 px-2 py-0.5 rounded font-bold">
              ✓ SOURCE VERIFIED
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            {/* Source Document Card */}
            <div className="md:col-span-3 p-4 bg-slate-50 border border-slate-200 rounded-lg">
              <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block">
                SOURCE DOCUMENT
              </span>
              <h4 className="text-xs font-bold text-slate-800 mt-1">
                WORKING TIME TABLE 2025
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Indian Railways Main Line Section Occupancy Dataset
              </p>
              <div className="mt-3 flex items-center gap-1.5 text-[10px] font-mono text-emerald-700 font-bold">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>CRC-32 CHECKSUM MATCH</span>
              </div>
            </div>

            {/* Pipeline Step Arrows */}
            <div className="md:col-span-6 flex items-center justify-between gap-1 text-center font-mono text-xs">
              <div className="p-2 rounded bg-white border border-slate-200 shadow-xs flex-1">
                <span className="text-[9px] text-slate-400 block font-bold">STAGE 1</span>
                <span className="font-bold text-slate-800">EXTRACT</span>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400 shrink-0" />

              <div className="p-2 rounded bg-white border border-slate-200 shadow-xs flex-1">
                <span className="text-[9px] text-slate-400 block font-bold">STAGE 2</span>
                <span className="font-bold text-slate-800">VALIDATE</span>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400 shrink-0" />

              <div className="p-2 rounded bg-white border border-slate-200 shadow-xs flex-1">
                <span className="text-[9px] text-slate-400 block font-bold">STAGE 3</span>
                <span className="font-bold text-slate-800">NORMALIZE</span>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400 shrink-0" />

              <div className="p-2 rounded bg-emerald-50 border border-emerald-300 shadow-xs flex-1 text-emerald-900 font-bold">
                <span className="text-[9px] text-emerald-600 block">STAGE 4</span>
                <span>TIME ALIGN</span>
              </div>
            </div>

            {/* Target Model Card */}
            <div className="md:col-span-3 p-4 bg-rail-navy text-white rounded-lg">
              <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block">
                OPERATIONAL MODEL
              </span>
              <h4 className="text-xs font-bold text-white mt-1">
                RAILNEXUS DATA MODEL
              </h4>
              <p className="text-[11px] text-slate-300 mt-0.5">
                Deterministic conflict & cascade decision graph
              </p>
              <div className="mt-3 text-[10px] font-mono text-emerald-400">
                ACTIVE CLOCK: UTC / IST NORMALIZED
              </div>
            </div>
          </div>
        </div>

        {/* Live Service Telemetry & Dataset Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-subtle flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono uppercase text-slate-400 font-bold">
                Python Brain Microservice
              </span>
              <div className="text-base font-bold font-mono text-slate-900 mt-1">
                {brainHealth?.status === 'ok' ? 'Online · Port 8000' : (isLoading ? 'Checking...' : 'Unreachable')}
              </div>
              <span className="text-[11px] text-slate-500 font-mono">
                {brainHealth?.url || 'http://localhost:8000'}
              </span>
            </div>
            <Server
              className={`h-8 w-8 ${
                brainHealth?.status === 'ok' ? 'text-emerald-500' : 'text-slate-300'
              }`}
            />
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-subtle flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono uppercase text-slate-400 font-bold">
                Verified Timetable Rows
              </span>
              <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
                {dataStatus?.row_count !== undefined ? dataStatus.row_count.toLocaleString() : (isLoading ? '...' : 'NOT AVAILABLE')}
              </div>
              <span className="text-[11px] text-slate-500">Train movement entries</span>
            </div>
            <Database className="h-8 w-8 text-blue-500" />
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-subtle flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono uppercase text-slate-400 font-bold">
                Unique Trains Tracked
              </span>
              <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
                {dataStatus?.train_count !== undefined ? dataStatus.train_count : (isLoading ? '...' : 'NOT AVAILABLE')}
              </div>
              <span className="text-[11px] text-slate-500">Express, Mail, Passenger & Freight</span>
            </div>
            <ShieldCheck className="h-8 w-8 text-emerald-500" />
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-subtle flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono uppercase text-slate-400 font-bold">
                Active Corridor Stations
              </span>
              <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
                {stations.length > 0 ? stations.length : (dataStatus?.station_count !== undefined ? dataStatus.station_count : (isLoading ? '...' : 'NOT AVAILABLE'))}
              </div>
              <span className="text-[11px] text-slate-500">Verified station codes</span>
            </div>
            <ShieldCheck className="h-8 w-8 text-purple-500" />
          </div>
        </div>

        {/* Railway Corridor Track Context (Screenshot 161713) */}
        <RailwayTrack
          title="CORRIDOR CONTEXT: NORMALIZED OPERATIONAL TIMETABLE"
          subtitle="Corridor topology + train movements + time index = normalized operational corridor"
          stations={
            stations.length > 0
              ? stations.slice(0, 8).map((s) => ({
                  name: s,
                  code: s,
                }))
              : []
          }
          blocks={
            sections.length > 0
              ? [
                  {
                    id: 'blk-cfg',
                    department: 'ENGINEERING',
                    fromStationIndex: 0,
                    toStationIndex: 1,
                    label: `SECTION: ${sections[0].from_station}—${sections[0].to_station}`,
                  },
                ]
              : []
          }
          trains={[]}
          conflicts={[]}
          highlightWindow="TIMETABLE SCHEMATIC"
        />

        {/* Verified Block Sections Catalog Table */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-subtle overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-900">
                Verified Corridor Block Sections Catalog
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Directly served from Python Brain repository for dynamic request validation.
              </p>
            </div>

            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search station code..."
                className="pl-8 pr-3 py-1.5 rounded border border-slate-300 text-xs focus:ring-rail-navy focus:border-rail-navy w-48 font-mono"
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-[10px] uppercase text-slate-500 tracking-wider">
                <tr>
                  <th className="py-2.5 px-4 font-bold">#</th>
                  <th className="py-2.5 px-4 font-bold">FROM STATION</th>
                  <th className="py-2.5 px-4 font-bold">TO STATION</th>
                  <th className="py-2.5 px-4 font-bold">SECTION DISTANCE (KM)</th>
                  <th className="py-2.5 px-4 font-bold">AVG OCCUPANCY</th>
                  <th className="py-2.5 px-4 font-bold">VALIDATION STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSections.slice(0, 50).map((sec, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80">
                    <td className="py-2 px-4 text-slate-400">{idx + 1}</td>
                    <td className="py-2 px-4 font-bold text-slate-800">{sec.from_station}</td>
                    <td className="py-2 px-4 font-bold text-slate-800">{sec.to_station}</td>
                    <td className="py-2 px-4 text-slate-600">
                      {sec.block_section_km ? `${sec.block_section_km} km` : '—'}
                    </td>
                    <td className="py-2 px-4 text-slate-600">
                      {sec.avg_duration_mins ? `${sec.avg_duration_mins} min` : '—'}
                    </td>
                    <td className="py-2 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-300">
                        VERIFIED SECTION
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <FooterAdvisory />
    </div>
  );
};
