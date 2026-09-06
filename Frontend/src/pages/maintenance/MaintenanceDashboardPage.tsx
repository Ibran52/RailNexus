import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { maintenanceApi } from '../../api/maintenance';
import { brainApi } from '../../api/brain';
import { MaintenanceRequest, RequestStatus, formatDepartment, CorridorSection } from '../../types';
import { TopNav } from '../../components/TopNav';
import { FooterAdvisory } from '../../components/FooterAdvisory';
import { StatusBadge } from '../../components/StatusBadge';
import { CorridorSchematicMap } from '../../components/CorridorSchematicMap';
import { useMaintenanceEvents } from '../../hooks/useMaintenanceEvents';
import { normalizeApiError } from '../../utils/errorNormalizer';
import {
  PlusCircle,
  Eye,
  RefreshCw,
  Wrench,
  CheckCircle2,
  Clock,
  Radio,
} from 'lucide-react';

export const MaintenanceDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const department = formatDepartment(user?.department);

  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [sections, setSections] = useState<CorridorSection[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadRequests = useCallback(async (silent = false) => {
    try {
      if (!silent) {
        setIsLoading(true);
      }
      setError(null);
      const data = await maintenanceApi.getRequests();
      const list = Array.isArray(data) ? data : [];

      // Deduplicate by requestId — guards against race conditions or repeated SSE events
      const seen = new Set<string>();
      const deduped = list.filter((r) => {
        if (!r.requestId || seen.has(r.requestId)) return false;
        seen.add(r.requestId);
        return true;
      });

      setRequests(deduped);
    } catch (err: unknown) {
      const { message } = normalizeApiError(err);
      setError(message);
      if (!silent) {
        setRequests([]);
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, []);

  // Real-time SSE synchronization for Worker Dashboard
  const { isConnected: isSseConnected } = useMaintenanceEvents((event) => {
    if (event.requestId) {
      // 1. In-place state update if status is provided in event payload
      if (event.status) {
        setRequests((prev) => {
          const idx = prev.findIndex((r) => r.requestId === event.requestId);
          if (idx !== -1) {
            const updated = [...prev];
            updated[idx] = {
              ...updated[idx],
              status: event.status as RequestStatus,
            };
            return updated;
          }
          return prev;
        });
      }

      // 2. Background silent refetch to guarantee complete persisted consistency from MongoDB
      loadRequests(true);
    }
  });

  useEffect(() => {
    loadRequests(false);

    // Fetch verified corridor sections catalog for schematic map
    brainApi.getSections().then((secs) => {
      if (Array.isArray(secs)) {
        setSections(secs);
      }
    }).catch(() => {
      // Graceful fallback to static corridor order if Brain is initializing
    });
  }, [loadRequests]);

  const requestList = Array.isArray(requests) ? requests : [];
  const openCount = requestList.filter((r) => r.status === RequestStatus.PENDING || r.status === RequestStatus.ANALYZING).length;
  const recommendedCount = requestList.filter((r) => r.status === RequestStatus.RECOMMENDED).length;
  const approvedCount = requestList.filter((r) => r.status === RequestStatus.APPROVED).length;
  const rejectedCount = requestList.filter((r) => r.status === RequestStatus.REJECTED).length;

  return (
    <div className="min-h-screen flex flex-col bg-slate-100">
      <TopNav />

      <main className="flex-1 max-w-[1700px] w-full mx-auto p-4 sm:p-6 flex flex-col gap-5">
        {/* Worker Dashboard Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded text-[11px] font-mono font-bold uppercase tracking-wider bg-rail-navy text-white">
                WORKER DASHBOARD
              </span>
              <span className="text-xs font-semibold text-slate-500 font-mono">
                Role: Maintenance Worker
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                  isSseConnected
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                    : 'bg-amber-50 text-amber-700 border-amber-300'
                }`}
                title={isSseConnected ? 'Connected to live event stream' : 'Operating in API poll/refresh mode'}
              >
                <Radio className={`h-3 w-3 ${isSseConnected ? 'text-emerald-500 animate-pulse' : 'text-amber-500'}`} />
                <span>{isSseConnected ? 'LIVE FEED: CONNECTED' : 'FEED: POLLING MODE'}</span>
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 font-sans tracking-tight">
              Welcome, {user?.name || 'Authorized Personnel'}
            </h1>
            <div className="flex items-center gap-3 mt-1 text-xs text-slate-600">
              <span>
                Department: <strong className="text-rail-navy font-bold">{department}</strong>
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-slate-500">
                Submit track block requisitions & track Chief Controller authorizations in real-time
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => loadRequests(false)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold shadow-subtle transition-colors cursor-pointer"
              title="Refresh requests from database"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            <button
              onClick={() => navigate('/worker/requests/new')}
              className="inline-flex items-center space-x-2 bg-rail-navy hover:bg-slate-800 text-white px-5 py-2 rounded-lg text-xs font-bold transition-colors shadow-sm cursor-pointer"
            >
              <PlusCircle className="h-4 w-4 text-rail-green" />
              <span>Create Maintenance Request</span>
            </button>
          </div>
        </div>

        {/* 4 Metric Overview Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-subtle flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono uppercase text-slate-400 font-bold">
                Pending Analysis
              </span>
              <div className="text-2xl font-bold font-mono text-slate-900 mt-1">{openCount}</div>
              <span className="text-[11px] text-amber-600">Awaiting slot generation</span>
            </div>
            <Clock className="h-8 w-8 text-amber-400" />
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-subtle flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono uppercase text-slate-400 font-bold">
                Recommended Windows
              </span>
              <div className="text-2xl font-bold font-mono text-emerald-600 mt-1">{recommendedCount}</div>
              <span className="text-[11px] text-emerald-600">Optimal windows ready</span>
            </div>
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-subtle flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono uppercase text-slate-400 font-bold">
                Approved Blocks
              </span>
              <div className="text-2xl font-bold font-mono text-blue-600 mt-1">{approvedCount}</div>
              <span className="text-[11px] text-blue-600">Granted by Controller</span>
            </div>
            <Wrench className="h-8 w-8 text-blue-500" />
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-subtle flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono uppercase text-slate-400 font-bold">
                Rejected / Cancelled
              </span>
              <div className="text-2xl font-bold font-mono text-rose-600 mt-1">{rejectedCount}</div>
              <span className="text-[11px] text-slate-500">Requires re-submission</span>
            </div>
            <Wrench className="h-8 w-8 text-slate-300" />
          </div>
        </div>

        {/* Live Corridor Schematic Map */}
        <CorridorSchematicMap
          sections={sections}
          requests={requestList}
          title="CORRIDOR NETWORK TOPOLOGY & MAINTENANCE OVERLAYS"
        />

        {/* Requests Table */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-subtle overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
            <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-800">
              Department Maintenance Requests
            </h3>
            <span className="text-[11px] font-mono text-slate-500 font-bold">
              {requestList.length} REQUISITIONS RECORDED
            </span>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 text-rose-700 text-xs border-b border-rose-200">
              {error}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-mono uppercase text-slate-500 tracking-wider">
                  <th className="py-3 px-4 font-bold">REQUEST ID</th>
                  <th className="py-3 px-4 font-bold">DEPARTMENT</th>
                  <th className="py-3 px-4 font-bold">CORRIDOR SECTION</th>
                  <th className="py-3 px-4 font-bold">TYPE</th>
                  <th className="py-3 px-4 font-bold">DURATION</th>
                  <th className="py-3 px-4 font-bold">REQUESTED WINDOW</th>
                  <th className="py-3 px-4 font-bold">PRIORITY</th>
                  <th className="py-3 px-4 font-bold">STATUS</th>
                  <th className="py-3 px-4 font-bold text-center">ACTION</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 font-sans">
                {requestList.map((r) => (
                  <tr key={r.requestId} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      {r.requestId}
                    </td>

                    <td className="py-3 px-4 font-semibold text-slate-700">
                      {r.department}
                    </td>

                    <td className="py-3 px-4">
                      <span className="font-bold text-slate-800 font-mono">
                        {r.fromStation}—{r.toStation}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-slate-600 font-medium uppercase">
                      {r.maintenanceType}
                    </td>

                    <td className="py-3 px-4 font-mono font-semibold text-slate-800">
                      {r.durationMinutes} min
                    </td>

                    <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                      {new Date(r.earliestStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–
                      {new Date(r.latestEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>

                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-slate-100 text-slate-700 border border-slate-200">
                        {r.priority}
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      <StatusBadge status={r.status} size="sm" />
                    </td>

                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => navigate(`/worker/requests/${r.requestId}`)}
                        className="inline-flex items-center space-x-1 border border-slate-200 hover:bg-slate-50 px-2.5 py-1 rounded text-xs text-slate-700 font-semibold transition-colors shadow-subtle cursor-pointer"
                      >
                        <Eye className="h-3 w-3 text-slate-500" />
                        <span>View Details</span>
                      </button>
                    </td>
                  </tr>
                ))}

                {requestList.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400 italic">
                      No maintenance requisitions submitted yet. Click "+ Create Maintenance Request" to create one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <FooterAdvisory />
    </div>
  );
};
