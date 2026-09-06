import React from 'react';
import { DelayTraceItem } from '../types';
import { Clock } from 'lucide-react';

interface DelayTraceTimelineProps {
  traces?: DelayTraceItem[];
  sectionCode?: string;
}

export const DelayTraceTimeline: React.FC<DelayTraceTimelineProps> = ({
  traces = [],
  sectionCode = 'SECTION',
}) => {
  const items: DelayTraceItem[] = traces && traces.length > 0 ? traces : [];

  const getNodeColor = (item: DelayTraceItem) => {
    if (item.trace_level === 'DIRECT' || item.event_type?.includes('BLOCK')) {
      return { dot: 'bg-blue-600', ring: 'ring-blue-100' };
    }
    if (item.delay_minutes && item.delay_minutes > 10) {
      return { dot: 'bg-rose-600', ring: 'ring-rose-100' };
    }
    if (item.trace_level === 'SECONDARY' || item.event_type?.includes('HELD')) {
      return { dot: 'bg-amber-500', ring: 'ring-amber-100' };
    }
    return { dot: 'bg-slate-500', ring: 'ring-slate-100' };
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-subtle select-none">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
        <div className="flex items-center space-x-2">
          <Clock className="h-4 w-4 text-slate-500" />
          <h4 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-800">
            Downstream Propagation Timeline
          </h4>
        </div>
        <span className="text-[11px] text-slate-400 font-mono">
          {items.length} EVENT{items.length !== 1 ? 'S' : ''} RECORDED
        </span>
      </div>

      {items.length === 0 ? (
        <div className="py-6 text-center text-xs font-mono text-slate-400">
          No downstream train delay cascade events recorded for {sectionCode}.
        </div>
      ) : (
        <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-200">
          {items.map((item, idx) => {
            const { dot, ring } = getNodeColor(item);
            return (
              <div key={idx} className="relative group">
                {/* Timeline Node Dot */}
                <div
                  className={`absolute -left-6 top-1.5 w-3 h-3 rounded-full border-2 border-white ring-4 ${ring} ${dot} transition-transform`}
                />

                <div className="flex flex-col">
                  {/* Time Stamp */}
                  <div className="flex items-center space-x-2 text-xs">
                    <span className="font-mono font-bold text-slate-800">
                      {item.time || (item.step_minutes !== undefined ? `+${item.step_minutes}m` : '—')}
                    </span>
                    {item.trace_level && (
                      <span
                        className={`text-[9px] font-mono font-semibold px-1.5 py-0.2 rounded border ${
                          item.trace_level === 'DIRECT'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : item.trace_level === 'SECONDARY'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-purple-50 text-purple-700 border-purple-200'
                        }`}
                      >
                        {item.trace_level}
                      </span>
                    )}
                    {item.delay_minutes !== undefined && item.delay_minutes > 0 && (
                      <span className="text-[11px] font-bold text-rose-600 font-mono">
                        +{item.delay_minutes} min delay
                      </span>
                    )}
                  </div>

                  {/* Event Description */}
                  <p className="text-xs text-slate-700 font-medium mt-0.5">{item.description}</p>

                  {item.train_number && (
                    <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                      Train: <span className="font-bold text-slate-700">{item.train_number}</span>{' '}
                      {item.train_type ? `(${item.train_type})` : ''}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
