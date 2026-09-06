import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RoleGuard } from '../components/RoleGuard';
import { Role, Department } from '../types';
import * as AuthContextModule from '../context/AuthContext';

describe('RoleGuard RBAC Protection', () => {
  const renderWithRole = (userRole: Role | null, allowedRoles: Role[]) => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: userRole
        ? {
            id: 'test-id',
            name: 'Test Officer',
            email: 'test@railnexus.gov.in',
            role: userRole,
            department: Department.ENGINEERING,
          }
        : null,
      isAuthenticated: Boolean(userRole),
      isLoading: false,
      login: vi.fn(),
      loginController: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
      registerController: vi.fn(),
      updateUser: vi.fn(),
      updateProfile: vi.fn(),
      changePassword: vi.fn(),
    });


    return render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/login" element={<div>LOGIN_PAGE</div>} />
          <Route path="/auth/login" element={<div>LOGIN_PAGE</div>} />
          <Route path="/worker/dashboard" element={<div>WORKER_DASHBOARD</div>} />
          <Route path="/controller/dashboard" element={<div>CONTROLLER_DASHBOARD</div>} />
          <Route
            path="/protected"
            element={
              <RoleGuard allowedRoles={allowedRoles}>
                <div>PROTECTED_CONTROLLER_CONTENT</div>
              </RoleGuard>
            }
          />
        </Routes>
      </MemoryRouter>
    );
  };

  it('allows CONTROLLER into controller-only protected routes', () => {
    renderWithRole(Role.CONTROLLER, [Role.CONTROLLER]);
    expect(screen.getByText('PROTECTED_CONTROLLER_CONTENT')).toBeInTheDocument();
  });

  it('blocks MAINTENANCE_ENGINEERING from controller-only protected routes and redirects', () => {
    renderWithRole(Role.MAINTENANCE_ENGINEERING, [Role.CONTROLLER]);
    expect(screen.queryByText('PROTECTED_CONTROLLER_CONTENT')).not.toBeInTheDocument();
    expect(screen.getByText('WORKER_DASHBOARD')).toBeInTheDocument();
  });

  it('blocks MAINTENANCE_SNT from controller-only protected routes and redirects', () => {
    renderWithRole(Role.MAINTENANCE_SNT, [Role.CONTROLLER]);
    expect(screen.queryByText('PROTECTED_CONTROLLER_CONTENT')).not.toBeInTheDocument();
    expect(screen.getByText('WORKER_DASHBOARD')).toBeInTheDocument();
  });

  it('blocks MAINTENANCE_OHE from controller-only protected routes and redirects', () => {
    renderWithRole(Role.MAINTENANCE_OHE, [Role.CONTROLLER]);
    expect(screen.queryByText('PROTECTED_CONTROLLER_CONTENT')).not.toBeInTheDocument();
    expect(screen.getByText('WORKER_DASHBOARD')).toBeInTheDocument();
  });

  it('redirects unauthenticated anonymous user to login', () => {
    renderWithRole(null, [Role.CONTROLLER]);
    expect(screen.queryByText('PROTECTED_CONTROLLER_CONTENT')).not.toBeInTheDocument();
    expect(screen.getByText('LOGIN_PAGE')).toBeInTheDocument();
  });
});
