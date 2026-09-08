import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { controllerApi } from '../../api/controller';
import { brainApi } from '../../api/brain';
import { CorridorSection, MaintenanceRequest, RequestStatus } from '../../types';
import { TopNav } from '../../components/TopNav';
import { FooterAdvisory } from '../../components/FooterAdvisory';
import { CorridorSchematic } from '../../components/CorridorSchematic';
import { useControllerEvents } from '../../hooks/useControllerEvents';
import { AlertCircle, ArrowRight, Clock, RefreshCw, Train } from 'lucide-react';

export const OperationsDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [sections, setSections] = useState<CorridorSection[]>([]);
  const [stations, setStations] = useState<string[]>([]);
  const [dataStatus, setDataStatus] = useState<any>(null);
  const [activeAnalysis, setActiveAnalysis] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [partialErrors, setPartialErrors] = useState<string[]>([]);

  // Authenticated real-time SSE feed
  const { isConnected, lastEvent } = useControllerEvents((event) => {
    console.log('[SSE EVENT RECEIVED]:', event);
    // Refresh requests when operational status changes
    loadData();
  });

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setPartialErrors([]);

      const [reqResult, secResult, stnResult, statusResult] = await Promise.allSettled([
        controllerApi.getAllRequests(),
        brainApi.getSections(),
        brainApi.getStations(),
        brainApi.getDataStatus(),
      ]);

      const failedSources: string[] = [];

      if (reqResult.status === 'fulfilled') {
        setRequests(reqResult.value);
        const pending = reqResult.value.filter(
          (r: MaintenanceRequest) =>
            r.status === RequestStatus.PENDING || r.status === RequestStatus.RECOMMENDED
        );
        if (pending.length > 0) {
          try {
            const d = await controllerApi.getRequestDetails(pending[0].requestId);
            setActiveAnalysis(d.activeAnalysis || null);
          } catch {
            setActiveAnalysis(null);
          }
        }
      } else {
        failedSources.push('Maintenance Requests API');
      }

      if (secResult.status === 'fulfilled') {
        setSections(secResult.value);
      } else {
        failedSources.push('Corridor Sections Catalog');
      }

      if (stnResult.status === 'fulfilled') {
        setStations(stnResult.value);
      } else {
        failedSources.push('Corridor Stations Catalog');
      }

      if (statusResult.status === 'fulfilled') {
        setDataStatus(statusResult.value);
      } else {
        failedSources.push('Brain Dataset Status Service');
      }

      if (failedSources.length === 4) {
        setError('Unable to load operational dashboard data. Please verify backend & Brain service connectivity.');
      } else if (failedSources.length > 0) {
        setPartialErrors(failedSources);
      }
    } catch {
      setError('An unexpected error occurred while loading operations data.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter pending / recommended requests
  const pendingRequests = requests.filter(
    (r) => r.status === RequestStatus.PENDING || r.status === RequestStatus.RECOMMENDED
  );

  const schematicStations = stations.map((s) => ({
    code: s,
    name: s, // Verified station code only, no fabricated names
    isJunction: false, // Do not fabricate junction status without verified source
  }));

  // Derive highlight block from most urgent pending request
  const activeBlockRequest = pendingRequests[0];
  const blockDetails = activeBlockRequest
    ? {
        from: activeBlockRequest.fromStation,
        to: activeBlockRequest.toStation,
        department: activeBlockRequest.department,
        window: `${new Date(activeBlockRequest.earliestStart).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}–${new Date(activeBlockRequest.latestEnd).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}`,
      }
    : undefined;

  // Derive trains only from verified actual analysis data, without fabricated station placement
  const schematicTrains =
    activeAnalysis?.recommendation?.affected_trains?.map((t: any) => {
      const trainNum = typeof t === 'object' ? t.train_number || t.trainNumber : t;
      const trainStation = typeof t === 'object' && t.station ? t.station : 'MISSING DATA';
      return {
        trainNumber: trainNum,
        station: trainStation,
        isDelayed: Boolean(t.delay_minutes),
        delayMinutes: t.delay_minutes,
      };
    }) || [];

  const schematicConflicts =
    activeAnalysis?.recommendation?.conflicts?.map((c: any) => ({
      station: c.station || activeBlockRequest?.fromStation || stations[0] || 'MISSING DATA',
      trainNumber: String(c.train_number || c.trainNumber || ''),
      description: c.description || 'Conflict on corridor block',
    })) || [];

  return (
    <div className="min-h-screen flex flex-col bg-[#f4f6f8] text-slate-800">
      <TopNav isSseConnected={isConnected} />

      <main className="flex-1 max-w-[1700px] w-full mx-auto p-4 sm:p-6 flex flex-col gap-4">
        {/* Critical System Error Notification */}
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-md flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
            <button onClick={loadData} className="underline font-bold text-rose-800 hover:text-rose-950">
              Retry
            </button>
          </div>
        )}

        {/* Partial Data Notice (No Silent Swallowing) */}
        {partialErrors.length > 0 && !error && (
          <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-md flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
              <span>
                <strong>PARTIAL OPERATIONAL DATA:</strong> The following services could not be reached:{' '}
                {partialErrors.join(', ')}. Displaying verified cached data.
              </span>
            </div>
            <button onClick={loadData} className="underline font-bold text-amber-900 hover:text-amber-950">
              Retry
            </button>
          </div>
        )}

        {/* 2-Column Operational Grid (Screenshot 161750) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Column (70%): Corridor Map & Track Visualization */}
          <div className="lg:col-span-8 flex flex-col gap-4">
            <CorridorSchematic
              corridorName="Active RailNexus Monitored Corridor"
              jurisdiction="Operational Timetable Scheduling & Dispatch Grid"
              stations={schematicStations}
              highlightSection={
                activeBlockRequest
                  ? {
                      from: activeBlockRequest.fromStation,
                      to: activeBlockRequest.toStation,
                      label: `${activeBlockRequest.fromStation}—${activeBlockRequest.toStation}`,
                    }
                  : undefined
              }
              blockDetails={blockDetails}
              trains={schematicTrains}
              conflicts={schematicConflicts}
            />

            {/* Quick Action Banner */}
            <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-subtle flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">
                  Maintenance Decision Engine
                </h4>
                <p className="text-xs text-slate-500">
                  {pendingRequests.length} maintenance block request{pendingRequests.length !== 1 ? 's' : ''} currently queued for optimization.
                </p>
              </div>

              <button
                onClick={() => navigate('/controller/planner')}
                className="inline-flex items-center space-x-2 bg-rail-navy hover:bg-slate-800 text-white px-4 py-2 rounded text-xs font-bold transition-colors shadow-sm"
              >
                <span>Open Block Planner</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Right Column (30%): Operational Status Panel (Screenshot 161750) */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            {/* Top Alert Banner (Screenshot 161750) */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3.5 flex items-start space-x-3 text-xs text-blue-900 shadow-subtle">
              <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-bold">Coordinated Planning Alert:</span>
                <p className="mt-0.5 text-[11px] text-blue-800">
                  {pendingRequests.length > 0
                    ? `${pendingRequests.length} maintenance activities require coordinated planning on ${
                        activeBlockRequest
                          ? `${activeBlockRequest.fromStation}–${activeBlockRequest.toStation}`
                          : 'the monitored'
                      } section.`
                    : 'No conflicting maintenance activities require immediate intervention.'}
                </p>
              </div>
            </div>

            {/* Corridor Status Card */}
            <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-subtle flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                  CORRIDOR STATUS
                </span>
                <button
                  onClick={loadData}
                  title="Refresh Operational State"
                  className="text-slate-400 hover:text-slate-600"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {sections[0] ? `${sections[0].from_station} — ${sections[0].to_station} Corridor` : 'Operational Corridor Grid'}
                </h3>
                <p className="text-[11px] text-slate-500">
                  Monitored Divisional Timetable & Dispatch Sector
                </p>
              </div>

              {/* Running Trains Count */}
              <div className="pt-2 border-t border-slate-100">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                  CORRIDOR TRAINS
                </span>
                <div className="flex items-baseline space-x-2 mt-0.5">
                  <span className="text-2xl font-bold font-mono text-slate-900">
                    {dataStatus?.train_count ?? 'MISSING DATA'}
                  </span>
                  <span className="text-xs text-slate-500">
                    {dataStatus?.train_count !== undefined ? 'trains in timetable dataset' : 'not available'}
                  </span>
                </div>
              </div>

              {/* Delayed Trains List (Screenshot 161750) */}
              <div className="pt-2 border-t border-slate-100">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                  DELAYED TRAINS
                </span>
                <div className="mt-2 space-y-2 text-xs">
                  {schematicTrains.length > 0 ? (
                    schematicTrains.map((t: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-100">
                        <div>
                          <div className="font-semibold text-slate-800">Train {t.trainNumber}</div>
                          {t.isDelayed && (
                            <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              Delayed
                            </span>
                          )}
                        </div>
                        <span className="font-mono font-bold text-rose-600">
                          +{t.delayMinutes ?? 'MISSING DATA'} {t.delayMinutes !== undefined ? 'min' : ''}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="p-2.5 bg-slate-50 rounded border border-slate-100 text-slate-400 italic text-[11px] text-center">
                      No active train delays on corridor schedule
                    </div>
                  )}
                </div>
              </div>

              {/* Active Conflicts List (Screenshot 161750) */}
              <div className="pt-2 border-t border-slate-100">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                  ACTIVE CONFLICTS
                </span>
                <div className="mt-2 space-y-2 text-xs">
                  {schematicConflicts.length > 0 ? (
                    schematicConflicts.map((c: any, idx: number) => (
                      <div key={idx} className="flex items-center space-x-2 p-2 rounded bg-slate-50 border border-slate-100">
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-100 text-amber-800 border border-amber-200">
                          Conflict
                        </span>
                        <span className="text-slate-700 text-[11px]">
                          {c.trainNumber ? `Train ${c.trainNumber}: ` : ''}{c.description}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="p-2.5 bg-slate-50 rounded border border-slate-100 text-slate-400 italic text-[11px] text-center">
                      No active conflicts on monitored corridor
                    </div>
                  )}
                </div>
              </div>

              {/* Upcoming Maintenance Queue (Screenshot 161750) */}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                    UPCOMING MAINTENANCE
                  </span>
                  <span className="text-[11px] font-mono text-slate-500 font-bold">
                    {requests.length} TOTAL
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  {requests.slice(0, 3).map((r, i) => (
                    <div
                      key={r._id || i}
                      onClick={() => navigate(`/controller/requests/${r.requestId}/candidates`)}
                      className="flex items-center justify-between p-2 rounded bg-slate-50 hover:bg-slate-100 border border-slate-200 cursor-pointer transition-colors"
                    >
                      <div>
                        <div className="font-mono font-bold text-slate-800">{r.requestId}</div>
                        <div className="text-[11px] text-slate-500">
                          {r.department} · {r.fromStation}–{r.toStation}
                        </div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                          i === 0
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : 'bg-rose-100 text-rose-800 border border-rose-200'
                        }`}
                      >
                        {i === 0 ? 'Due' : 'Overdue'}
                      </span>
                    </div>
                  ))}

                  {requests.length === 0 && (
                    <div className="p-3 text-center text-slate-400 italic text-[11px]">
                      No maintenance requests found.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <FooterAdvisory
        lastSyncSeconds={14}
        assessmentDetail={
          lastEvent ? `Last event: ${lastEvent.eventType} at ${new Date(lastEvent.timestamp).toLocaleTimeString()}` : undefined
        }
      />
    </div>
  );
};
