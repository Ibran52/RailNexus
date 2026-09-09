import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RequestDetailsPage } from '../pages/maintenance/RequestDetailsPage';
import { maintenanceApi } from '../api/maintenance';
import { Department, RequestPriority, RequestStatus } from '../types';

vi.mock('../api/maintenance', () => ({
  maintenanceApi: {
    getRequest: vi.fn(),
    getRequestAnalysis: vi.fn(),
  },
}));

vi.mock('../hooks/useMaintenanceEvents', () => ({
  useMaintenanceEvents: () => ({ isConnected: false }),
}));

vi.mock('../components/TopNav', () => ({
  TopNav: () => <div data-testid="top-nav">TOP_NAV</div>,
}));

vi.mock('../components/FooterAdvisory', () => ({
  FooterAdvisory: () => <div data-testid="footer">FOOTER</div>,
}));

vi.mock('../components/StatusBadge', () => ({
  StatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
}));

describe('RequestDetailsPage recommendation metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the actual backend recommendation metrics for each request instead of static defaults', async () => {
    vi.mocked(maintenanceApi.getRequest).mockResolvedValue({
      request: {
        _id: 'req-1',
        requestId: 'REQ-123',
        createdBy: 'user-1',
        department: Department.ENGINEERING,
        maintenanceType: 'Track Tamping',
        fromStation: 'BUD',
        toStation: 'ABH',
        durationMinutes: 120,
        earliestStart: '2026-09-01T10:00:00Z',
        latestEnd: '2026-09-01T12:00:00Z',
        priority: RequestPriority.HIGH,
        status: RequestStatus.RECOMMENDED,
        planningVersion: 1,
        createdAt: '2026-09-01T09:00:00Z',
        updatedAt: '2026-09-01T09:00:00Z',
      },
      activeAnalysis: {
        brainRunId: 'brain-123',
        requestId: 'REQ-123',
        planningVersion: 1,
        planningMode: 'STANDALONE',
        createdAt: '2026-09-01T09:05:00Z',
        recommendation: {
          start: '1900-01-01T10:00:00',
          end: '1900-01-01T11:30:00',
          direct_delay_minutes: 93.67,
          total_delay_minutes: 142.99,
          conflict_count: 2,
          impact_score: 142.99,
          feasibility: 'Infeasible',
          affected_train_count: 2,
          affected_trains: [{ train_number: '11042' }, { train_number: '17032' }],
        },
        metrics: {
          direct_delay_minutes: 93.67,
          total_delay_minutes: 142.99,
          conflict_count: 2,
          affected_train_count: 2,
        },
      },
    });

    vi.mocked(maintenanceApi.getRequestAnalysis).mockResolvedValue({
      brainRunId: 'brain-123',
      requestId: 'REQ-123',
      planningVersion: 1,
      planningMode: 'STANDALONE',
      createdAt: '2026-09-01T09:05:00Z',
      recommendation: {
        start: '1900-01-01T10:00:00',
        end: '1900-01-01T11:30:00',
        direct_delay_minutes: 93.67,
        total_delay_minutes: 142.99,
        conflict_count: 2,
        impact_score: 142.99,
        feasibility: 'Infeasible',
        affected_train_count: 2,
        affected_trains: [{ train_number: '11042' }, { train_number: '17032' }],
      },
      metrics: {
        direct_delay_minutes: 93.67,
        total_delay_minutes: 142.99,
        conflict_count: 2,
        affected_train_count: 2,
      },
    } as any);

    render(
      <MemoryRouter initialEntries={['/requests/REQ-123']}>
        <Routes>
          <Route path="/requests/:requestId" element={<RequestDetailsPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/REQ-123/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/93\.67/i)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Infeasible')).toBeInTheDocument();
    expect(screen.queryByText('18')).not.toBeInTheDocument();
    expect(screen.queryByText('Feasible')).not.toBeInTheDocument();
  });
});
