import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { TopNav } from '../components/TopNav';
import { Role } from '../types';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'ctrl-1',
      name: 'Priya Verma',
      email: 'priya@railnexus.gov.in',
      role: Role.CONTROLLER,
      department: 'HQ',
    },
    logout: vi.fn(),
  }),
}));

describe('TopNav realtime status semantics', () => {
  it('shows NOT REQUIRED when a controller page does not subscribe to SSR/SSE', () => {
    render(
      <MemoryRouter initialEntries={['/controller/planner']}>
        <TopNav />
      </MemoryRouter>
    );

    expect(screen.getByText('NOT REQUIRED')).toBeInTheDocument();
    expect(screen.queryByText('OFFLINE')).not.toBeInTheDocument();
  });

  it('shows the actual realtime state when the hook reports a live connection', () => {
    render(
      <MemoryRouter initialEntries={['/controller/dashboard']}>
        <TopNav sseStatus="ONLINE" />
      </MemoryRouter>
    );

    expect(screen.getByText('LIVE FEED')).toBeInTheDocument();
  });
});
