import React from 'react';

interface FooterAdvisoryProps {
  lastSyncSeconds?: number;
  assessmentDetail?: string;
}

export const FooterAdvisory: React.FC<FooterAdvisoryProps> = ({
  lastSyncSeconds = 12,
  assessmentDetail,
}) => {
  return (
    <footer className="border-t border-slate-200 bg-white/70 py-2.5 px-6 text-[11px] text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2 select-none">
      <div className="flex items-center space-x-2">
        <span className="font-semibold text-slate-600">Decision Support Notice:</span>
        <span>
          RailNexus provides operational decision support. Final authority remains with the authorised railway operating personnel.
        </span>
      </div>

      <div className="flex items-center space-x-4 text-slate-400 font-mono text-[10px]">
        {assessmentDetail && <span className="text-slate-500 font-sans">{assessmentDetail}</span>}
        <span>Last synchronised: {lastSyncSeconds}s ago</span>
      </div>
    </footer>
  );
};
