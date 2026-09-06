import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { authApi } from '../api/auth';
import { Role, Department } from '../types';

// Mock authApi
vi.mock('../api/auth', () => ({
  authApi: {
    login: vi.fn(),
    logout: vi.fn(),
    getMe: vi.fn(),
    register: vi.fn(),
    refresh: vi.fn(),
  },
}));

// Test harness component
const AuthConsumer: React.FC = () => {
  const { user, isAuthenticated, login, logout, isLoading } = useAuth();
  const [authError, setAuthError] = useState<string | null>(null);

  if (isLoading) return <div>Loading...</div>;

  const handleLogin = async () => {
    try {
      setAuthError(null);
      await login('controller@railnexus.gov.in', 'RailNexus@2026');
    } catch (err: any) {
      setAuthError(err.message || 'Login error');
    }
  };

  return (
    <div>
      <div data-testid="auth-status">{isAuthenticated ? 'AUTHENTICATED' : 'ANONYMOUS'}</div>
      <div data-testid="user-role">{user?.role || 'NONE'}</div>
      <div data-testid="user-email">{user?.email || 'NONE'}</div>
      {authError && <div data-testid="auth-error">{authError}</div>}
      <button onClick={handleLogin}>Login</button>
      <button onClick={() => logout()}>Logout</button>
    </div>
  );
};

describe('Authentication Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('restores authenticated session when token exists in storage', async () => {
    localStorage.setItem('railnexus_access_token', 'valid-test-token');
    vi.mocked(authApi.getMe).mockResolvedValue({
      success: true,
      data: {
        id: 'usr-1',
        name: 'Chief Controller',
        email: 'controller@railnexus.gov.in',
        role: Role.CONTROLLER,
        department: Department.CONTROLLER,
      },
    } as any);

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    expect(screen.getByText('Loading...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('AUTHENTICATED');
      expect(screen.getByTestId('user-role')).toHaveTextContent(Role.CONTROLLER);
      expect(screen.getByTestId('user-email')).toHaveTextContent('controller@railnexus.gov.in');
    });
  });

  it('handles login success correctly and updates context state', async () => {
    vi.mocked(authApi.getMe).mockRejectedValue(new Error('No token'));
    vi.mocked(authApi.login).mockResolvedValue({
      success: true,
      data: {
        user: {
          id: 'usr-2',
          name: 'Track Engineer',
          email: 'eng@railnexus.gov.in',
          role: Role.MAINTENANCE_ENGINEERING,
          department: Department.ENGINEERING,
        },
        token: 'jwt-token-123',
      },
    } as any);

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('ANONYMOUS');
    });

    const loginBtn = screen.getByText('Login');
    await userEvent.click(loginBtn);

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('AUTHENTICATED');
      expect(screen.getByTestId('user-role')).toHaveTextContent(Role.MAINTENANCE_ENGINEERING);
      expect(screen.getByTestId('user-email')).toHaveTextContent('eng@railnexus.gov.in');
    });
  });

  it('handles login failure without altering unauthenticated state', async () => {
    vi.mocked(authApi.getMe).mockRejectedValue(new Error('No token'));
    vi.mocked(authApi.login).mockRejectedValue(new Error('Invalid official credentials'));

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('ANONYMOUS');
    });

    const loginBtn = screen.getByText('Login');
    await userEvent.click(loginBtn);

    await waitFor(() => {
      expect(screen.getByTestId('auth-error')).toHaveTextContent('Invalid official credentials');
      expect(screen.getByTestId('auth-status')).toHaveTextContent('ANONYMOUS');
      expect(screen.getByTestId('user-role')).toHaveTextContent('NONE');
    });
  });

  it('handles logout and cleans authentication tokens', async () => {
    localStorage.setItem('railnexus_access_token', 'existing-token');
    vi.mocked(authApi.getMe).mockResolvedValue({
      success: true,
      data: {
        id: 'usr-1',
        name: 'Chief Controller',
        email: 'controller@railnexus.gov.in',
        role: Role.CONTROLLER,
        department: Department.CONTROLLER,
      },
    } as any);
    vi.mocked(authApi.logout).mockResolvedValue(undefined);

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('AUTHENTICATED');
    });

    const logoutBtn = screen.getByText('Logout');
    await userEvent.click(logoutBtn);

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('ANONYMOUS');
      expect(screen.getByTestId('user-role')).toHaveTextContent('NONE');
    });
    expect(localStorage.getItem('railnexus_access_token')).toBeNull();
  });
});
