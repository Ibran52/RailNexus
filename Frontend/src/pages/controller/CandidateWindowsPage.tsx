import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { controllerApi } from '../../api/controller';
import { BrainRun, CandidateWindow, MaintenanceRequest } from '../../types';
import { TopNav } from '../../components/TopNav';
import { FooterAdvisory } from '../../components/FooterAdvisory';
import { ArrowLeft, CheckCircle2, SlidersHorizontal, Eye, AlertCircle } from 'lucide-react';

export const CandidateWindowsPage: React.FC = () => {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();

  const [request, setRequest] = useState<MaintenanceRequest | null>(null);
  const [brainRun, setBrainRun] = useState<BrainRun | null>(null);
  const [candidates, setCandidates] = useState<CandidateWindow[]>([]);
  const [selectedWindowIdx, setSelectedWindowIdx] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      if (!requestId) return;
      try {
        setIsLoading(true);
        setError(null);

        const details = await controllerApi.getRequestDetails(requestId);
        setRequest(details.request);

        let activeRun = details.activeAnalysis;
        if (!activeRun) {
          activeRun = await controllerApi.getRequestAnalysis(requestId);
        }
        setBrainRun(activeRun);

        let primaryRec = activeRun?.recommendation;
        let alts = activeRun?.alternatives || [];

        if (activeRun?.recommendations && activeRun.recommendations.length > 0) {
          if (activeRun.recommendations[0]?.start) {
            primaryRec = activeRun.recommendations[0];
            alts = activeRun.recommendations.slice(1);
          } else {
            const reqItem = activeRun.recommendations.find((r: any) => r.request_id === requestId) || activeRun.recommendations[0];
            if (reqItem) {
              if (reqItem.start) {
                primaryRec = reqItem;
              } else {
                primaryRec = reqItem.recommendation || primaryRec;
                alts = reqItem.alternatives || alts;
              }
            }
          }
        }

        const rawOptions: CandidateWindow[] = [];
        if (primaryRec && primaryRec.start && primaryRec.end) {
          rawOptions.push({
            ...primaryRec,
            conflict_count: primaryRec.conflict_count ?? activeRun?.metrics?.conflict_count ?? activeRun?.conflicts?.length,
            direct_delay_minutes: primaryRec.direct_delay_minutes ?? activeRun?.metrics?.direct_delay_minutes,
            total_delay_minutes: primaryRec.total_delay_minutes ?? activeRun?.metrics?.total_delay_minutes ?? activeRun?.metrics?.direct_delay_minutes,
            affected_train_count: primaryRec.affected_train_count ?? activeRun?.metrics?.affected_train_count,
            affected_trains: primaryRec.affected_trains ?? activeRun?.affected_trains ?? [],
            conflicts: primaryRec.conflicts ?? activeRun?.conflicts ?? [],
            is_recommended: true,
          });
        }

        if (Array.isArray(alts)) {
          for (const alt of alts) {
            if (alt && alt.start && alt.end) {
              rawOptions.push({
                ...alt,
                conflict_count: alt.conflict_count ?? alt.conflicts?.length,
                direct_delay_minutes: alt.direct_delay_minutes ?? alt.total_delay_minutes,
                total_delay_minutes: alt.total_delay_minutes ?? alt.direct_delay_minutes,
                affected_train_count: alt.affected_train_count ?? alt.affected_trains?.length,
                is_recommended: false,
              });
            }
          }
        }

        // Map dynamic positional labels (Option A, Option B, Option C...)
        const mapped = rawOptions.map((opt, idx) => {
          const letter = String.fromCharCode(65 + idx); // A, B, C...
          return {
            ...opt,
            option_label: `Option ${letter}`,
            is_recommended: opt.is_recommended ?? (idx === 0),
          };
        });

        setCandidates(mapped);
      } catch (err: any) {
        setError(err.message || 'Failed to load candidate block windows.');
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [requestId]);

  const handleSelect = (idx: number) => {
    setSelectedWindowIdx(idx);
    navigate(`/controller/requests/${requestId}/decision`, {
      state: { selectedCandidate: candidates[idx] },
    });
  };

  const handleViewImpact = (idx: number) => {
    navigate(`/controller/requests/${requestId}/impact`, {
      state: { candidate: candidates[idx] },
    });
  };

  const formatWindow = (startStr?: string, endStr?: string) => {
    if (!startStr || !endStr) return 'MISSING DATA';
    const s = new Date(startStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const e = new Date(endStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${s}–${e} IST`;
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-100">
      <TopNav />

      <main className="flex-1 max-w-[1700px] w-full mx-auto p-4 sm:p-6 flex flex-col gap-5">
        {/* Section Header (Screenshot 161822) */}
        <div>
          <h1 className="text-xl font-bold text-slate-900 font-sans tracking-tight">
            Candidate Block Windows
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            {candidates.length} candidate window{candidates.length !== 1 ? 's' : ''} scored for train impact on the{' '}
            <span className="font-semibold text-slate-800">
              {request ? `${request.fromStation}–${request.toStation}` : 'Monitored Corridor'}
            </span>{' '}
            section · {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
          </p>
          <p className="text-[11px] text-slate-600 font-medium mt-1">
            Submitted By: <span className="font-semibold text-slate-800">{request?.submitterName || 'MISSING DATA'}</span>
          </p>
        </div>

        {/* Toolbar Buttons */}
        <div className="flex items-center space-x-3">
          <button
            onClick={() => navigate('/controller/planner')}
            className="inline-flex items-center space-x-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-xs font-semibold transition-colors shadow-subtle"
          >
            <ArrowLeft className="h-4 w-4 text-slate-500" />
            <span>Back to Activity Register</span>
          </button>

          <button
            onClick={() => navigate(`/controller/requests/${requestId}/compare`)}
            className="inline-flex items-center space-x-2 bg-rail-navy hover:bg-slate-800 text-white px-5 py-2 rounded-lg text-xs font-bold transition-colors shadow-sm"
          >
            <SlidersHorizontal className="h-4 w-4 text-rail-green" />
            <span>Compare & Recommend</span>
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        )}

        {/* Candidate Window Comparison Cards Grid (Screenshot 161822) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch">
          {candidates.map((cand, idx) => {
            const isRec = cand.is_recommended;
            const delayMinutes =
              cand.direct_delay_minutes !== undefined
                ? cand.direct_delay_minutes
                : cand.total_delay_minutes ?? 'MISSING DATA';

            const affectedTrains =
              cand.affected_train_count !== undefined
                ? cand.affected_train_count
                : cand.affected_trains?.length ?? 'MISSING DATA';

            const conflictsCount =
              cand.conflict_count !== undefined
                ? cand.conflict_count
                : cand.conflicts?.length ?? 'MISSING DATA';

            const priorityTrains =
              cand.priority_trains_affected !== undefined
                ? (cand.priority_trains_affected === 0 ? 'None' : cand.priority_trains_affected)
                : 'MISSING DATA';

            return (
              <div
                key={idx}
                className={`bg-white rounded-lg flex flex-col justify-between shadow-subtle transition-all overflow-hidden ${
                  isRec
                    ? 'border-2 border-emerald-500 ring-2 ring-emerald-100'
                    : 'border border-slate-200'
                }`}
              >
                <div>
                  {/* Top Green Recommendation Banner (Screenshot 161822) */}
                  {isRec && (
                    <div className="bg-emerald-600 px-4 py-1.5 text-center text-white text-[11px] font-bold tracking-wider font-mono uppercase">
                      LOWEST OPERATIONAL IMPACT — RECOMMENDED FOR COORDINATED BLOCK
                    </div>
                  )}

                  <div className="p-5">
                    {/* Card Title & Window Header */}
                    <div className="flex items-start justify-between border-b border-slate-100 pb-3 mb-4">
                      <div>
                        <h3 className="text-base font-bold text-slate-900 font-sans">
                          {cand.option_label}
                        </h3>
                        <p className="text-xs font-mono font-semibold text-slate-500 mt-0.5">
                          {formatWindow(cand.start, cand.end)}
                        </p>
                      </div>

                      {isRec && (
                        <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-300 px-2.5 py-0.5 rounded-full text-xs font-bold font-mono">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Recommended</span>
                        </span>
                      )}
                    </div>

                    {/* Metric Rows (Screenshot 161822) */}
                    <div className="space-y-2.5 text-xs">
                      <div className="flex items-center justify-between py-1 border-b border-slate-50">
                        <span className="text-slate-500">Maintenance completion</span>
                        <span className="font-semibold text-slate-800">{cand.feasibility || 'NOT IMPLEMENTED'}</span>
                      </div>

                      <div className="flex items-center justify-between py-1 border-b border-slate-50">
                        <span className="text-slate-500">Trains affected</span>
                        <span className="font-mono font-bold text-slate-800">
                          {affectedTrains}
                        </span>
                      </div>

                      <div className="flex items-center justify-between py-1 border-b border-slate-50">
                        <span className="text-slate-500">Est. delay-minutes</span>
                        <span
                          className={`font-mono font-bold ${
                            isRec ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {delayMinutes}
                        </span>
                      </div>

                      <div className="flex items-center justify-between py-1 border-b border-slate-50">
                        <span className="text-slate-500">Priority trains affected</span>
                        <span className="font-semibold text-slate-800">
                          {priorityTrains}
                        </span>
                      </div>

                      <div className="flex items-center justify-between py-1 border-b border-slate-50">
                        <span className="text-slate-500">Conflicts</span>
                        <span className="font-mono font-bold text-slate-800">
                          {conflictsCount}
                        </span>
                      </div>

                      <div className="flex items-center justify-between py-1 border-b border-slate-50">
                        <span className="text-slate-500">Temporary Speed Restriction</span>
                        <span className="font-medium text-slate-700">
                          {cand.speed_restriction_required === undefined
                            ? 'NOT IMPLEMENTED'
                            : cand.speed_restriction_required ? 'Required' : 'Not required'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between py-1 border-b border-slate-50">
                        <span className="text-slate-500">Combined activities</span>
                        <span className="font-medium text-slate-800">
                          NOT IMPLEMENTED
                        </span>
                      </div>

                      <div className="flex items-center justify-between py-1">
                        <span className="text-slate-500">Overall impact</span>
                        <span
                          className={`font-bold uppercase font-mono ${
                            isRec ? 'text-emerald-700' : 'text-slate-700'
                          }`}
                        >
                          {cand.impact_score !== undefined
                            ? `Score: ${cand.impact_score}`
                            : 'MISSING DATA'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Action Buttons (Screenshot 161822) */}
                <div className="p-5 pt-0 flex items-center space-x-3">
                  <button
                    onClick={() => handleViewImpact(idx)}
                    className="flex-1 inline-flex items-center justify-center space-x-1.5 bg-rail-navy hover:bg-slate-800 text-white px-3 py-2 rounded text-xs font-semibold transition-colors shadow-sm"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>View Impact Analysis</span>
                  </button>

                  <button
                    onClick={() => handleSelect(idx)}
                    className="flex-1 inline-flex items-center justify-center space-x-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-2 rounded text-xs font-semibold transition-colors shadow-subtle"
                  >
                    <span>Select Window</span>
                  </button>
                </div>
              </div>
            );
          })}

          {candidates.length === 0 && !isLoading && (
            <div className="col-span-3 p-8 bg-white border border-slate-200 rounded-lg text-center text-slate-400 italic">
              No candidate block windows available for this maintenance request.
            </div>
          )}
        </div>
      </main>

      <FooterAdvisory />
    </div>
  );
};
