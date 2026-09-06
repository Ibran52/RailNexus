import React from 'react';
import { RequestStatus } from '../types';

interface StatusBadgeProps {
  status: RequestStatus | string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const normalized = status.toUpperCase();

  let styles = 'bg-slate-100 text-slate-700 border-slate-300';
  let dotColor = 'bg-slate-400';

  if (normalized === RequestStatus.RECOMMENDED) {
    styles = 'bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold';
    dotColor = 'bg-emerald-500';
  } else if (normalized === RequestStatus.APPROVED || normalized === RequestStatus.SCHEDULED) {
    styles = 'bg-green-50 text-green-800 border-green-300 font-semibold';
    dotColor = 'bg-green-600';
  } else if (normalized === RequestStatus.ANALYZING) {
    styles = 'bg-blue-50 text-blue-800 border-blue-300 animate-pulse';
    dotColor = 'bg-blue-500';
  } else if (normalized === RequestStatus.PENDING) {
    styles = 'bg-amber-50 text-amber-800 border-amber-300';
    dotColor = 'bg-amber-500';
  } else if (normalized === RequestStatus.REJECTED || normalized === RequestStatus.CANCELLED) {
    styles = 'bg-rose-50 text-rose-800 border-rose-300';
    dotColor = 'bg-rose-500';
  } else if (normalized === RequestStatus.MODIFIED) {
    styles = 'bg-purple-50 text-purple-800 border-purple-300';
    dotColor = 'bg-purple-500';
  }

  const padding = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${padding} ${styles} uppercase tracking-wider font-mono`}
    >
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotColor}`} />
      {status}
    </span>
  );
};
