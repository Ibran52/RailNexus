import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LoginPage } from '../pages/auth/LoginPage';
import { RegisterPage } from '../pages/auth/RegisterPage';
import { MaintenanceDashboardPage } from '../pages/maintenance/MaintenanceDashboardPage';
import { authApi } from '../api/auth';
import { maintenanceApi } from '../api/maintenance';
import { AuthProvider } from '../context/AuthContext';
import * as AuthContextModule from '../context/AuthContext';
import { Role, Department } from '../types';

vi.mock('../api/auth', () => ({
  authApi: {
    login: vi.fn(),
    logout: vi.fn(),
    getMe: vi.fn(),
    register: vi.fn(),
    refresh: vi.fn(),
  },
}));

vi.mock('../api/maintenance', () => ({
  maintenanceApi: {
    getRequests: vi.fn().mockResolvedValue([]),
    createRequest: vi.fn(),
    getRequest: vi.fn(),
    getRequestAnalysis: vi.fn(),
  },
}));

describe('RailNexus Auth Flow & Role Architecture - Final Acceptance Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('Login Screen Constraints', () => {
    it('contains only Official Email and Password inputs and NO department shortcut buttons', () => {
      render(
        <MemoryRouter initialEntries={['/auth/login']}>
          <AuthProvider>
            <LoginPage />
          </AuthProvider>
        </MemoryRouter>
      );

      // Verify email and password fields exist
      expect(screen.getByLabelText(/official email address/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign in to railnexus/i })).toBeInTheDocument();

      // Verify removal of department shortcut buttons from normal login UI
      expect(screen.queryByRole('button', { name: /controller \(hq\)/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^engineering$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^s&t$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /traction \/ ohe/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^ohe$/i })).not.toBeInTheDocument();
    });

    it('translates raw 500 error into a user-friendly message and does not display raw Axios error text', async () => {
      vi.mocked(authApi.login).mockRejectedValue(new Error('Request failed with status code 500'));

      render(
        <MemoryRouter initialEntries={['/auth/login']}>
          <AuthProvider>
            <LoginPage />
          </AuthProvider>
        </MemoryRouter>
      );

      await userEvent.type(screen.getByLabelText(/official email address/i), 'officer@railnexus.gov.in');
      await userEvent.type(screen.getByLabelText(/password/i), 'SecretPass123!');
      await userEvent.click(screen.getByRole('button', { name: /sign in to railnexus/i }));

      await waitFor(() => {
        // Raw axios error text must NOT be displayed
        expect(screen.queryByText(/request failed with status code 500/i)).not.toBeInTheDocument();
        // User friendly error should be displayed
        expect(
          screen.getByText(/authentication service is currently unavailable/i)
        ).toBeInTheDocument();
      });
    });

    it('routes authenticated worker to /worker/dashboard', async () => {
      vi.mocked(authApi.login).mockResolvedValue({
        success: true,
        data: {
          accessToken: 'test-token',
          user: {
            id: 'worker-1',
            name: 'Rahul Sharma',
            email: 'rahul@railnexus.gov.in',
            role: Role.MAINTENANCE_SNT,
            department: Department.SNT,
          },
        },
      } as any);

      render(
        <MemoryRouter initialEntries={['/auth/login']}>
          <AuthProvider>
            <Routes>
              <Route path="/auth/login" element={<LoginPage />} />
              <Route path="/worker/dashboard" element={<div data-testid="worker-dash">WORKER DASHBOARD TARGET</div>} />
              <Route path="/controller/dashboard" element={<div>CONTROLLER DASHBOARD TARGET</div>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      );

      await userEvent.type(screen.getByLabelText(/official email address/i), 'rahul@railnexus.gov.in');
      await userEvent.type(screen.getByLabelText(/password/i), 'ValidPass123!');
      await userEvent.click(screen.getByRole('button', { name: /sign in to railnexus/i }));

      await waitFor(() => {
        expect(screen.getByTestId('worker-dash')).toBeInTheDocument();
      });
    });

    it('routes authenticated controller to /controller/dashboard', async () => {
      vi.mocked(authApi.login).mockResolvedValue({
        success: true,
        data: {
          accessToken: 'test-token',
          user: {
            id: 'ctrl-1',
            name: 'Priya Verma',
            email: 'priya@railnexus.gov.in',
            role: Role.CONTROLLER,
            department: Department.CONTROLLER,
          },
        },
      } as any);

      render(
        <MemoryRouter initialEntries={['/auth/login']}>
          <AuthProvider>
            <Routes>
              <Route path="/auth/login" element={<LoginPage />} />
              <Route path="/worker/dashboard" element={<div>WORKER DASHBOARD TARGET</div>} />
              <Route path="/controller/dashboard" element={<div data-testid="controller-dash">CONTROLLER DASHBOARD TARGET</div>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      );

      await userEvent.type(screen.getByLabelText(/official email address/i), 'priya@railnexus.gov.in');
      await userEvent.type(screen.getByLabelText(/password/i), 'ValidPass123!');
      await userEvent.click(screen.getByRole('button', { name: /sign in to railnexus/i }));

      await waitFor(() => {
        expect(screen.getByTestId('controller-dash')).toBeInTheDocument();
      });
    });
  });

  describe('Registration Screen Constraints', () => {
    it('contains Full Name, Official Email, Password, Confirm Password, and Department dropdown', () => {
      render(
        <MemoryRouter initialEntries={['/auth/register']}>
          <AuthProvider>
            <RegisterPage />
          </AuthProvider>
        </MemoryRouter>
      );

      expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/official email address/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^department/i)).toBeInTheDocument();
    });

    it('department dropdown contains Engineering, S&T, OHE, and Other — Controller is NOT a department', () => {
      render(
        <MemoryRouter initialEntries={['/auth/register']}>
          <AuthProvider>
            <RegisterPage />
          </AuthProvider>
        </MemoryRouter>
      );

      const deptSelect = screen.getByLabelText(/^department/i) as HTMLSelectElement;
      const options = Array.from(deptSelect.options).map((opt) => opt.text);

      expect(options).toContain('Engineering');
      expect(options).toContain('S&T');
      expect(options).toContain('OHE');
      expect(options).toContain('Other');

      // Controller is a role, NOT a maintenance department option
      expect(options).not.toContain('Controller');
      expect(options).not.toContain('Controller (HQ)');
      expect(options).not.toContain('Chief Operations Controller');
    });

    it('shows Other Department Name when Other is selected, and hides/clears it when switched away', async () => {
      render(
        <MemoryRouter initialEntries={['/auth/register']}>
          <AuthProvider>
            <RegisterPage />
          </AuthProvider>
        </MemoryRouter>
      );

      // Initially, custom department input should NOT be in document
      expect(screen.queryByLabelText(/other department name/i)).not.toBeInTheDocument();

      // Select "Other"
      await userEvent.selectOptions(screen.getByLabelText(/^department/i), 'OTHER');

      // Now custom department input must appear and be required
      const customDeptInput = screen.getByLabelText(/other department name/i);
      expect(customDeptInput).toBeInTheDocument();
      expect(customDeptInput).toBeRequired();

      // Type custom department name
      await userEvent.type(customDeptInput, 'Signalling Planning');
      expect(customDeptInput).toHaveValue('Signalling Planning');

      // Switch back to "Engineering"
      await userEvent.selectOptions(screen.getByLabelText(/^department/i), 'ENGINEERING');

      // Custom department input must be hidden
      expect(screen.queryByLabelText(/other department name/i)).not.toBeInTheDocument();

      // Switch to "Other" again and verify it was cleared
      await userEvent.selectOptions(screen.getByLabelText(/^department/i), 'OTHER');
      expect(screen.getByLabelText(/other department name/i)).toHaveValue('');
    });

    it('submits registration with custom department when Other is selected', async () => {
      vi.mocked(authApi.register).mockResolvedValue({
        success: true,
        data: {
          user: {
            id: 'worker-custom-1',
            name: 'Sameer Khan',
            email: 'sameer@railnexus.gov.in',
            role: Role.MAINTENANCE_ENGINEERING,
            department: 'Signalling Planning',
          },
          token: 'token-xyz',
        },
      } as any);

      render(
        <MemoryRouter initialEntries={['/auth/register']}>
          <AuthProvider>
            <RegisterPage />
          </AuthProvider>
        </MemoryRouter>
      );

      await userEvent.type(screen.getByLabelText(/full name/i), 'Sameer Khan');
      await userEvent.type(screen.getByLabelText(/official email address/i), 'sameer@railnexus.gov.in');
      await userEvent.type(screen.getByLabelText(/^password/i), 'ValidPass123!');
      await userEvent.type(screen.getByLabelText(/confirm password/i), 'ValidPass123!');
      await userEvent.selectOptions(screen.getByLabelText(/^department/i), 'OTHER');
      await userEvent.type(screen.getByLabelText(/other department name/i), 'Signalling Planning');

      await userEvent.click(screen.getByRole('button', { name: /^register$/i }));

      await waitFor(() => {
        expect(authApi.register).toHaveBeenCalledWith({
          name: 'Sameer Khan',
          email: 'sameer@railnexus.gov.in',
          password: 'ValidPass123!',
          role: Role.MAINTENANCE_ENGINEERING,
          department: 'Signalling Planning',
          departmentType: 'OTHER',
        });
      });
    });

    it('validates password and confirm password match', async () => {
      render(
        <MemoryRouter initialEntries={['/auth/register']}>
          <AuthProvider>
            <RegisterPage />
          </AuthProvider>
        </MemoryRouter>
      );

      await userEvent.type(screen.getByLabelText(/full name/i), 'Amit Kumar');
      await userEvent.type(screen.getByLabelText(/official email address/i), 'amit@railnexus.gov.in');
      await userEvent.type(screen.getByLabelText(/^password/i), 'Password123!');
      await userEvent.type(screen.getByLabelText(/confirm password/i), 'DifferentPassword456!');
      await userEvent.selectOptions(screen.getByLabelText(/^department/i), 'ENGINEERING');

      await userEvent.click(screen.getByRole('button', { name: /^register$/i }));

      await waitFor(() => {
        expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
      });
      expect(authApi.register).not.toHaveBeenCalled();
    });
  });

  describe('Worker Dashboard Dynamic Department Display', () => {
    it('renders the SAME Worker Dashboard dynamically displaying S&T department for SNT role', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: {
          id: 'worker-snt',
          name: 'Rahul',
          email: 'rahul@railnexus.gov.in',
          role: Role.MAINTENANCE_SNT,
          department: Department.SNT,
        },
        isAuthenticated: true,
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

      render(
        <MemoryRouter>
          <MaintenanceDashboardPage />
        </MemoryRouter>
      );

      expect(screen.getByText('WORKER DASHBOARD')).toBeInTheDocument();
      expect(screen.getByText(/role: maintenance worker/i)).toBeInTheDocument();
      expect(screen.getByText(/welcome, rahul/i)).toBeInTheDocument();
      expect(screen.getByText('S&T')).toBeInTheDocument();
    });

    it('renders the SAME Worker Dashboard dynamically displaying Engineering for ENGINEERING role', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: {
          id: 'worker-eng',
          name: 'Vikram',
          email: 'vikram@railnexus.gov.in',
          role: Role.MAINTENANCE_ENGINEERING,
          department: Department.ENGINEERING,
        },
        isAuthenticated: true,
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

      render(
        <MemoryRouter>
          <MaintenanceDashboardPage />
        </MemoryRouter>
      );

      expect(screen.getByText('WORKER DASHBOARD')).toBeInTheDocument();
      expect(screen.getByText(/role: maintenance worker/i)).toBeInTheDocument();
      expect(screen.getByText(/welcome, vikram/i)).toBeInTheDocument();
      expect(screen.getByText('Engineering')).toBeInTheDocument();
    });

    it('renders the SAME Worker Dashboard dynamically displaying OHE for OHE role', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: {
          id: 'worker-ohe',
          name: 'Sunil',
          email: 'sunil@railnexus.gov.in',
          role: Role.MAINTENANCE_OHE,
          department: Department.OHE,
        },
        isAuthenticated: true,
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

      render(
        <MemoryRouter>
          <MaintenanceDashboardPage />
        </MemoryRouter>
      );

      expect(screen.getByText('WORKER DASHBOARD')).toBeInTheDocument();
      expect(screen.getByText(/role: maintenance worker/i)).toBeInTheDocument();
      expect(screen.getByText(/welcome, sunil/i)).toBeInTheDocument();
      expect(screen.getByText('OHE')).toBeInTheDocument();
    });

    it('renders the SAME Worker Dashboard dynamically displaying custom department (e.g. Signalling Planning)', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: {
          id: 'worker-custom',
          name: 'Sameer',
          email: 'sameer@railnexus.gov.in',
          role: Role.MAINTENANCE_ENGINEERING,
          department: 'Signalling Planning',
        },
        isAuthenticated: true,
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

      render(
        <MemoryRouter>
          <MaintenanceDashboardPage />
        </MemoryRouter>
      );

      expect(screen.getByText('WORKER DASHBOARD')).toBeInTheDocument();
      expect(screen.getByText(/role: maintenance worker/i)).toBeInTheDocument();
      expect(screen.getByText(/welcome, sameer/i)).toBeInTheDocument();
      expect(screen.getByText('Signalling Planning')).toBeInTheDocument();
    });
  });
});
