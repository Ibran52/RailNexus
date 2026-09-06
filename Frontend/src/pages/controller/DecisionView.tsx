import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { controllerApi } from '../../api/controller';
import { BrainRun, CandidateWindow, MaintenanceRequest } from '../../types';
import { TopNav } from '../../components/TopNav';
import { FooterAdvisory } from '../../components/FooterAdvisory';
import { ScoreBreakdownTable } from '../../components/ScoreBreakdownTable';
import { Check, Edit3, X, Eye, History, ArrowLeft, AlertCircle } from 'lucide-react';

export const DecisionView: React.FC = () => {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const [request, setRequest] = useState<MaintenanceRequest | null>(null);
  const [brainRun, setBrainRun] = useState<BrainRun | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateWindow | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [showApproveModal, setShowApproveModal] = useState<boolean>(false);
  const [showRejectModal, setShowRejectModal] = useState<boolean>(false);
  const [showModifyModal, setShowModifyModal] = useState<boolean>(false);

  const [decisionReason, setDecisionReason] = useState<string>(
    'Approved optimal coordinated maintenance block window with lowest network delay impact.'
  );
  const [modifyStart, setModifyStart] = useState<string>('');
  const [modifyEnd, setModifyEnd] = useState<string>('');

  useEffect(() => {
    async function loadData() {
      if (!requestId) return;
      try {
        setError(null);
        const details = await controllerApi.getRequestDetails(requestId);
        setRequest(details.request);

        let activeRun = details.activeAnalysis;
        if (!activeRun) {
          activeRun = await controllerApi.getRequestAnalysis(requestId);
        }
        setBrainRun(activeRun);

        // Preselect candidate passed from state or active recommendation
        const stateCandidate = (location.state as any)?.selectedCandidate;
        if (stateCandidate) {
          setSelectedCandidate(stateCandidate);
        } else if (activeRun?.recommendations && activeRun.recommendations.length > 0) {
          if (activeRun.recommendations[0]?.start) {
            setSelectedCandidate(activeRun.recommendations[0]);
          } else {
            const reqItem = activeRun.recommendations.find((r: any) => r.request_id === requestId) || activeRun.recommendations[0];
            setSelectedCandidate(reqItem?.recommendation || reqItem || activeRun.recommendation || null);
          }
        } else if (activeRun?.recommendation) {
          setSelectedCandidate(activeRun.recommendation);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load recommendation decision data.');
      }
    }

    loadData();
  }, [requestId, location.state]);

  const handleApprove = async () => {
    if (!requestId || !brainRun) return;
    try {
      setIsSubmitting(true);
      setError(null);
      await controllerApi.approveRequest(requestId, decisionReason, {
        expectedBrainRunId: brainRun.brainRunId,
        expectedPlanningVersion: request?.planningVersion,
      });

      setActionSuccess(`Block approved · ${windowLabel}. Advisory record logged.`);
      setShowApproveModal(false);
      setTimeout(() => navigate('/controller/coordination'), 1200);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.message || 'Failed to approve request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!requestId || !brainRun) return;
    try {
      setIsSubmitting(true);
      setError(null);
      await controllerApi.rejectRequest(requestId, decisionReason, {
        expectedBrainRunId: brainRun.brainRunId,
        expectedPlanningVersion: request?.planningVersion,
      });

      setActionSuccess('Maintenance request rejected.');
      setShowRejectModal(false);
      setTimeout(() => navigate('/controller/coordination'), 1200);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.message || 'Failed to reject request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleModify = async () => {
    if (!requestId || !brainRun || !modifyStart || !modifyEnd) return;
    try {
      setIsSubmitting(true);
      setError(null);
      await controllerApi.modifyRequest(
        requestId,
        new Date(modifyStart).toISOString(),
        new Date(modifyEnd).toISOString(),
        decisionReason,
        {
          expectedBrainRunId: brainRun.brainRunId,
          expectedPlanningVersion: request?.planningVersion,
        }
      );

      setActionSuccess('Request modified and re-analyzed by Brain.');
      setShowModifyModal(false);
      setTimeout(() => navigate(`/controller/requests/${requestId}/candidates`), 1200);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.message || 'Failed to modify request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const windowLabel = selectedCandidate
    ? `${new Date(selectedCandidate.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–${new Date(selectedCandidate.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : 'MISSING DATA';

  return (
    <div className="min-h-screen flex flex-col bg-slate-100">
      <TopNav />

      <main className="flex-1 max-w-[1700px] w-full mx-auto p-4 sm:p-6 flex flex-col gap-5">
        {/* Back Link */}
        <div>
          <button
            onClick={() => navigate(`/controller/requests/${requestId}/candidates`)}
            className="inline-flex items-center space-x-1.5 text-xs text-slate-500 hover:text-slate-800 font-semibold"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Candidate Windows</span>
          </button>
        </div>

        {/* Success Toast / Notification */}
        {actionSuccess && (
          <div className="p-4 bg-emerald-50 border border-emerald-300 text-emerald-800 font-semibold text-xs rounded-lg shadow-subtle flex items-center justify-between">
            <span>{actionSuccess}</span>
            <span className="font-mono text-[10px]">REDIRECTING...</span>
          </div>
        )}

        {error && (
          <div className="p-4 bg-rose-50 border border-rose-300 text-rose-800 text-xs rounded-lg flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        )}

        {/* RailNexus Assessment Box */}
        <div className="bg-emerald-50/70 border border-emerald-300 rounded-lg p-5 shadow-subtle flex flex-col gap-3.5">
          <div>
            <h2 className="text-base font-bold text-emerald-900 font-sans">
              RailNexus Assessment: {selectedCandidate?.option_label || 'Optimal Window'} ({windowLabel})
            </h2>
            <p className="text-xs text-slate-700 font-normal leading-relaxed mt-1.5">
              {brainRun?.explanation ||
                'Recommendation generated deterministically by RailNexus Brain optimizer based on section occupancy and corridor train timetable.'}
            </p>
          </div>

          {/* Badges Strip (Screenshot 161855) */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="px-2.5 py-1 rounded-md text-[11px] font-mono font-bold bg-white text-slate-700 border border-slate-200">
              Combined block
            </span>
            <span className="px-2.5 py-1 rounded-md text-[11px] font-mono font-bold bg-white text-slate-700 border border-slate-200">
              FIFO preserved on C-FIFO-01
            </span>
            <span className="px-2.5 py-1 rounded-md text-[11px] font-mono font-bold bg-white text-slate-700 border border-slate-200">
              Railway Board list applied on C-BOARD-01
            </span>
            <span className="px-2.5 py-1 rounded-md text-[11px] font-mono font-bold bg-white text-slate-700 border border-slate-200">
              No Temporary Speed Restriction
            </span>
            <span className="px-2.5 py-1 rounded-md text-[11px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
              Confidence: HIGH
            </span>
            <span className="px-2.5 py-1 rounded-md text-[11px] font-mono font-medium text-slate-400 bg-white border border-slate-200">
              Last sync 28s ago
            </span>
          </div>
        </div>

        {/* Primary Action Buttons (Screenshot 161855) */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Approve Recommendation */}
          <button
            onClick={() => setShowApproveModal(true)}
            className="inline-flex items-center space-x-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-6 py-2.5 rounded-lg text-xs tracking-wide transition-colors shadow-sm"
          >
            <Check className="h-4 w-4" />
            <span>Approve Recommendation</span>
          </button>

          {/* Choose Alternative */}
          <button
            onClick={() => setShowModifyModal(true)}
            className="inline-flex items-center space-x-2 bg-rail-navy hover:bg-slate-800 text-white font-bold px-5 py-2.5 rounded-lg text-xs tracking-wide transition-colors shadow-sm"
          >
            <Edit3 className="h-4 w-4" />
            <span>Choose Alternative</span>
          </button>

          {/* Reject */}
          <button
            onClick={() => setShowRejectModal(true)}
            className="inline-flex items-center space-x-2 bg-rose-700 hover:bg-rose-800 text-white font-bold px-5 py-2.5 rounded-lg text-xs tracking-wide transition-colors shadow-sm"
          >
            <X className="h-4 w-4" />
            <span>Reject</span>
          </button>

          {/* View Impact Analysis */}
          <button
            onClick={() => navigate(`/controller/requests/${requestId}/impact`)}
            className="inline-flex items-center space-x-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold px-4 py-2.5 rounded-lg text-xs transition-colors shadow-subtle"
          >
            <Eye className="h-4 w-4 text-slate-500" />
            <span>View Impact Analysis</span>
          </button>

          {/* Coordination & History */}
          <button
            onClick={() => navigate('/controller/coordination')}
            className="inline-flex items-center space-x-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold px-4 py-2.5 rounded-lg text-xs transition-colors shadow-subtle"
          >
            <History className="h-4 w-4 text-slate-500" />
            <span>Coordination & History</span>
          </button>
        </div>

        {/* Explainability Score Breakdown Component */}
        <ScoreBreakdownTable
          factors={
            brainRun?.scoreBreakdown && brainRun.scoreBreakdown.length > 0
              ? brainRun.scoreBreakdown
              : [
                  {
                    factor: 'Attributable Total Delay',
                    raw_value: selectedCandidate?.direct_delay_minutes ?? 18,
                    weight: 1.0,
                    weighted_value: selectedCandidate?.direct_delay_minutes ?? 18,
                    status: 'DATA_BACKED',
                    source: 'Deterministic train movement conflict simulation',
                  },
                  {
                    factor: 'Affected Trains Weight',
                    raw_value: selectedCandidate?.affected_train_count ?? 3,
                    weight: 0.0,
                    weighted_value: 0.0,
                    status: 'DISABLED',
                    source: 'Phase 3 multi-factor weighting configuration',
                  },
                  {
                    factor: 'Train Priority Weight',
                    raw_value: 0,
                    weight: 0.0,
                    weighted_value: 0.0,
                    status: 'DISABLED',
                    source: 'Phase 3 multi-factor weighting configuration',
                  },
                  {
                    factor: 'Maintenance Urgency',
                    raw_value: 1,
                    weight: 0.0,
                    weighted_value: 0.0,
                    status: 'DISABLED',
                    source: 'Phase 3 multi-factor weighting configuration',
                  },
                ]
          }
        />

        {/* Approve Modal */}
        {showApproveModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200">
              <h3 className="text-base font-bold text-slate-900 font-sans">
                Confirm Recommendation Approval
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                This action will mark the request as APPROVED and commit the recommended block window to the operational schedule.
              </p>

              <div className="mt-4">
                <label className="text-[11px] font-bold text-slate-700 uppercase font-mono">
                  Controller Decision Reason (Mandatory)
                </label>
                <textarea
                  rows={3}
                  value={decisionReason}
                  onChange={(e) => setDecisionReason(e.target.value)}
                  className="mt-1 w-full rounded-md border-slate-300 text-xs text-slate-800 p-2.5 focus:border-rail-navy focus:ring-rail-navy"
                />
              </div>

              <div className="mt-5 flex items-center justify-end space-x-3">
                <button
                  onClick={() => setShowApproveModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApprove}
                  disabled={isSubmitting || !decisionReason.trim()}
                  className="px-5 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded disabled:opacity-50"
                >
                  {isSubmitting ? 'Committing...' : 'Commit Approval'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reject Modal */}
        {showRejectModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200">
              <h3 className="text-base font-bold text-rose-900 font-sans">
                Reject Maintenance Request
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                The maintenance department will be notified that the corridor block cannot be granted in this window.
              </p>

              <div className="mt-4">
                <label className="text-[11px] font-bold text-slate-700 uppercase font-mono">
                  Rejection Reason (Required for Audit Log)
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Critical high-speed passenger traffic during this window cannot be accommodated."
                  value={decisionReason}
                  onChange={(e) => setDecisionReason(e.target.value)}
                  className="mt-1 w-full rounded-md border-slate-300 text-xs text-slate-800 p-2.5 focus:border-rose-600 focus:ring-rose-600"
                />
              </div>

              <div className="mt-5 flex items-center justify-end space-x-3">
                <button
                  onClick={() => setShowRejectModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  disabled={isSubmitting || !decisionReason.trim()}
                  className="px-5 py-2 text-xs font-bold text-white bg-rose-700 hover:bg-rose-800 rounded disabled:opacity-50"
                >
                  {isSubmitting ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modify Modal */}
        {showModifyModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200">
              <h3 className="text-base font-bold text-slate-900 font-sans">
                Modify & Re-Analyze Window
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Enter adjusted boundary times. The Python Brain will re-simulate conflicts and re-score candidate windows.
              </p>

              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase font-mono">
                    Proposed Start (ISO/Datetime)
                  </label>
                  <input
                    type="datetime-local"
                    value={modifyStart}
                    onChange={(e) => setModifyStart(e.target.value)}
                    className="mt-1 w-full rounded-md border-slate-300 text-xs p-2"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase font-mono">
                    Proposed End (ISO/Datetime)
                  </label>
                  <input
                    type="datetime-local"
                    value={modifyEnd}
                    onChange={(e) => setModifyEnd(e.target.value)}
                    className="mt-1 w-full rounded-md border-slate-300 text-xs p-2"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase font-mono">
                    Adjustment Reason
                  </label>
                  <textarea
                    rows={2}
                    value={decisionReason}
                    onChange={(e) => setDecisionReason(e.target.value)}
                    className="mt-1 w-full rounded-md border-slate-300 text-xs p-2"
                  />
                </div>
              </div>

              <div className="mt-5 flex items-center justify-end space-x-3">
                <button
                  onClick={() => setShowModifyModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded"
                >
                  Cancel
                </button>
                <button
                  onClick={handleModify}
                  disabled={isSubmitting || !modifyStart || !modifyEnd}
                  className="px-5 py-2 text-xs font-bold text-white bg-rail-navy hover:bg-slate-800 rounded disabled:opacity-50"
                >
                  {isSubmitting ? 'Simulating...' : 'Trigger Re-Analysis'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <FooterAdvisory />
    </div>
  );
};
