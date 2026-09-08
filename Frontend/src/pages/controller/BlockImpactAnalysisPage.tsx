import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { controllerApi } from '../../api/controller';
import { brainApi } from '../../api/brain';
import { BrainRun, CandidateWindow, MaintenanceRequest } from '../../types';
import { TopNav } from '../../components/TopNav';
import { FooterAdvisory } from '../../components/FooterAdvisory';
import { DelayTraceTimeline } from '../../components/DelayTraceTimeline';
import { RailwayTrack } from '../../components/RailwayTrack';
import { GeographicCorridorImpactMap } from '../../components/GeographicCorridorImpactMap';
import { ArrowLeft, SlidersHorizontal, CheckCircle2 } from 'lucide-react';

export const BlockImpactAnalysisPage: React.FC = () => {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const [request, setRequest] = useState<MaintenanceRequest | null>(null);
  const [brainRun, setBrainRun] = useState<BrainRun | null>(null);
  const [candidate, setCandidate] = useState<CandidateWindow | null>(null);
  const [stationDetails, setStationDetails] = useState<import('../../types').StationDetail[]>([]);
  const [sections, setSections] = useState<import('../../types').CorridorSection[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    async function loadData() {
      if (!requestId) return;
      try {
        setLoadError(null);
        const [details, stationData, sectionData] = await Promise.all([
          controllerApi.getRequestDetails(requestId),
          brainApi.getStationDetails(),
          brainApi.getSections(),
        ]);
        setRequest(details.request);
        setStationDetails(stationData);
        setSections(sectionData);

        let activeRun = details.activeAnalysis;
        if (!activeRun) {
          activeRun = await controllerApi.getRequestAnalysis(requestId);
        }
        setBrainRun(activeRun);

        const passedCandidate = (location.state as any)?.candidate;
        if (passedCandidate) {
          setCandidate(passedCandidate);
        } else if (activeRun?.recommendations && activeRun.recommendations.length > 0) {
          if (activeRun.recommendations[0]?.start) {
            setCandidate(activeRun.recommendations[0]);
          } else {
            const reqItem = activeRun.recommendations.find((r: any) => r.request_id === requestId) || activeRun.recommendations[0];
            setCandidate(reqItem?.recommendation || reqItem || activeRun.recommendation || null);
          }
        } else if (activeRun?.recommendation) {
          setCandidate(activeRun.recommendation);
        }
      } catch (err: any) {
        setLoadError(err.message || 'Unable to load corridor impact analysis.');
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [requestId, location.state]);

  const immediateDelay = candidate?.direct_delay_minutes ?? candidate?.total_delay_minutes;
  const downstreamDelay = candidate?.downstream_delay_minutes;
  const totalDelay = brainRun?.metrics?.total_delay_minutes ?? candidate?.total_delay_minutes;

  const windowStart = candidate?.start
    ? new Date(candidate.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'MISSING DATA';
  const windowEnd = candidate?.end
    ? new Date(candidate.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';
  const windowText = windowEnd ? `${windowStart}–${windowEnd} IST` : windowStart;

  const activeDelayTrace =
    (candidate as any)?.delayTrace ||
    (candidate as any)?.delay_trace ||
    (brainRun as any)?.delayTrace;

  return (
    <div className="min-h-screen flex flex-col bg-slate-100">
      <TopNav />

      <main className="flex-1 max-w-[1700px] w-full mx-auto p-4 sm:p-6 flex flex-col gap-5">
        {loadError && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded">
            {loadError}
          </div>
        )}
        {/* Top Header and Action Buttons (Screenshot 161911) */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900 font-sans tracking-tight">
              Block Impact Analysis: {candidate?.option_label || 'Candidate Window'}
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {windowText} · Section {request ? `S-${request.fromStation}-${request.toStation}` : 'S-CORRIDOR'} ·{' '}
              {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => navigate(`/controller/requests/${requestId}/candidates`)}
              className="inline-flex items-center space-x-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-xs font-semibold transition-colors shadow-subtle"
            >
              <ArrowLeft className="h-4 w-4 text-slate-500" />
              <span>Back to Windows</span>
            </button>

            <button
              onClick={() => navigate(`/controller/requests/${requestId}/compare`)}
              className="inline-flex items-center space-x-2 bg-rail-navy hover:bg-slate-800 text-white px-5 py-2 rounded-lg text-xs font-bold transition-colors shadow-sm"
            >
              <SlidersHorizontal className="h-4 w-4 text-rail-green" />
              <span>Compare & Recommend</span>
            </button>
          </div>
        </div>

        <GeographicCorridorImpactMap
          stations={stationDetails}
          sections={sections}
          request={request}
          candidate={candidate}
        />

        {/* Top 5 Metric Cards (Screenshot 161911) */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {/* Card 1: Trains Affected */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-subtle flex flex-col items-center justify-center text-center">
            <span className="text-[10px] font-mono uppercase text-slate-400 font-bold">
              Trains Affected
            </span>
            <span className="text-2xl font-bold font-mono text-slate-900 mt-1">
              {candidate?.affected_train_count ?? candidate?.affected_trains?.length ?? 'MISSING DATA'}
            </span>
          </div>

          {/* Card 2: Immediate Delay */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-subtle flex flex-col items-center justify-center text-center">
            <span className="text-[10px] font-mono uppercase text-slate-400 font-bold">
              Immediate Delay
            </span>
            <span className="text-2xl font-bold font-mono text-emerald-600 mt-1">
              {immediateDelay ?? 'MISSING DATA'} {immediateDelay !== undefined ? 'min' : ''}
            </span>
          </div>

          {/* Card 3: Downstream Delay */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-subtle flex flex-col items-center justify-center text-center">
            <span className="text-[10px] font-mono uppercase text-slate-400 font-bold">
              Downstream Delay
            </span>
            <span className="text-2xl font-bold font-mono text-emerald-600 mt-1">
              {downstreamDelay ?? 'MISSING DATA'} {downstreamDelay !== undefined ? 'min' : ''}
            </span>
          </div>

          {/* Card 4: Total Delay */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-subtle flex flex-col items-center justify-center text-center">
            <span className="text-[10px] font-mono uppercase text-slate-400 font-bold">
              Total Delay
            </span>
            <span className="text-2xl font-bold font-mono text-emerald-600 mt-1">
              {totalDelay ?? 'MISSING DATA'} {totalDelay !== undefined ? 'min' : ''}
            </span>
          </div>

          {/* Card 5: Temporary Speed Restriction */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-subtle flex flex-col items-center justify-center text-center col-span-2 md:col-span-1">
            <span className="text-[10px] font-mono uppercase text-slate-400 font-bold">
              Temporary Speed Restriction
            </span>
            <span className="text-base font-bold text-emerald-600 mt-1 font-sans">
              {candidate?.speed_restriction_required ? 'Required' : 'Not required'}
            </span>
          </div>
        </div>

        {/* 2-Column Responsive Layout (Screenshot 161911) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Column (60%): Delay Breakdown Cards & Cascade Trace */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            {/* 3 Metric Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-subtle">
                <span className="text-[10px] font-mono uppercase text-slate-400 font-bold block mb-1">
                  IMMEDIATE DELAY
                </span>
                <div className="flex items-baseline space-x-1">
                  <span className="text-2xl font-bold font-mono text-slate-900">{immediateDelay}</span>
                  <span className="text-xs text-slate-500">min</span>
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  {candidate?.affected_trains?.length ?? 'MISSING DATA'} trains held/rerouted
                </span>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-subtle">
                <span className="text-[10px] font-mono uppercase text-slate-400 font-bold block mb-1">
                  DOWNSTREAM CASCADE
                </span>
                <div className="flex items-baseline space-x-1">
                  <span className="text-2xl font-bold font-mono text-slate-900">{downstreamDelay}</span>
                  <span className="text-xs text-slate-500">min</span>
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Propagated delay impact
                </span>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-subtle">
                <span className="text-[10px] font-mono uppercase text-slate-400 font-bold block mb-1">
                  TOTAL DELAY
                </span>
                <div className="flex items-baseline space-x-1">
                  <span className="text-2xl font-bold font-mono text-emerald-600">{totalDelay}</span>
                  <span className="text-xs text-slate-500">min</span>
                </div>
                <span className="text-[10px] text-emerald-600 font-medium mt-1 block">
                  {candidate?.is_recommended ? 'Optimal slot' : 'Calculated impact'}
                </span>
              </div>
            </div>

            {/* Delay Cascade Trace Timeline Component */}
            <DelayTraceTimeline
              traces={activeDelayTrace}
              sectionCode={request ? `S-${request.fromStation}-${request.toStation}` : 'S-CORRIDOR'}
            />
          </div>

          {/* Right Column (40%): Track Schematic & Option Summary */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            {/* Track Corridor Component */}
            <RailwayTrack
              title="Corridor Section Occupancy"
              subtitle="Train paths reading through active block window"
              stations={
                request?.fromStation && request?.toStation
                  ? [
                      { name: request.fromStation, code: request.fromStation },
                      { name: request.toStation, code: request.toStation },
                    ]
                  : []
              }
              blocks={[
                {
                  id: 'blk-rec',
                  department: request?.department || 'MISSING DATA',
                  fromStationIndex: 0,
                  toStationIndex: 1,
                  label: `${candidate?.option_label || 'WINDOW'} (${windowText})`,
                },
              ]}
              trains={[]}
              conflicts={[]}
              directionLabel="PROPAGATION TRACE"
              height={85}
            />

            {/* Option Summary Card (Screenshot 161911) */}
            <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-subtle">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-3">
                <h4 className="text-xs font-bold text-slate-800 uppercase font-mono tracking-wider">
                  {candidate?.option_label || 'Candidate'} Summary
                </h4>
                <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>{candidate?.feasibility || 'NOT IMPLEMENTED'}</span>
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Window:</span>
                  <span className="font-mono font-bold text-slate-800">{windowText}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Maintenance:</span>
                    <span className="font-semibold text-slate-800">{candidate?.feasibility || 'NOT IMPLEMENTED'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Impact:</span>
                  <span className="font-bold text-emerald-700 font-mono">
                    {candidate?.impact_score !== undefined
                      ? `Score: ${candidate.impact_score}`
                      : 'MISSING DATA'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Combined:</span>
                  <span className="font-medium text-slate-800">NOT IMPLEMENTED</span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 text-[10px] text-slate-400 italic">
                Delay estimates based on section occupancy and Working Timetable.
              </div>
            </div>
          </div>
        </div>
      </main>

      <FooterAdvisory />
    </div>
  );
};
