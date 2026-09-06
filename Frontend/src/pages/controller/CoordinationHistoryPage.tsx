import React, { useEffect, useState } from 'react';
import { controllerApi } from '../../api/controller';
import { auditApi } from '../../api/audit';
import { AuditLog, ControllerDecision } from '../../types';
import { TopNav } from '../../components/TopNav';
import { FooterAdvisory } from '../../components/FooterAdvisory';
import { CheckCircle2, Eye, RefreshCw, ShieldCheck } from 'lucide-react';

export const CoordinationHistoryPage: React.FC = () => {
  const [decisions, setDecisions] = useState<ControllerDecision[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [requestCount, setRequestCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedLog, setSelectedLog] = useState<any | null>(null);

  const [historyError, setHistoryError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setHistoryError(null);
      const [historyData, auditData, requestsData] = await Promise.all([
        controllerApi.getHistory(),
        auditApi.getAuditLogs({ limit: 50 }),
        controllerApi.getAllRequests(),
      ]);

      setDecisions(historyData.decisions || []);
      setAuditLogs(auditData.logs || []);
      setRequestCount(requestsData.length || 0);
    } catch (err: any) {
      setHistoryError('Failed to load coordination history from backend. Please refresh or check connection.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const acceptedCount = decisions.filter((d) => d.action === 'APPROVE').length;
  const modifiedCount = decisions.filter((d) => d.action === 'MODIFY').length;
  const rejectedCount = decisions.filter((d) => d.action === 'REJECT').length;
  const latestApproved = decisions.find((d) => d.action === 'APPROVE');

  return (
    <div className="min-h-screen flex flex-col bg-slate-100">
      <TopNav />

      <main className="flex-1 max-w-[1700px] w-full mx-auto p-4 sm:p-6 flex flex-col gap-5">
        {/* Top Status Alert (Screenshot 161928) */}
        <div className="flex items-center justify-between">
          {latestApproved ? (
            <div className="flex items-center space-x-2 text-xs font-mono font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 px-3 py-1.5 rounded-lg shadow-subtle">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>Block approved · Request {latestApproved.requestId} ({new Date(latestApproved.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})</span>
            </div>
          ) : (
            <div className="text-xs font-mono text-slate-500">
              Audit status: Operational log active
            </div>
          )}

          <button
            onClick={loadData}
            className="flex items-center space-x-1.5 text-xs text-slate-500 hover:text-slate-800"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Log</span>
          </button>
        </div>

        {/* Section Header */}
        <div>
          <h1 className="text-xl font-bold text-slate-900 font-sans tracking-tight">
            Coordination & Decision History
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Maintenance coordination metrics and controller decision log · Monitored Corridor · {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
          </p>
        </div>

        {/* 4 Top Metric Cards (Screenshot 161928) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Maintenance Tasks */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-subtle flex flex-col items-center justify-center text-center">
            <span className="text-[10px] font-mono uppercase text-slate-400 font-bold">
              Maintenance Tasks
            </span>
            <span className="text-2xl font-bold font-mono text-slate-900 mt-1">
              {requestCount}
            </span>
            <span className="text-[11px] text-slate-500 mt-0.5">registered on corridor</span>
          </div>

          {/* Card 2: Blocks Planned / Combined */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-subtle flex flex-col items-center justify-center text-center">
            <span className="text-[10px] font-mono uppercase text-slate-400 font-bold">
              Blocks Planned / Combined
            </span>
            <span className="text-2xl font-bold font-mono text-slate-900 mt-1">
              {acceptedCount}
            </span>
            <span className="text-[11px] text-slate-500 mt-0.5">approved blocks</span>
          </div>

          {/* Card 3: Controller Decisions */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-subtle flex flex-col items-center justify-center text-center">
            <span className="text-[10px] font-mono uppercase text-slate-400 font-bold">
              Controller Decisions
            </span>
            <span className="text-2xl font-bold font-mono text-slate-900 mt-1">
              {decisions.length}
            </span>
            <span className="text-[11px] text-slate-500 mt-0.5 font-mono">
              {acceptedCount} accepted · {modifiedCount} modified · {rejectedCount} rejected
            </span>
          </div>

          {/* Card 4: Approved Block Impact */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-subtle flex flex-col items-center justify-center text-center">
            <span className="text-[10px] font-mono uppercase text-slate-400 font-bold">
              Approved Block Impact
            </span>
            <span className="text-2xl font-bold font-mono text-slate-900 mt-1">
              {acceptedCount > 0 ? 'Verified' : '0 min'}
            </span>
            <span className="text-[11px] text-slate-500 mt-0.5">estimated delay impact</span>
          </div>
        </div>

        {/* Decision History Table (Screenshot 161928) */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-subtle overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/60 flex items-center justify-between">
            <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-800">
              Decision History
            </h3>
            <span className="text-[11px] font-mono text-slate-500">
              IMMUTABLE AUDIT TRAIL
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-mono uppercase text-slate-500 tracking-wider">
                  <th className="py-3 px-4 font-bold">TIME</th>
                  <th className="py-3 px-4 font-bold">TASKS</th>
                  <th className="py-3 px-4 font-bold">CANDIDATES</th>
                  <th className="py-3 px-4 font-bold">RECOMMENDED</th>
                  <th className="py-3 px-4 font-bold">REASON</th>
                  <th className="py-3 px-4 font-bold">CONTROLLER DECISION</th>
                  <th className="py-3 px-4 font-bold">STATUS</th>
                  <th className="py-3 px-4 font-bold text-center">ACTION</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 font-sans">
                {decisions.map((d) => (
                  <tr key={d._id || d.decisionId} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono text-slate-700 whitespace-nowrap">
                      {new Date(d.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>

                    <td className="py-3 px-4 font-mono font-bold text-slate-800">
                      {d.requestId}
                    </td>

                    <td className="py-3 px-4 font-mono text-slate-600">
                      {d.selectedWindow ? 'SPECIFIED WINDOW' : 'OPTIMAL RECOMMENDED'}
                    </td>

                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-300">
                        {d.selectedWindow
                          ? `${new Date(d.selectedWindow.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–${new Date(d.selectedWindow.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                          : 'RECORDED WINDOW'}
                      </span>
                    </td>

                    <td className="py-3 px-4 max-w-xs truncate text-slate-600 font-normal" title={d.reason}>
                      {d.reason || 'Operational decision logged by railway traffic controller.'}
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`px-2.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                          d.action === 'APPROVE'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-300'
                            : d.action === 'MODIFY'
                            ? 'bg-purple-50 text-purple-700 border border-purple-300'
                            : 'bg-rose-50 text-rose-700 border border-rose-300'
                        }`}
                      >
                        {d.action === 'APPROVE' ? 'Approved' : d.action === 'MODIFY' ? 'Modified' : 'Rejected'}
                      </span>
                    </td>

                    <td className="py-3 px-4 font-medium text-slate-700">
                      {d.action === 'APPROVE'
                        ? 'Approved — formal decision record committed'
                        : d.action === 'MODIFY'
                        ? 'Modified — replan parameters dispatched'
                        : 'Rejected — request dismissed'}
                    </td>

                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => setSelectedLog(d)}
                        className="inline-flex items-center space-x-1 border border-slate-200 hover:bg-slate-50 px-2.5 py-1 rounded text-xs text-slate-700 font-semibold transition-colors shadow-subtle"
                      >
                        <Eye className="h-3 w-3 text-slate-500" />
                        <span>View Details</span>
                      </button>
                    </td>
                  </tr>
                ))}

                {decisions.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400 italic text-xs">
                      No controller decisions logged in immutable audit history yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal for Decision Log Detail */}
        {selectedLog && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <div className="flex items-center space-x-2">
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  <h3 className="text-base font-bold text-slate-900 font-sans">
                    Decision Audit Record
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-slate-400">
                  {selectedLog.decisionId || 'LOG ENTRY'}
                </span>
              </div>

              <div className="space-y-3 text-xs font-mono">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Action</span>
                  <span className="text-slate-800 font-bold">{selectedLog.action || 'APPROVE'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Reason</span>
                  <p className="text-slate-700 font-sans font-medium mt-0.5 bg-slate-50 p-2.5 rounded border border-slate-200">
                    {selectedLog.reason}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Request ID</span>
                  <span className="text-slate-800">{selectedLog.requestId}</span>
                </div>
              </div>

              <div className="mt-5 flex justify-end">
                <button
                  onClick={() => setSelectedLog(null)}
                  className="px-4 py-2 bg-rail-navy hover:bg-slate-800 text-white rounded text-xs font-bold"
                >
                  Close Record
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <FooterAdvisory
        assessmentDetail="RailNexus operational assessment log. Controller decisions are recorded with full immutable audit history. Final authority remains with authorised railway operating personnel."
      />
    </div>
  );
};
