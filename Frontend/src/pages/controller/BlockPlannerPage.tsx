import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { controllerApi } from '../../api/controller';
import { MaintenanceRequest, RequestStatus } from '../../types';
import { TopNav } from '../../components/TopNav';
import { FooterAdvisory } from '../../components/FooterAdvisory';
import { CheckSquare, Square, Eye, ArrowLeft, Zap, RefreshCw } from 'lucide-react';

export const BlockPlannerPage: React.FC = () => {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [timeframe, setTimeframe] = useState<'Monthly' | 'Weekly' | 'Operational'>('Weekly');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadRequests = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await controllerApi.getAllRequests();
      setRequests(data);
      // Select all by default matching screenshot
      setSelectedIds(data.map((r) => r.requestId));
    } catch (err: any) {
      setError(err.message || 'Failed to load maintenance register');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === requests.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(requests.map((r) => r.requestId));
    }
  };

  const handleFindBlockWindow = () => {
    if (selectedIds.length === 0) {
      alert('Please select at least one maintenance activity from the register.');
      return;
    }
    const targetId = selectedIds[0];
    navigate(`/controller/requests/${targetId}/candidates`);
  };

  // Section summary
  const sampleSection = requests[0]
    ? `${requests[0].fromStation}–${requests[0].toStation}`
    : 'Monitored Corridor';

  const distinctDepts = Array.from(new Set(requests.map((r) => r.department)));

  return (
    <div className="min-h-screen flex flex-col bg-slate-100">
      <TopNav />

      <main className="flex-1 max-w-[1700px] w-full mx-auto p-4 sm:p-6 flex flex-col gap-5">
        {/* Top Section Header (Screenshot 161806) */}
        <div>
          <h1 className="text-xl font-bold text-slate-900 font-sans tracking-tight">
            Maintenance Block Planner
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Section: <span className="font-semibold text-slate-800">{sampleSection}</span> · {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} · {requests.length} activities pending
            {distinctDepts.length > 0 ? ` · ${distinctDepts.join(', ')}` : ''}
          </p>
        </div>

        {/* Compatibility Callout Banner (Screenshot 161806) */}
        <div className="bg-blue-50/90 border border-blue-200 rounded-lg p-3.5 text-xs text-blue-900 shadow-subtle flex items-center justify-between">
          <p>
            {distinctDepts.length > 1 ? (
              <>
                <span className="font-bold">{distinctDepts.length} departments require maintenance on this corridor.</span>{' '}
                All activities are analyzed for synergy — one coordinated block can replace {distinctDepts.length} separate corridor closures.
              </>
            ) : (
              <>
                <span className="font-bold">Corridor maintenance window planner active.</span>{' '}
                Automated multi-department conflict evaluation and timetable impact scoring.
              </>
            )}
          </p>
          <button
            onClick={loadRequests}
            title="Refresh Activity Register"
            className="text-blue-600 hover:text-blue-800 p-1"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Action Toolbar: Timeframe Pills & Buttons (Screenshot 161806) */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Timeframe Tabs */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-subtle text-xs">
            {(['Monthly', 'Weekly', 'Operational'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTimeframe(t)}
                className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${
                  timeframe === t
                    ? 'bg-rail-navy text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-3">
            <button
              onClick={handleFindBlockWindow}
              className="inline-flex items-center space-x-2 bg-rail-navy hover:bg-slate-800 text-white px-5 py-2 rounded-lg text-xs font-bold transition-colors shadow-sm"
            >
              <Zap className="h-4 w-4 text-rail-green" />
              <span>Find Block Window</span>
            </button>

            <button
              onClick={() => navigate('/controller')}
              className="inline-flex items-center space-x-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-xs font-semibold transition-colors shadow-subtle"
            >
              <ArrowLeft className="h-4 w-4 text-slate-500" />
              <span>Return to Operations</span>
            </button>
          </div>
        </div>

        {/* Maintenance Activity Register Table (Screenshot 161806) */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-subtle overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/60 flex items-center justify-between">
            <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-800">
              Maintenance Activity Register
            </h3>
            <span className="text-[11px] font-mono text-slate-500">
              {selectedIds.length} OF {requests.length} SELECTED
            </span>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border-b border-rose-200 text-rose-700 text-xs">
              {error}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-mono uppercase text-slate-500 tracking-wider">
                  <th className="py-3 px-4 w-10">
                    <button onClick={toggleSelectAll} className="text-slate-600">
                      {selectedIds.length === requests.length && requests.length > 0 ? (
                        <CheckSquare className="h-4 w-4 text-rail-navy" />
                      ) : (
                        <Square className="h-4 w-4 text-slate-400" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-4 font-bold">TASK ID</th>
                  <th className="py-3 px-4 font-bold">DEPARTMENT</th>
                  <th className="py-3 px-4 font-bold">SECTION / LOCATION</th>
                  <th className="py-3 px-4 font-bold">WORK TYPE</th>
                  <th className="py-3 px-4 font-bold">DURATION</th>
                  <th className="py-3 px-4 font-bold">URGENCY</th>
                  <th className="py-3 px-4 font-bold">COMPATIBILITY</th>
                  <th className="py-3 px-4 font-bold">PLANNING STATUS</th>
                  <th className="py-3 px-4 font-bold">BLOCK REQ.</th>
                  <th className="py-3 px-4 font-bold text-center">ACTION</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 font-sans">
                {requests.map((r, idx) => {
                  const isSelected = selectedIds.includes(r.requestId);
                  const isEngineering = r.department === 'ENGINEERING';
                  const isSnt = r.department === 'SNT';
                  const isOhe = r.department === 'OHE';

                  const workTypeBadge = isEngineering
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : isSnt
                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                    : 'bg-indigo-50 text-indigo-700 border-indigo-200';


                  return (
                    <tr
                      key={r._id || r.requestId}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isSelected ? 'bg-slate-50/40' : ''
                      }`}
                    >
                      <td className="py-3 px-4">
                        <button onClick={() => toggleSelect(r.requestId)}>
                          {isSelected ? (
                            <CheckSquare className="h-4 w-4 text-rail-navy" />
                          ) : (
                            <Square className="h-4 w-4 text-slate-400" />
                          )}
                        </button>
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {r.requestId}
                      </td>

                      <td className="py-3 px-4 font-semibold text-slate-800">
                        <div>
                          {isEngineering ? 'Engineering / Track' : isSnt ? 'S&T' : isOhe ? 'Traction / OHE' : r.department}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500 mt-1">
                          Submitted By: {r.submitterName || 'MISSING DATA'}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800">
                          {r.fromStation}—{r.toStation}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">
                          S-{r.fromStation}-{r.toStation}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border uppercase ${workTypeBadge}`}
                        >
                          {r.maintenanceType || '—'}
                        </span>
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-slate-800">
                        {(r.durationMinutes / 60).toFixed(1)} h
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border uppercase ${
                            r.priority === 'CRITICAL'
                              ? 'bg-rose-100 text-rose-800 border-rose-300'
                              : r.priority === 'HIGH'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : r.priority === 'MEDIUM'
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                          }`}
                        >
                          {r.priority || '—'}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-300">
                          COMPATIBLE
                        </span>
                        <div className="text-[9px] text-slate-400 font-mono mt-0.5">
                          with pending corridor tasks
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          {r.status || 'PENDING'}
                        </span>
                      </td>

                      <td className="py-3 px-4 font-mono font-semibold text-slate-800">
                        Yes
                      </td>

                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => navigate(`/controller/requests/${r.requestId}/candidates`)}
                          className="inline-flex items-center space-x-1 border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 px-2.5 py-1 rounded text-xs text-slate-700 font-semibold transition-colors shadow-subtle"
                        >
                          <Eye className="h-3 w-3 text-slate-500" />
                          <span>View Details</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {requests.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={11} className="py-8 text-center text-slate-400 italic">
                      No maintenance activities found in the register.
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
