import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { controllerApi } from '../../api/controller';
import { BrainRun, CandidateWindow, MaintenanceRequest } from '../../types';
import { TopNav } from '../../components/TopNav';
import { FooterAdvisory } from '../../components/FooterAdvisory';
import { ArrowLeft, CheckCircle2, ArrowRight } from 'lucide-react';

export const WindowComparisonPage: React.FC = () => {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();

  const [request, setRequest] = useState<MaintenanceRequest | null>(null);
  const [candidates, setCandidates] = useState<CandidateWindow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    async function loadData() {
      if (!requestId) return;
      try {
        const details = await controllerApi.getRequestDetails(requestId);
        setRequest(details.request);

        let activeRun = details.activeAnalysis;
        if (!activeRun) {
          activeRun = await controllerApi.getRequestAnalysis(requestId);
        }

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
            conflict_count: primaryRec.conflict_count ?? activeRun?.metrics?.conflict_count ?? activeRun?.conflicts?.length ?? 0,
            direct_delay_minutes: primaryRec.direct_delay_minutes ?? activeRun?.metrics?.direct_delay_minutes ?? 0,
            total_delay_minutes: primaryRec.total_delay_minutes ?? activeRun?.metrics?.total_delay_minutes ?? activeRun?.metrics?.direct_delay_minutes ?? 0,
            affected_train_count: primaryRec.affected_train_count ?? activeRun?.metrics?.affected_train_count ?? 0,
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
                conflict_count: alt.conflict_count ?? alt.conflicts?.length ?? 0,
                direct_delay_minutes: alt.direct_delay_minutes ?? alt.total_delay_minutes ?? 0,
                total_delay_minutes: alt.total_delay_minutes ?? alt.direct_delay_minutes ?? 0,
                affected_train_count: alt.affected_train_count ?? alt.affected_trains?.length ?? 0,
                is_recommended: false,
              });
            }
          }
        }

        const mapped = rawOptions.map((opt, idx) => {
          const letter = String.fromCharCode(65 + idx);
          return {
            ...opt,
            option_label: `OPTION ${letter}`,
            is_recommended: opt.is_recommended ?? (idx === 0),
          };
        });

        setCandidates(mapped);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [requestId]);

  const formatWindow = (startStr?: string, endStr?: string) => {
    if (!startStr || !endStr) return 'MISSING DATA';
    const s = new Date(startStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const e = new Date(endStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${s}–${e}`;
  };

  const criteria = [
    { label: 'Window (IST)', key: 'window' },
    { label: 'Maintenance completion', key: 'completion' },
    { label: 'Trains affected', key: 'trains' },
    { label: 'Est. delay-minutes', key: 'delay' },
    { label: 'Priority trains affected', key: 'priorityTrains' },
    { label: 'Conflicts', key: 'conflicts' },
    { label: 'Temporary Speed Restriction', key: 'tsr' },
    { label: 'Combined activities', key: 'combined' },
    { label: 'Overall impact', key: 'overallImpact' },
    { label: 'Status', key: 'status' },
  ];

  const getCriterionValue = (cand: CandidateWindow, key: string) => {
    switch (key) {
      case 'window':
        return formatWindow(cand.start, cand.end);
      case 'completion':
        return 'Feasible';
      case 'trains':
        return cand.affected_train_count ?? cand.affected_trains?.length ?? 0;
      case 'delay':
        return cand.direct_delay_minutes ?? cand.total_delay_minutes ?? 0;
      case 'priorityTrains':
        return cand.priority_trains_affected !== undefined
          ? (cand.priority_trains_affected === 0 ? 'None' : cand.priority_trains_affected)
          : 'None';
      case 'conflicts':
        return cand.conflict_count ?? cand.conflicts?.length ?? 0;
      case 'tsr':
        return cand.speed_restriction_required ? 'Required — speed limit applied' : 'Not required';
      case 'combined':
        return request?.department || 'Coordinated';
      case 'overallImpact':
        return cand.impact_score !== undefined
          ? `Score: ${cand.impact_score}`
          : cand.is_recommended ? 'Lower' : 'Elevated';
      case 'status':
        return cand.is_recommended ? 'Recommended' : '—';
      default:
        return '—';
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-100">
      <TopNav />

      <main className="flex-1 max-w-[1700px] w-full mx-auto p-4 sm:p-6 flex flex-col gap-5">
        {/* Header (Screenshot 161842) */}
        <div>
          <h1 className="text-xl font-bold text-slate-900 font-sans tracking-tight">
            Block Window Comparison & Recommendation
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Side-by-side comparison of all {candidates.length} candidate windows ·{' '}
            <span className="font-semibold text-slate-800">
              {request ? `${request.fromStation}–${request.toStation}` : 'Monitored Corridor'}
            </span>{' '}
            · {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
          </p>
        </div>

        {/* Action Toolbar */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate(`/controller/requests/${requestId}/candidates`)}
            className="inline-flex items-center space-x-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-xs font-semibold transition-colors shadow-subtle"
          >
            <ArrowLeft className="h-4 w-4 text-slate-500" />
            <span>Back to Candidate Cards</span>
          </button>

          <button
            onClick={() => navigate(`/controller/requests/${requestId}/decision`)}
            className="inline-flex items-center space-x-2 bg-rail-navy hover:bg-slate-800 text-white px-5 py-2 rounded-lg text-xs font-bold transition-colors shadow-sm"
          >
            <span>Proceed to Decision</span>
            <ArrowRight className="h-4 w-4 text-rail-green" />
          </button>
        </div>

        {/* Side-by-side Comparison Matrix (Screenshot 161842) */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-subtle overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-mono uppercase text-slate-500 tracking-wider">
                  <th className="py-3.5 px-6 font-bold w-1/4">CRITERION</th>
                  {candidates.map((cand, idx) => (
                    <th
                      key={idx}
                      className={`py-3.5 px-6 font-bold ${
                        cand.is_recommended
                          ? 'bg-emerald-50/70 text-emerald-900 border-x border-emerald-200'
                          : 'text-slate-800'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <span>{cand.option_label}</span>
                        {cand.is_recommended && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            RECOMMENDED
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 font-sans">
                {criteria.map((cr) => (
                  <tr key={cr.key} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 px-6 font-semibold text-slate-700 bg-slate-50/30">
                      {cr.label}
                    </td>

                    {candidates.map((cand, idx) => {
                      const val = getCriterionValue(cand, cr.key);
                      const isRec = cand.is_recommended;
                      return (
                        <td
                          key={idx}
                          className={`py-3 px-6 font-medium ${
                            isRec
                              ? 'bg-emerald-50/40 font-semibold text-slate-900 border-x border-emerald-100'
                              : 'text-slate-700'
                          }`}
                        >
                          {val}
                        </td>
                      );
                    })}
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
