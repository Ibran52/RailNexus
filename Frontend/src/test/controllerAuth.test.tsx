import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { ControllerRegisterPage } from '../pages/auth/ControllerRegisterPage';
import { ControllerLoginPage } from '../pages/auth/ControllerLoginPage';
import { RegisterPage } from '../pages/auth/RegisterPage';
import { authApi } from '../api/auth';
import { Role, Department } from '../types';

vi.mock('../api/auth', () => ({
  authApi: {
    login: vi.fn(),
    loginController: vi.fn(),
    register: vi.fn(),
    registerController: vi.fn(),
    getMe: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  },
}));

describe('Frontend Controller Authentication & Registration Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Controller Registration UI & Live Validation', () => {
    it('renders all required controller registration fields and helper instructions', () => {
      render(
        <MemoryRouter initialEntries={['/controller/register']}>
          <AuthProvider>
            <ControllerRegisterPage />
          </AuthProvider>
        </MemoryRouter>
      );

      expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/official email address/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/controller id/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /register controller/i })).toBeInTheDocument();

      // Helper texts
      expect(screen.getByText(/Controller ID \(6 Characters\)/i)).toBeInTheDocument();
      expect(screen.getByText('6 Characters', { selector: 'span' })).toBeInTheDocument();
      expect(screen.getByText(/Uppercase \(A-Z\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Lowercase \(a-z\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Special \(!@#\.\.\.\)/i)).toBeInTheDocument();
    });

    it('shows live validation checklist status when typing invalid and valid Controller IDs', async () => {
      render(
        <MemoryRouter initialEntries={['/controller/register']}>
          <AuthProvider>
            <ControllerRegisterPage />
          </AuthProvider>
        </MemoryRouter>
      );

      const ctrlIdInput = screen.getByLabelText(/controller id/i);

      // Type too short & lowercase only: "abc"
      await userEvent.type(ctrlIdInput, 'abc');
      const lengthSpan = screen.getByText('6 Characters', { selector: 'span' });
      expect(lengthSpan.closest('div')?.className).toContain('text-white/40');

      // Clear and type valid: "A@b123"
      await userEvent.clear(ctrlIdInput);
      await userEvent.type(ctrlIdInput, 'A@b123');

      // All 4 criteria indicators should now have the active emerald color
      expect(lengthSpan.closest('div')?.className).toContain('text-emerald-400');
      expect(screen.getByText(/Uppercase \(A-Z\)/i).closest('div')?.className).toContain('text-emerald-400');
      expect(screen.getByText(/Lowercase \(a-z\)/i).closest('div')?.className).toContain('text-emerald-400');
      expect(screen.getByText(/Special \(!@#\.\.\.\)/i).closest('div')?.className).toContain('text-emerald-400');
    });

    it('submits valid controller registration and navigates to /controller/dashboard', async () => {
      vi.mocked(authApi.registerController).mockResolvedValueOnce({
        success: true,
        data: {
          token: 'mock-ctrl-token',
          user: {
            id: 'ctrl-user-1',
            name: 'Vikram Singh',
            email: 'vikram@railnexus.gov.in',
            role: Role.CONTROLLER,
            department: Department.CONTROLLER,
            controllerId: 'A@b123',
          },
        },
      } as any);

      render(
        <MemoryRouter initialEntries={['/controller/register']}>
          <AuthProvider>
            <Routes>
              <Route path="/controller/register" element={<ControllerRegisterPage />} />
              <Route
                path="/controller/dashboard"
                element={<div data-testid="controller-dash">CONTROLLER DASHBOARD</div>}
              />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      );

      await userEvent.type(screen.getByLabelText(/full name/i), 'Vikram Singh');
      await userEvent.type(screen.getByLabelText(/official email address/i), 'vikram@railnexus.gov.in');
      await userEvent.type(screen.getByLabelText(/controller id/i), 'A@b123');
      await userEvent.type(screen.getByLabelText(/^password/i), 'ValidPass123!');
      await userEvent.type(screen.getByLabelText(/confirm password/i), 'ValidPass123!');

      await userEvent.click(screen.getByRole('button', { name: /register controller/i }));

      await waitFor(() => {
        expect(authApi.registerController).toHaveBeenCalledWith({
          name: 'Vikram Singh',
          email: 'vikram@railnexus.gov.in',
          controllerId: 'A@b123',
          password: 'ValidPass123!',
          confirmPassword: 'ValidPass123!',
        });
        expect(screen.getByTestId('controller-dash')).toBeInTheDocument();
      });
    });
  });

  describe('Controller Login UI & Submission', () => {
    it('renders Email, Controller ID, and Password fields on Controller Login', () => {
      render(
        <MemoryRouter initialEntries={['/controller/login']}>
          <AuthProvider>
            <ControllerLoginPage />
          </AuthProvider>
        </MemoryRouter>
      );

      expect(screen.getByLabelText(/official email address/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/controller id/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign in to controller/i })).toBeInTheDocument();

      // Switchers
      expect(screen.getByText(/maintenance personnel\?/i)).toBeInTheDocument();
      expect(screen.getByText(/sign in with worker login/i)).toBeInTheDocument();
    });

    it('submits email, controllerId, and password and redirects to /controller/dashboard', async () => {
      vi.mocked(authApi.loginController).mockResolvedValueOnce({
        success: true,
        data: {
          token: 'mock-ctrl-token',
          user: {
            id: 'ctrl-user-1',
            name: 'Vikram Singh',
            email: 'vikram@railnexus.gov.in',
            role: Role.CONTROLLER,
            department: Department.CONTROLLER,
            controllerId: 'A@b123',
          },
        },
      } as any);

      render(
        <MemoryRouter initialEntries={['/controller/login']}>
          <AuthProvider>
            <Routes>
              <Route path="/controller/login" element={<ControllerLoginPage />} />
              <Route
                path="/controller/dashboard"
                element={<div data-testid="controller-dash">CONTROLLER DASHBOARD</div>}
              />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      );

      await userEvent.type(screen.getByLabelText(/official email address/i), 'vikram@railnexus.gov.in');
      await userEvent.type(screen.getByLabelText(/controller id/i), 'A@b123');
      await userEvent.type(screen.getByLabelText(/^password/i), 'ValidPass123!');

      await userEvent.click(screen.getByRole('button', { name: /sign in to controller/i }));

      await waitFor(() => {
        expect(authApi.loginController).toHaveBeenCalledWith(
          'vikram@railnexus.gov.in',
          'A@b123',
          'ValidPass123!'
        );
        expect(screen.getByTestId('controller-dash')).toBeInTheDocument();
      });
    });
  });

  describe('Worker Registration Separation Check', () => {
    it('worker registration does NOT contain Controller ID or Controller department', () => {
      render(
        <MemoryRouter initialEntries={['/register']}>
          <AuthProvider>
            <RegisterPage />
          </AuthProvider>
        </MemoryRouter>
      );

      expect(screen.queryByLabelText(/controller id/i)).not.toBeInTheDocument();

      const deptSelect = screen.getByLabelText(/^department/i) as HTMLSelectElement;
      const options = Array.from(deptSelect.options).map((o) => o.text);
      expect(options).not.toContain('Controller');
    });
  });
});
