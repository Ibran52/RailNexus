import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { RoleGuard } from './components/RoleGuard';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { Role } from './types';

// Auth Pages
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { ControllerLoginPage } from './pages/auth/ControllerLoginPage';
import { ControllerRegisterPage } from './pages/auth/ControllerRegisterPage';
import { LandingPage } from './pages/LandingPage';
import { PublicAuthLayout } from './components/PublicAuthLayout';

// Controller Pages (Screenshots 1 - 11)
import { OperationsDashboard } from './pages/controller/OperationsDashboard';
import { BlockPlannerPage } from './pages/controller/BlockPlannerPage';
import { CandidateWindowsPage } from './pages/controller/CandidateWindowsPage';
import { WindowComparisonPage } from './pages/controller/WindowComparisonPage';
import { DecisionView } from './pages/controller/DecisionView';
import { BlockImpactAnalysisPage } from './pages/controller/BlockImpactAnalysisPage';
import { CoordinationHistoryPage } from './pages/controller/CoordinationHistoryPage';
import { WhatIfSimulatorPage } from './pages/controller/WhatIfSimulatorPage';
import { ConfigurationPage } from './pages/controller/ConfigurationPage';

// Maintenance Pages
import { MaintenanceDashboardPage } from './pages/maintenance/MaintenanceDashboardPage';
import { CreateRequestPage } from './pages/maintenance/CreateRequestPage';
import { RequestDetailsPage } from './pages/maintenance/RequestDetailsPage';

// Profile Page
import { ProfilePage } from './pages/profile/ProfilePage';

export const App: React.FC = () => {
  const controllerRoles = [Role.CONTROLLER, Role.ADMIN];
  const maintenanceRoles = [
    Role.MAINTENANCE_ENGINEERING,
    Role.MAINTENANCE_SNT,
    Role.MAINTENANCE_OHE,
    Role.ADMIN,
  ];
  const allAuthenticatedRoles = [...controllerRoles, ...maintenanceRoles];

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public Routes with Shared Railway Background & Green Navbar */}
            <Route element={<PublicAuthLayout />}>
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/controller/login" element={<ControllerLoginPage />} />
              <Route path="/controller/register" element={<ControllerRegisterPage />} />
              <Route path="/auth/login" element={<Navigate to="/login" replace />} />
              <Route path="/auth/register" element={<Navigate to="/register" replace />} />
            </Route>

            {/* Controller Protected Routes */}
            <Route path="/controller" element={<Navigate to="/controller/dashboard" replace />} />
            <Route
              path="/controller/dashboard"
              element={
                <RoleGuard allowedRoles={controllerRoles}>
                  <OperationsDashboard />
                </RoleGuard>
              }
            />
            <Route
              path="/controller/planner"
              element={
                <RoleGuard allowedRoles={controllerRoles}>
                  <BlockPlannerPage />
                </RoleGuard>
              }
            />
            <Route
              path="/controller/requests/:requestId/candidates"
              element={
                <RoleGuard allowedRoles={controllerRoles}>
                  <CandidateWindowsPage />
                </RoleGuard>
              }
            />
            <Route
              path="/controller/requests/:requestId/compare"
              element={
                <RoleGuard allowedRoles={controllerRoles}>
                  <WindowComparisonPage />
                </RoleGuard>
              }
            />
            <Route
              path="/controller/requests/:requestId/decision"
              element={
                <RoleGuard allowedRoles={controllerRoles}>
                  <DecisionView />
                </RoleGuard>
              }
            />
            <Route
              path="/controller/requests/:requestId/impact"
              element={
                <RoleGuard allowedRoles={controllerRoles}>
                  <BlockImpactAnalysisPage />
                </RoleGuard>
              }
            />
            <Route
              path="/controller/coordination"
              element={
                <RoleGuard allowedRoles={controllerRoles}>
                  <CoordinationHistoryPage />
                </RoleGuard>
              }
            />
            <Route
              path="/controller/history"
              element={<Navigate to="/controller/coordination" replace />}
            />
            <Route
              path="/controller/what-if"
              element={
                <RoleGuard allowedRoles={controllerRoles}>
                  <WhatIfSimulatorPage />
                </RoleGuard>
              }
            />
            <Route
              path="/controller/config"
              element={
                <RoleGuard allowedRoles={controllerRoles}>
                  <ConfigurationPage />
                </RoleGuard>
              }
            />
            <Route
              path="/controller/profile"
              element={
                <RoleGuard allowedRoles={controllerRoles}>
                  <ProfilePage />
                </RoleGuard>
              }
            />

            {/* Worker Protected Routes (Same Dashboard for Engineering, S&T, OHE) */}
            <Route
              path="/worker/dashboard"
              element={
                <RoleGuard allowedRoles={maintenanceRoles}>
                  <MaintenanceDashboardPage />
                </RoleGuard>
              }
            />
            <Route
              path="/worker/requests/new"
              element={
                <RoleGuard allowedRoles={maintenanceRoles}>
                  <CreateRequestPage />
                </RoleGuard>
              }
            />
            <Route
              path="/worker/requests/:requestId"
              element={
                <RoleGuard allowedRoles={maintenanceRoles}>
                  <RequestDetailsPage />
                </RoleGuard>
              }
            />
            <Route
              path="/worker/profile"
              element={
                <RoleGuard allowedRoles={maintenanceRoles}>
                  <ProfilePage />
                </RoleGuard>
              }
            />

            {/* Legacy Maintenance Route Redirects */}
            <Route path="/maintenance" element={<Navigate to="/worker/dashboard" replace />} />
            <Route path="/maintenance/dashboard" element={<Navigate to="/worker/dashboard" replace />} />
            <Route path="/maintenance/requests/new" element={<Navigate to="/worker/requests/new" replace />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
};

export default App;
