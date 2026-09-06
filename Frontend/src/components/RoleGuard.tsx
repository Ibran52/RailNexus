import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Role, UserRole } from '../types';

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: (Role | UserRole)[];
}

export const RoleGuard: React.FC<RoleGuardProps> = ({ children, allowedRoles }) => {
  const { user, isLoading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-rail-gray">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-rail-navy border-t-transparent" />
          <p className="text-xs font-medium text-rail-muted uppercase tracking-wider">
            Verifying RailNexus Session...
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    // If user is maintenance worker, route to worker dashboard
    if (user.role.startsWith('MAINTENANCE_')) {
      return <Navigate to="/worker/dashboard" replace />;
    }
    // If controller, route to controller dashboard
    if (user.role === Role.CONTROLLER || user.role === Role.ADMIN) {
      return <Navigate to="/controller/dashboard" replace />;
    }
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};
