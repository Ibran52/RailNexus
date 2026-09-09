import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { maintenanceApi } from '../../api/maintenance';
import { BrainRun, MaintenanceRequest, RequestStatus } from '../../types';
import { TopNav } from '../../components/TopNav';
import { FooterAdvisory } from '../../components/FooterAdvisory';
import { StatusBadge } from '../../components/StatusBadge';
import { RailwayTrack } from '../../components/RailwayTrack';
import { useMaintenanceEvents } from '../../hooks/useMaintenanceEvents';
import {
  ArrowLeft,
  CheckCircle2,
  ShieldAlert,
  ShieldCheck,
  Clock,
  Radio,
  XCircle,
} from 'lucide-react';

export const RequestDetailsPage: React.FC = () => {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();

  const [request, setRequest] = useState<MaintenanceRequest | null>(null);
  const [brainRun, setBrainRun] = useState<BrainRun | null>(null);
  const [decision, setDecision] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (silent = false) => {
    if (!requestId) return;
    try {
      if (!silent) {
        setIsLoading(true);
      }
      setError(null);
      const data = await maintenanceApi.getRequest(requestId);
      setRequest(data.request);
      if (data.decision) {
        setDecision(data.decision);
      }

      let activeRun = data.activeAnalysis;
      if (!activeRun) {
        activeRun = await maintenanceApi.getRequestAnalysis(requestId).catch(() => undefined);
      }
      if (activeRun) setBrainRun(activeRun);
    } catch (err: any) {
      if (!silent) {
        setError(err.message || 'Failed to load maintenance requisition details.');
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, [requestId]);

  // Real-time SSE updates: If controller approves or rejects this request, reflect immediately
  const { isConnected: isSseConnected } = useMaintenanceEvents((event) => {
    if (event.requestId === requestId) {
      // In-place update of status if provided
      if (event.status) {
        setRequest((prev) => (prev ? { ...prev, status: event.status as RequestStatus } : prev));
      }
      // Silently reload all complete details & decision record
      loadData(true);
    }
  });

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  const rec = brainRun?.recommendation || (brainRun?.recommendations && brainRun.recommendations[0]);
  const isApproved = request?.status === RequestStatus.APPROVED;
  const isRejected = request?.status === RequestStatus.REJECTED;

  return (
    <div className="min-h-screen flex flex-col bg-slate-100">
      <TopNav />

      <main className="flex-1 max-w-[1700px] w-full mx-auto p-4 sm:p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/worker/dashboard')}
            className="inline-flex items-center space-x-1.5 text-xs text-slate-500 hover:text-slate-800 font-semibold cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Worker Dashboard</span>
          </button>

          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
              isSseConnected
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                : 'bg-amber-50 text-amber-700 border-amber-300'
            }`}
          >
            <Radio className={`h-3 w-3 ${isSseConnected ? 'text-emerald-500 animate-pulse' : 'text-amber-500'}`} />
            <span>{isSseConnected ? 'LIVE UPDATES ACTIVE' : 'POLLING MODE'}</span>
          </span>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" />
            <span>{error}</span>
          </div>
        )}

        {/* Controller Approval Banner */}
        {isApproved && (
          <div className="bg-emerald-950 border border-emerald-500/80 rounded-xl p-5 text-white shadow-md animate-in fade-in duration-300">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/20 border border-emerald-400/40 rounded-lg text-emerald-400">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold font-mono uppercase tracking-wider text-emerald-300">
                      CHIEF CONTROLLER AUTHORIZATION GRANTED · TRACK BLOCK APPROVED
                    </h2>
                    <span className="px-2 py-0.5 rounded bg-emerald-500 text-slate-950 font-mono font-bold text-[10px] uppercase tracking-wider">
                      OFFICIALLY APPROVED
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1 font-sans">
                    {decision?.reason || 'Approved optimal coordinated maintenance block window with lowest network delay impact.'}
                  </p>
                </div>
              </div>

              {decision?.selectedWindow && (
                <div className="bg-emerald-900/60 border border-emerald-600/40 rounded-lg px-4 py-2 text-right font-mono">
                  <span className="text-[10px] uppercase text-emerald-300 block font-bold">
                    Allocated Track Window
                  </span>
                  <span className="text-sm font-bold text-white">
                    {new Date(decision.selectedWindow.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–
                    {new Date(decision.selectedWindow.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Controller Rejection Banner */}
        {isRejected && (
          <div className="bg-rose-950 border border-rose-500/80 rounded-xl p-5 text-white shadow-md animate-in fade-in duration-300">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-rose-500/20 border border-rose-400/40 rounded-lg text-rose-400">
                <XCircle className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-sm font-bold font-mono uppercase tracking-wider text-rose-300">
                  REQUISITION REJECTED BY CHIEF CONTROLLER
                </h2>
                <p className="text-xs text-slate-300 mt-1">
                  Reason: {decision?.reason || 'Requisition cannot be accommodated in the requested corridor schedule.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Top Header Card */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-subtle flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-xl font-bold font-mono text-slate-900 tracking-tight">
                {request?.requestId || requestId}
              </h1>
              {request && <StatusBadge status={request.status} />}
            </div>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Requisition submitted by <span className="font-semibold text-slate-700">{request?.department}</span> on{' '}
              {request ? new Date(request.createdAt).toLocaleString() : '—'}
            </p>
          </div>

          <div className="flex items-center space-x-6 text-xs font-mono">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase">Section</span>
              <span className="font-bold text-slate-800 text-sm">
                {request?.fromStation} — {request?.toStation}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase">Duration</span>
              <span className="font-bold text-slate-800 text-sm">
                {request?.durationMinutes} min
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase">Priority</span>
              <span className="font-bold text-slate-800 text-sm">{request?.priority}</span>
            </div>
          </div>
        </div>

        {/* Track Schematic Visualization */}
        {(() => {
          const mappedTrains =
            rec?.affected_trains
              ?.map((t: any) => {
                const trainNumber = typeof t === 'object' ? t.train_number ?? t.trainNumber : t;
                const positionPercent =
                  typeof t === 'object'
                    ? Number(t.position_percent ?? t.positionPercent ?? t.location_percent ?? NaN)
                    : NaN;

                if (!trainNumber || !Number.isFinite(positionPercent) || positionPercent < 0 || positionPercent > 100) {
                  return null;
                }

                return {
                  trainNumber,
                  positionPercent,
                  direction: 'UP' as const,
                  status: (t.delay_minutes ? 'DELAYED' : 'ON_TIME') as any,
                  delayMinutes: t.delay_minutes,
                };
              })
              ?.filter(Boolean) ?? [];

          return (
            <>
              <RailwayTrack
                title={`Section Layout: ${request?.fromStation || 'A'} — ${request?.toStation || 'B'}`}
                subtitle="Simulated track block occupancy against scheduled train movements"
                stations={[
                  { name: 'From Station', code: request?.fromStation || 'A' },
                  { name: 'Block Section', code: 'SEC-01' },
                  { name: 'To Station', code: request?.toStation || 'B', isJunction: true },
                ]}
                blocks={[
                  {
                    id: 'req-block',
                    department: request?.department || 'ENGINEERING',
                    fromStationIndex: 0,
                    toStationIndex: 2,
                    label: `${request?.department || 'MAINTENANCE'} BLOCK`,
                  },
                ]}
                trains={mappedTrains}
                highlightWindow={
                  decision?.selectedWindow
                    ? `${new Date(decision.selectedWindow.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–${new Date(decision.selectedWindow.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : rec
                    ? `${new Date(rec.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–${new Date(rec.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : undefined
                }
              />

              {rec?.affected_trains?.length && mappedTrains.length === 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-[11px] font-mono text-amber-800">
                  LIVE TRAIN LOCATION: MISSING DATA
                </div>
              )}
            </>
          );
        })()}

        {/* Recommendation Assessment Box (if available) */}
        {rec ? (
          <div className="bg-emerald-50/70 border border-emerald-300 rounded-lg p-5 shadow-subtle flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <h3 className="text-sm font-bold text-emerald-950 font-sans">
                  Brain Recommended Window Generated
                </h3>
              </div>
              <span className="px-2.5 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                RECOMMENDED
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center my-2">
              <div className="bg-white p-3 rounded border border-emerald-200">
                <span className="text-[10px] uppercase font-mono text-slate-400 font-bold block">
                  Recommended Window
                </span>
                <span className="text-base font-bold font-mono text-slate-900 mt-1 block">
                  {new Date(rec.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–
                  {new Date(rec.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              <div className="bg-white p-3 rounded border border-emerald-200">
                <span className="text-[10px] uppercase font-mono text-slate-400 font-bold block">
                  Estimated Train Delay
                </span>
                <span className="text-base font-bold font-mono text-emerald-600 mt-1 block">
                  {rec.direct_delay_minutes ?? rec.total_delay_minutes ?? 'MISSING DATA'}
                  {rec.direct_delay_minutes !== undefined || rec.total_delay_minutes !== undefined ? ' min' : ''}
                </span>
              </div>

              <div className="bg-white p-3 rounded border border-emerald-200">
                <span className="text-[10px] uppercase font-mono text-slate-400 font-bold block">
                  Conflicts
                </span>
                <span className="text-base font-bold font-mono text-slate-900 mt-1 block">
                  {rec.conflict_count ?? rec.conflicts?.length ?? 'MISSING DATA'}
                </span>
              </div>

              <div className="bg-white p-3 rounded border border-emerald-200">
                <span className="text-[10px] uppercase font-mono text-slate-400 font-bold block">
                  Feasibility
                </span>
                <span className="text-sm font-bold font-mono text-emerald-700 mt-1.5 block uppercase">
                  {rec.feasibility ??
                    (rec.is_feasible === undefined ? 'MISSING DATA' : rec.is_feasible ? 'Feasible' : 'Infeasible')}
                </span>
              </div>
            </div>

            {brainRun?.explanation && (
              <p className="text-xs text-slate-700 mt-1 bg-white p-3 rounded border border-emerald-200">
                <span className="font-bold text-emerald-950 font-mono">ASSESSMENT: </span>
                {brainRun.explanation}
              </p>
            )}
          </div>
        ) : (
          <div className="p-6 bg-white border border-slate-200 rounded-lg text-center text-slate-400 text-xs shadow-subtle italic">
            Slot optimization analysis currently running or pending Controller evaluation.
          </div>
        )}
      </main>

      <FooterAdvisory />
    </div>
  );
};
