import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { maintenanceApi } from '../../api/maintenance';
import { brainApi } from '../../api/brain';
import { CorridorSection, RequestPriority, formatDepartment } from '../../types';
import { TopNav } from '../../components/TopNav';
import { FooterAdvisory } from '../../components/FooterAdvisory';
import { normalizeApiError } from '../../utils/errorNormalizer';
import { ArrowLeft, CheckCircle2, AlertCircle, Wrench } from 'lucide-react';

export const CreateRequestPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [stations, setStations] = useState<string[]>([]);
  const [sections, setSections] = useState<CorridorSection[]>([]);
  const [isLoadingCatalogs, setIsLoadingCatalogs] = useState<boolean>(true);

  // Form fields
  const [fromStation, setFromStation] = useState<string>('');
  const [toStation, setToStation] = useState<string>('');
  const [maintenanceType, setMaintenanceType] = useState<string>('Track Tamping');
  const [durationMinutes, setDurationMinutes] = useState<number>(120);
  const [startTime, setStartTime] = useState<string>('11:30');
  const [endTime, setEndTime] = useState<string>('15:00');
  const [priority, setPriority] = useState<RequestPriority>(RequestPriority.MEDIUM);
  const [description, setDescription] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Idempotency key: stable for the current logical submission attempt.
   * A new UUID is generated only after a successful request (resetting for a new form submit).
   * This ensures retries from network failures re-use the same key (idempotent replay).
   */
  const idempotencyKeyRef = useRef<string>('');

  /**
   * Submission guard: prevents concurrent double-click / rapid Enter-key triggers.
   * Unlike `isSubmitting` state (async), this ref is synchronously updated.
   */
  const isSubmittingRef = useRef<boolean>(false);

  const getOrCreateIdempotencyKey = (): string => {
    if (!idempotencyKeyRef.current) {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        idempotencyKeyRef.current = crypto.randomUUID();
      } else {
        idempotencyKeyRef.current = 'xxxx-4xxx-yxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });
      }
    }
    return idempotencyKeyRef.current;
  };

  useEffect(() => {
    async function loadCatalogs() {
      try {
        setIsLoadingCatalogs(true);
        setError(null);
        const [stns, secs] = await Promise.all([
          brainApi.getStations(),
          brainApi.getSections(),
        ]);

        if (!stns || stns.length === 0) {
          throw new Error('Station catalog is unavailable from Brain microservice.');
        }

        setStations(stns);
        setSections(secs || []);

        if (secs && secs.length > 0) {
          setFromStation(secs[0].from_station);
          setToStation(secs[0].to_station);
        } else if (stns.length >= 2) {
          setFromStation(stns[0]);
          setToStation(stns[1]);
        }
      } catch (err: any) {
        setError(
          err.response?.data?.error?.message ||
          err.message ||
          'Failed to load corridor station catalog from Brain microservice.'
        );
      } finally {
        setIsLoadingCatalogs(false);
      }
    }

    loadCatalogs();
  }, []);

  // When fromStation changes, filter available destination stations that form a valid section
  const validDestinations = sections
    .filter((s) => s.from_station === fromStation)
    .map((s) => s.to_station);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Synchronous guard — prevents double-click / Enter-key re-entry
    if (isSubmittingRef.current) return;

    if (stations.length === 0) {
      setError('Corridor station catalog unavailable. Cannot submit requisition without verified station data.');
      return;
    }
    if (!fromStation || !toStation) {
      setError('Please select valid From and To stations.');
      return;
    }
    if (fromStation === toStation) {
      setError('From Station and To Station cannot be the same.');
      return;
    }

    // Verify section pairing against verified sections catalog if sections exist
    if (sections.length > 0) {
      const isDirectSection = sections.some(
        (s) =>
          (s.from_station === fromStation && s.to_station === toStation) ||
          (s.from_station === toStation && s.to_station === fromStation)
      );
      if (!isDirectSection) {
        setError(`Section ${fromStation} -> ${toStation} is not a verified contiguous corridor section in active dataset.`);
        return;
      }
    }

    isSubmittingRef.current = true;
    try {
      setIsSubmitting(true);
      setError(null);

      // Normalize times using prototype dataset date base (1900-01-01)
      const earliestStart = `1900-01-01T${startTime}:00`;
      const latestEnd = `1900-01-01T${endTime}:00`;

      // Use stable idempotency key for this submission attempt (safe for retries)
      const idempotencyKey = getOrCreateIdempotencyKey();

      const res = await maintenanceApi.createRequest({
        maintenanceType,
        fromStation,
        toStation,
        durationMinutes: Number(durationMinutes),
        earliestStart,
        latestEnd,
        priority,
        description,
        idempotencyKey,
      });

      if (res.success && res.data?.request) {
        // Reset key only on success — a new form submission is a new logical operation
        idempotencyKeyRef.current = '';
        navigate(`/worker/requests/${res.data.request.requestId}`);
      }
    } catch (err: unknown) {
      const { message } = normalizeApiError(err);
      setError(message);
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-100">
      <TopNav />

      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 flex flex-col gap-5">
        <div>
          <button
            onClick={() => navigate('/worker/dashboard')}
            className="inline-flex items-center space-x-1 text-xs text-slate-500 hover:text-slate-800 font-semibold"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Worker Dashboard</span>
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-subtle">
          <div className="flex items-center space-x-3 border-b border-slate-100 pb-4 mb-5">
            <div className="p-2 rounded-lg bg-rail-navy text-white">
              <Wrench className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 font-sans">
                Submit Corridor Maintenance Requisition
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Requisitions are evaluated by Python Brain against live timetable occupancy before Chief Controller review.
              </p>
            </div>
          </div>

          {error && (
            <div className="p-3 mb-5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5 text-xs">
            {/* Department (Read-only badge derived from authenticated user) */}
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
              <span className="font-semibold text-slate-700">Submitting Department:</span>
              <span className="font-mono font-bold text-rail-navy bg-white px-2.5 py-1 rounded border border-slate-200">
                {formatDepartment(user?.department)}
              </span>
            </div>

            {/* Maintenance Type */}
            <div>
              <label className="font-bold text-slate-700 block uppercase font-mono text-[11px] mb-1">
                Work Type / Maintenance Activity *
              </label>
              <select
                value={maintenanceType}
                onChange={(e) => setMaintenanceType(e.target.value)}
                className="w-full rounded border-slate-300 text-xs p-2.5 focus:border-rail-navy focus:ring-rail-navy"
                required
              >
                <option value="Track Tamping">Track Tamping (Engineering)</option>
                <option value="Rail Grinding & Testing">Rail Grinding & Ultrasonic Testing (Engineering)</option>
                <option value="Sleeper Renewal">Sleeper & Ballast Renewal (Engineering)</option>
                <option value="Point Machine Overhaul">Point Machine & Interlocking Overhaul (S&T)</option>
                <option value="Axle Counter Maintenance">Axle Counter & Track Circuit Maintenance (S&T)</option>
                <option value="Overhead Catenary Inspection">Overhead Catenary & OHE Inspection (Traction)</option>
                <option value="Power Block Isolator Testing">Power Block & Substation Isolator Testing (Traction)</option>
              </select>
            </div>

            {/* Verified Section Selector (From & To Stations) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="font-bold text-slate-700 block uppercase font-mono text-[11px] mb-1">
                  From Station (Verified Dataset) *
                </label>
                <select
                  value={fromStation}
                  onChange={(e) => {
                    const newFrom = e.target.value;
                    setFromStation(newFrom);
                    const matchSec = sections.find((s) => s.from_station === newFrom);
                    if (matchSec) setToStation(matchSec.to_station);
                  }}
                  disabled={isLoadingCatalogs}
                  className="w-full rounded border-slate-300 text-xs font-mono p-2.5 focus:border-rail-navy focus:ring-rail-navy font-bold"
                  required
                >
                  {stations.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block uppercase font-mono text-[11px] mb-1">
                  To Station (Connected Corridor Section) *
                </label>
                <select
                  value={toStation}
                  onChange={(e) => setToStation(e.target.value)}
                  disabled={isLoadingCatalogs}
                  className="w-full rounded border-slate-300 text-xs font-mono p-2.5 focus:border-rail-navy focus:ring-rail-navy font-bold"
                  required
                >
                  {validDestinations.length > 0 ? (
                    validDestinations.map((dst) => (
                      <option key={dst} value={dst}>
                        {dst}
                      </option>
                    ))
                  ) : (
                    stations
                      .filter((st) => st !== fromStation)
                      .map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))
                  )}
                </select>
              </div>
            </div>

            {/* Duration & Priority */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="font-bold text-slate-700 block uppercase font-mono text-[11px] mb-1">
                  Required Block Duration (Minutes) *
                </label>
                <input
                  type="number"
                  min="15"
                  max="480"
                  step="15"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="w-full rounded border-slate-300 text-xs font-mono p-2.5"
                  required
                />
                <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">
                  ={(durationMinutes / 60).toFixed(1)} hours required
                </span>
              </div>

              <div>
                <label className="font-bold text-slate-700 block uppercase font-mono text-[11px] mb-1">
                  Requisition Urgency / Priority *
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as RequestPriority)}
                  className="w-full rounded border-slate-300 text-xs p-2.5 font-bold"
                >
                  <option value={RequestPriority.LOW}>LOW (Routine Periodic Maintenance)</option>
                  <option value={RequestPriority.MEDIUM}>MEDIUM (Scheduled Preventive Work)</option>
                  <option value={RequestPriority.HIGH}>HIGH (Defect Rectification)</option>
                  <option value={RequestPriority.CRITICAL}>CRITICAL (Emergency Safety Restriction)</option>
                </select>
              </div>
            </div>

            {/* Feasible Time Boundary Window */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="font-bold text-slate-700 block uppercase font-mono text-[11px] mb-1">
                  Earliest Permissible Start (Time) *
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full rounded border-slate-300 text-xs font-mono p-2.5"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block uppercase font-mono text-[11px] mb-1">
                  Latest Permissible Completion (Time) *
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full rounded border-slate-300 text-xs font-mono p-2.5"
                  required
                />
              </div>
            </div>

            {/* Description / Remarks */}
            <div>
              <label className="font-bold text-slate-700 block uppercase font-mono text-[11px] mb-1">
                Technical Justification & Operational Remarks
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detail specific track equipment, gang requirements, or power isolation needs..."
                className="w-full rounded border-slate-300 text-xs p-2.5"
              />
            </div>

            {/* Action Buttons */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={() => navigate('/worker/dashboard')}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center space-x-2 bg-rail-navy hover:bg-slate-800 text-white font-bold py-2.5 px-6 rounded-lg text-xs transition-colors shadow-sm disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4 text-rail-green" />
                <span>{isSubmitting ? 'Simulating Slots...' : 'Submit Requisition'}</span>
              </button>
            </div>
          </form>
        </div>
      </main>

      <FooterAdvisory />
    </div>
  );
};
