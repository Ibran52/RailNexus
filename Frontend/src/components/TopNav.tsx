import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Role, formatDepartment } from '../types';
import { LogOut, Activity, Radio, UserCircle } from 'lucide-react';

export type SseStatus = 'ONLINE' | 'OFFLINE' | 'CONNECTING' | 'RECONNECTING' | 'NOT_REQUIRED';

interface TopNavProps {
  isSseConnected?: boolean;
  sseStatus?: SseStatus;
}

export const TopNav: React.FC<TopNavProps> = ({ isSseConnected, sseStatus }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const resolvedStatus: SseStatus =
    sseStatus ??
    (typeof isSseConnected === 'boolean' ? (isSseConnected ? 'ONLINE' : 'OFFLINE') : 'NOT_REQUIRED');

  const isLive = resolvedStatus === 'ONLINE';
  const isTransitioning = resolvedStatus === 'CONNECTING' || resolvedStatus === 'RECONNECTING';
  const isNotRequired = resolvedStatus === 'NOT_REQUIRED';

  const isController = user?.role === Role.CONTROLLER || user?.role === Role.ADMIN;

  const controllerTabs = [
    { label: 'Operations', path: '/controller/dashboard' },
    { label: 'Block Planner', path: '/controller/planner' },
    { label: 'Coordination', path: '/controller/coordination' },
    { label: 'Scenario Analysis', path: '/controller/what-if' },
    { label: 'Configuration', path: '/controller/config' },
  ];

  const workerTabs = [
    { label: 'Worker Dashboard', path: '/worker/dashboard' },
    { label: '+ Create Request', path: '/worker/requests/new' },
  ];

  const activeTabs = isController ? controllerTabs : workerTabs;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const getDepartmentBadge = () => {
    if (!user) return null;
    if (isController) return 'HQ · Chief Operations Controller';
    const dept = formatDepartment(user.department);
    return `${dept} · Worker`;
  };

  return (
    <header className="bg-white border-t-[3px] border-[#0e2a47] border-b border-slate-200 text-slate-800 select-none shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
      <div className="max-w-[1700px] mx-auto px-4 sm:px-6 flex h-12 items-center justify-between">
        {/* Left: Brand + Navigation Tabs (Matching Screenshot 161750 / 161806) */}
        <div className="flex items-center space-x-6 h-full">
          <Link
            to={isController ? '/controller/dashboard' : '/worker/dashboard'}
            className="flex items-center space-x-2 mr-2"
          >
            <div className="bg-[#0e2a47] text-white p-1 rounded">
              <Activity className="h-3.5 w-3.5 text-emerald-400" />
            </div>
            <span className="font-bold tracking-wider text-sm uppercase font-mono text-[#0e2a47]">
              Rail<span className="text-emerald-600">Nexus</span>
            </span>
          </Link>

          <nav className="flex space-x-1 h-full">
            {activeTabs.map((tab) => {
              const isActive =
                tab.path === '/controller/dashboard'
                  ? location.pathname === '/controller' || location.pathname === '/controller/dashboard'
                  : location.pathname.startsWith(tab.path);

              return (
                <Link
                  key={tab.path}
                  to={tab.path}
                  className={`px-3.5 flex items-center text-xs tracking-tight transition-colors duration-150 border-b-2 h-full ${
                    isActive
                      ? 'border-sky-600 text-sky-900 font-bold'
                      : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300 font-medium'
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right: Secondary SSE connection, Role Badge & User Profile */}
        <div className="flex items-center space-x-3 text-xs">
          {isController && (
            <div
              className={`flex items-center space-x-1.5 px-2 py-0.5 rounded text-[10px] font-mono border ${
                isLive
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                  : isTransitioning
                    ? 'bg-amber-50 text-amber-700 border-amber-300'
                    : isNotRequired
                      ? 'bg-slate-100 text-slate-500 border-slate-300'
                      : 'bg-slate-100 text-slate-500 border-slate-300'
              }`}
            >
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full ${
                  isLive
                    ? 'bg-emerald-500 animate-pulse'
                    : isTransitioning
                      ? 'bg-amber-500 animate-pulse'
                      : 'bg-slate-400'
                }`}
              />
              <Radio className="h-3 w-3" />
              <span>
                {isLive
                  ? 'LIVE FEED'
                  : isTransitioning
                    ? (resolvedStatus === 'CONNECTING' ? 'CONNECTING' : 'RECONNECTING')
                    : isNotRequired
                      ? 'NOT REQUIRED'
                      : 'OFFLINE'}
              </span>
            </div>
          )}

          <div className="flex items-center space-x-2 text-slate-600 text-xs">
            <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[11px] text-slate-700 font-medium">
              {getDepartmentBadge()}
            </span>
            <span className="text-slate-300">|</span>
            <Link
              to={isController ? '/controller/profile' : '/worker/profile'}
              title="View Profile"
              className="flex items-center gap-1 font-semibold text-slate-800 hover:text-sky-700 transition-colors"
            >
              <UserCircle className="h-3.5 w-3.5" />
              <span>{user?.name}</span>
            </Link>
          </div>

          <button
            onClick={handleLogout}
            title="Sign Out"
            className="flex items-center space-x-1 text-slate-400 hover:text-rose-600 transition-colors p-1 rounded hover:bg-slate-100"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
