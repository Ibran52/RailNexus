import React, { useEffect, useState } from 'react';
import { controllerApi } from '../../api/controller';
import { MaintenanceRequest } from '../../types';
import { TopNav } from '../../components/TopNav';
import { FooterAdvisory } from '../../components/FooterAdvisory';
import { RailwayTrack } from '../../components/RailwayTrack';
import { Play, RotateCcw, AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react';

export const WhatIfSimulatorPage: React.FC = () => {
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string>('');
  const [proposedStart, setProposedStart] = useState<string>('');
  const [proposedEnd, setProposedEnd] = useState<string>('');
  const [simulationResult, setSimulationResult] = useState<any | null>(null);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadRequests() {
      try {
        const data = await controllerApi.getAllRequests();
        setRequests(data);
        if (data.length > 0) {
          setSelectedRequestId(data[0].requestId);
        }
      } catch (err: any) {
        setError('Failed to fetch requests for what-if analysis');
      }
    }
    loadRequests();
  }, []);

  const handleSimulate = async () => {
    if (!selectedRequestId || !proposedStart || !proposedEnd) {
      setError('Select a request and provide both scenario timestamps.');
      return;
    }
    try {
      setIsSimulating(true);
      setError(null);
      const res = await controllerApi.runWhatIf(
        selectedRequestId,
        proposedStart,
        proposedEnd
      );
      setSimulationResult(res.simulationResult || res);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.message || 'Simulation execution failed');
    } finally {
      setIsSimulating(false);
    }
  };

  const activeRequest = requests.find((r) => r.requestId === selectedRequestId);
  const simulationMetrics = simulationResult?.metrics ?? {};
  const simulationRecommendation = simulationResult?.recommendation ?? {};
  const totalDelay =
    simulationMetrics.total_delay_minutes ??
    simulationRecommendation.total_delay_minutes ??
    simulationResult?.total_delay_minutes;
  const directDelay =
    simulationMetrics.direct_delay_minutes ??
    simulationRecommendation.direct_delay_minutes ??
    simulationResult?.direct_delay_minutes;
  const cascadeDelay =
    simulationMetrics.cascade_delay_minutes ??
    simulationRecommendation.cascade_delay_minutes ??
    simulationResult?.cascade_delay_minutes;
  const impactScore =
    simulationRecommendation.impact_score ??
    simulationMetrics.impact_score ??
    simulationResult?.impact_score;
  const conflictCount =
    simulationMetrics.conflict_count ??
    simulationRecommendation.conflict_count ??
    simulationResult?.conflict_count ??
    simulationResult?.conflicts?.length;
  const affectedTrainCount =
    simulationMetrics.affected_train_count ??
    simulationRecommendation.affected_train_count ??
    simulationResult?.affected_train_count ??
    simulationResult?.affected_trains?.length;
  const isFeasible =
    simulationRecommendation.is_feasible ?? simulationResult?.is_feasible ?? undefined;

  return (
    <div className="min-h-screen flex flex-col bg-slate-100">
      <TopNav />

      <main className="flex-1 max-w-[1700px] w-full mx-auto p-4 sm:p-6 flex flex-col gap-5">
        {/* Simulation Warning Callout (Mandatory Rule) */}
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-3.5 flex items-center justify-between text-xs text-amber-900 shadow-subtle">
          <div className="flex items-center space-x-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
            <span className="font-bold uppercase font-mono">WHAT-IF / SIMULATION ONLY:</span>
            <span>
              Simulations do NOT modify live train schedules or database maintenance states.
            </span>
          </div>
          <span className="text-[10px] font-mono text-amber-700 font-bold bg-amber-100 px-2 py-0.5 rounded border border-amber-200">
            NON-MUTATING SANDBOX
          </span>
        </div>

        {/* Section Header */}
        <div>
          <h1 className="text-xl font-bold text-slate-900 font-sans tracking-tight">
            What-If Window Optimization & Scenario Analysis
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Simulate alternative maintenance timings against live train movements and calculate projected delay cascades.
          </p>
        </div>

        {/* Pipeline Architecture Header Cards (Screenshot 161651) */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-subtle">
          <div className="text-[10px] font-mono font-bold uppercase text-slate-400 tracking-wider mb-2">
            DATA → DECISION: THE WHOLE PIPELINE IN ONE LINE
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {[
              { step: '01', title: 'RAILWAY DATA', sub: 'topology · timetable' },
              { step: '02', title: 'MAINTENANCE', sub: 'task · duration' },
              { step: '03', title: 'RULES', sub: 'priority · feasibility' },
              { step: '04', title: 'SIMULATION', sub: 'conflict · cascade' },
              { step: '05', title: 'OPTIMIZATION', sub: 'lowest impact' },
              { step: '06', title: 'DECISION', sub: 'window + reason', highlight: true },
            ].map((p, i) => (
              <div
                key={i}
                className={`p-2.5 rounded border text-xs flex flex-col justify-between ${
                  p.highlight
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <div className="font-mono font-bold text-[10px] text-slate-400">{p.step}</div>
                <div className="font-bold text-xs mt-1">{p.title}</div>
                <div className="text-[10px] text-slate-500 font-sans mt-0.5">{p.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Simulation Control Workbench */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Controls Form (4 cols) */}
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-lg p-5 shadow-subtle space-y-4">
            <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-2">
              Simulation Parameters
            </h3>

            <div>
              <label className="text-[11px] font-bold text-slate-600 block uppercase font-mono">
                Select Base Request
              </label>
              <select
                value={selectedRequestId}
                onChange={(e) => setSelectedRequestId(e.target.value)}
                className="mt-1 w-full rounded border-slate-300 text-xs p-2 focus:border-rail-navy focus:ring-rail-navy"
              >
                {requests.map((r) => (
                  <option key={r.requestId} value={r.requestId}>
                    {r.requestId} ({r.department} · {r.fromStation}–{r.toStation})
                  </option>
                ))}
              </select>
            </div>

            {activeRequest && (
              <div className="p-2.5 rounded bg-slate-50 border border-slate-200 text-[11px] text-slate-600 font-mono space-y-1">
                <div>Section: {activeRequest.fromStation}—{activeRequest.toStation}</div>
                <div>Duration: {activeRequest.durationMinutes} mins</div>
                <div>Priority: {activeRequest.priority}</div>
              </div>
            )}

            <div>
              <label className="text-[11px] font-bold text-slate-600 block uppercase font-mono">
                Proposed Start (Time/Datetime)
              </label>
              <input
                type="text"
                value={proposedStart}
                onChange={(e) => setProposedStart(e.target.value)}
                className="mt-1 w-full rounded border-slate-300 text-xs font-mono p-2"
                placeholder="1900-01-01T11:30:00"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 block uppercase font-mono">
                Proposed End (Time/Datetime)
              </label>
              <input
                type="text"
                value={proposedEnd}
                onChange={(e) => setProposedEnd(e.target.value)}
                className="mt-1 w-full rounded border-slate-300 text-xs font-mono p-2"
                placeholder="1900-01-01T14:00:00"
              />
            </div>

            <div className="pt-2 flex items-center space-x-2">
              <button
                onClick={handleSimulate}
                disabled={isSimulating || !selectedRequestId}
                className="flex-1 inline-flex items-center justify-center space-x-2 bg-rail-navy hover:bg-slate-800 text-white font-bold py-2.5 px-4 rounded text-xs transition-colors shadow-sm disabled:opacity-50"
              >
                <Play className="h-4 w-4 text-rail-green fill-current" />
                <span>{isSimulating ? 'Simulating...' : 'Run Simulation'}</span>
              </button>

              <button
                onClick={() => {
                  setSimulationResult(null);
                  setError(null);
                }}
                className="p-2.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50"
                title="Reset Workbench"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded">
                {error}
              </div>
            )}
          </div>

          {/* Results Display (8 cols) */}
          <div className="lg:col-span-8 flex flex-col gap-4">
            {/* Visual Tracks for What-If Scenarios (Screenshot 161651) */}
            <RailwayTrack
              title="Simulation Scenario: Candidate Window Comparison"
              subtitle="Projected train interaction on active corridor (WHAT-IF / SIMULATION ONLY)"
              stations={[
                { name: activeRequest?.fromStation || 'ORIGIN', code: activeRequest?.fromStation || 'ORIG' },
                { name: activeRequest?.toStation || 'SECTION END', code: activeRequest?.toStation || 'END', isJunction: false },
              ]}
              blocks={[
                {
                  id: 'sim-block',
                  department: activeRequest?.department || 'MISSING DATA',
                  fromStationIndex: 0,
                  toStationIndex: 1,
                  label: 'PROPOSED SIMULATED BLOCK (SANDBOX)',
                },
              ]}
              trains={[]}
              directionLabel="WHAT-IF RUNTIME SIMULATION"
            />

            {/* Simulation Results Card */}
            {simulationResult ? (
              <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-subtle space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    <h3 className="text-sm font-bold text-slate-900 font-sans">
                      Simulation Complete — Impact Metrics
                    </h3>
                  </div>
                  <span className="px-2.5 py-1 rounded text-[10px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300">
                    WHAT-IF / SIMULATION ONLY
                  </span>
                </div>

                <div className="p-2.5 bg-amber-50/70 border border-amber-200 rounded text-[11px] text-amber-900 font-medium">
                  <strong>WHAT-IF / SIMULATION ONLY:</strong> This projection is sandbox-evaluated and does NOT commit operational block approvals or modify the active timetable.
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="p-3 bg-slate-50 rounded border border-slate-200">
                    <span className="text-[10px] font-mono uppercase text-slate-400">Total Delay</span>
                    <div className="text-xl font-bold font-mono text-slate-900 mt-0.5">
                      {totalDelay ?? 'MISSING DATA'} min
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 rounded border border-slate-200">
                    <span className="text-[10px] font-mono uppercase text-slate-400">Impact Score</span>
                    <div className="text-xl font-bold font-mono text-emerald-600 mt-0.5">
                      {impactScore ?? '--'}
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 rounded border border-slate-200">
                    <span className="text-[10px] font-mono uppercase text-slate-400">Conflicts</span>
                    <div className="text-xl font-bold font-mono text-slate-900 mt-0.5">
                      {conflictCount ?? 'MISSING DATA'}
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 rounded border border-slate-200">
                    <span className="text-[10px] font-mono uppercase text-slate-400">Feasibility</span>
                    <div className="text-sm font-bold text-emerald-700 mt-1 uppercase font-mono">
                      {isFeasible === undefined ? 'MISSING DATA' : isFeasible ? 'Feasible' : 'Infeasible'}
                    </div>
                  </div>
                </div>

                {(directDelay !== undefined || cascadeDelay !== undefined || affectedTrainCount !== undefined) && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-slate-600">
                    {directDelay !== undefined && (
                      <div className="p-2 bg-slate-50 border border-slate-200 rounded">
                        <span className="block font-mono uppercase text-slate-400">Direct Delay</span>
                        <span className="font-bold font-mono text-slate-900">{directDelay} min</span>
                      </div>
                    )}
                    {cascadeDelay !== undefined && (
                      <div className="p-2 bg-slate-50 border border-slate-200 rounded">
                        <span className="block font-mono uppercase text-slate-400">Cascade Delay</span>
                        <span className="font-bold font-mono text-slate-900">{cascadeDelay} min</span>
                      </div>
                    )}
                    {affectedTrainCount !== undefined && (
                      <div className="p-2 bg-slate-50 border border-slate-200 rounded">
                        <span className="block font-mono uppercase text-slate-400">Affected Trains</span>
                        <span className="font-bold font-mono text-slate-900">{affectedTrainCount}</span>
                      </div>
                    )}
                  </div>
                )}

                {simulationResult.explanation && (
                  <div className="p-3.5 bg-emerald-50/60 border border-emerald-200 rounded text-xs text-slate-700">
                    <span className="font-bold text-emerald-900 block mb-1">
                      Engine Rationale:
                    </span>
                    <p>{simulationResult.explanation}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 bg-white border border-slate-200 rounded-lg text-center text-slate-400 text-xs italic shadow-subtle">
                Select a request and click "Run Simulation" to execute the Python Brain What-If optimizer.
              </div>
            )}
          </div>
        </div>
      </main>

      <FooterAdvisory />
    </div>
  );
};
