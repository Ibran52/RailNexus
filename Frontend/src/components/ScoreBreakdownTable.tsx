import React from 'react';

interface ScoreFactor {
  factor: string;
  raw_value: any;
  weight: number;
  weighted_value: any;
  status: string;
  source?: string;
  details?: string;
}

interface ScoreBreakdownTableProps {
  factors?: ScoreFactor[];
}

export const ScoreBreakdownTable: React.FC<ScoreBreakdownTableProps> = ({ factors = [] }) => {
  const getStatusBadge = (status: string) => {
    const s = (status || '').toUpperCase();
    if (s === 'DATA_BACKED') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-300">
          DATA_BACKED
        </span>
      );
    }
    if (s === 'PROTOTYPE_ASSUMPTION') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-amber-50 text-amber-700 border border-amber-300">
          PROTOTYPE_ASSUMPTION
        </span>
      );
    }
    if (s === 'DISABLED' || s === 'NOT_IMPLEMENTED') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-mono text-slate-500 bg-slate-100 border border-slate-300">
          {s}
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-mono text-slate-600 bg-slate-50 border border-slate-200">
        {status || 'MISSING_DATA'}
      </span>
    );
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-subtle select-none">
      <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
        <h4 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-800">
          Multi-Factor Impact Score Breakdown
        </h4>
        <span className="text-[11px] text-slate-400 font-mono">PHASE 3 EXPLAINABILITY</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/50 text-[10px] font-mono uppercase text-slate-500 tracking-wider">
              <th className="py-2.5 px-4 font-bold">Factor</th>
              <th className="py-2.5 px-4 font-bold text-right">Raw Value</th>
              <th className="py-2.5 px-4 font-bold text-right">Weight</th>
              <th className="py-2.5 px-4 font-bold text-right">Weighted Value</th>
              <th className="py-2.5 px-4 font-bold">Status</th>
              <th className="py-2.5 px-4 font-bold">Source / Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-mono">
            {factors && factors.length > 0 ? (
              factors.map((f, idx) => (
                <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-2.5 px-4 font-sans font-semibold text-slate-800">{f.factor}</td>
                  <td className="py-2.5 px-4 text-right text-slate-700">
                    {typeof f.raw_value === 'number' ? f.raw_value.toFixed(1) : f.raw_value || '0'}
                  </td>
                  <td className="py-2.5 px-4 text-right text-slate-500">
                    {typeof f.weight === 'number' ? f.weight.toFixed(2) : f.weight}
                  </td>
                  <td className="py-2.5 px-4 text-right font-bold text-slate-900">
                    {typeof f.weighted_value === 'number'
                      ? f.weighted_value.toFixed(1)
                      : f.weighted_value || '0'}
                  </td>
                  <td className="py-2.5 px-4">{getStatusBadge(f.status)}</td>
                  <td className="py-2.5 px-4 text-[11px] font-sans text-slate-500">
                    {f.source || f.details || '—'}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-400 font-sans italic">
                  No multi-factor score breakdown items returned by the decision engine.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
