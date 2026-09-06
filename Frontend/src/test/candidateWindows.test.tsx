import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { CandidateWindowsPage } from '../pages/controller/CandidateWindowsPage';
import { controllerApi } from '../api/controller';
import { CandidateWindow, Department, MaintenanceRequest, RequestPriority, RequestStatus } from '../types';

vi.mock('../api/controller', () => ({
  controllerApi: {
    getRequestDetails: vi.fn(),
    getRequestAnalysis: vi.fn(),
  },
}));

vi.mock('../components/TopNav', () => ({
  TopNav: () => <div data-testid="top-nav">TOP_NAV</div>,
}));

vi.mock('../components/FooterAdvisory', () => ({
  FooterAdvisory: () => <div data-testid="footer">FOOTER</div>,
}));

describe('Candidate Windows Dynamic Derivation', () => {
  const dummyRequest = {
    _id: 'mongo-id-1',
    requestId: 'REQ-TST-101',
    maintenanceType: 'Track Tamping',
    fromStation: 'STA',
    toStation: 'STB',
    durationMinutes: 120,
    earliestStart: '2026-09-01T11:30:00Z',
    latestEnd: '2026-09-01T14:30:00Z',
    priority: RequestPriority.MEDIUM,
    status: RequestStatus.PENDING,
    department: Department.ENGINEERING,
    createdBy: 'officer-1',
    planningVersion: 1,
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
  } as MaintenanceRequest;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses recommendations when available and labels them dynamically (Option A, Option B)', async () => {
    const recs: CandidateWindow[] = [
      {
        start: '2026-09-01T11:30:00Z',
        end: '2026-09-01T13:30:00Z',
        direct_delay_minutes: 12,
        conflict_count: 0,
        impact_score: 15,
        is_recommended: true,
      },
      {
        start: '2026-09-01T12:00:00Z',
        end: '2026-09-01T14:00:00Z',
        direct_delay_minutes: 24,
        conflict_count: 0,
        impact_score: 30,
        is_recommended: false,
      },
    ];

    vi.mocked(controllerApi.getRequestDetails).mockResolvedValue({
      request: dummyRequest,
      activeAnalysis: {
        run_id: 'RUN-1',
        recommendations: recs,
        alternatives: [],
        status: 'SUCCESS',
        timestamp: new Date().toISOString(),
      } as any,
    });

    render(
      <MemoryRouter initialEntries={['/controller/requests/REQ-TST-101/candidates']}>
        <Routes>
          <Route path="/controller/requests/:requestId/candidates" element={<CandidateWindowsPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Option A')).toBeInTheDocument();
      expect(screen.getByText('Option B')).toBeInTheDocument();
    });

    // Zero phantom options: Option C must NOT exist when only 2 options returned
    expect(screen.queryByText('Option C')).not.toBeInTheDocument();
  });

  it('falls back to alternatives when recommendations are empty', async () => {
    const alts: CandidateWindow[] = [
      {
        start: '2026-09-01T14:00:00Z',
        end: '2026-09-01T16:00:00Z',
        direct_delay_minutes: 35,
        conflict_count: 0,
        impact_score: 45,
      },
    ];

    vi.mocked(controllerApi.getRequestDetails).mockResolvedValue({
      request: dummyRequest,
      activeAnalysis: {
        run_id: 'RUN-2',
        recommendations: [],
        alternatives: alts,
        status: 'SUCCESS',
        timestamp: new Date().toISOString(),
      } as any,
    });

    render(
      <MemoryRouter initialEntries={['/controller/requests/REQ-TST-101/candidates']}>
        <Routes>
          <Route path="/controller/requests/:requestId/candidates" element={<CandidateWindowsPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Option A')).toBeInTheDocument();
    });

    // Only Option A should exist
    expect(screen.queryByText('Option B')).not.toBeInTheDocument();
    expect(screen.queryByText('Option C')).not.toBeInTheDocument();
  });

  it('displays empty state message when neither recommendations nor alternatives exist', async () => {
    vi.mocked(controllerApi.getRequestDetails).mockResolvedValue({
      request: dummyRequest,
      activeAnalysis: {
        run_id: 'RUN-3',
        recommendations: [],
        alternatives: [],
        status: 'SUCCESS',
        timestamp: new Date().toISOString(),
      } as any,
    });

    render(
      <MemoryRouter initialEntries={['/controller/requests/REQ-TST-101/candidates']}>
        <Routes>
          <Route path="/controller/requests/:requestId/candidates" element={<CandidateWindowsPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        screen.getByText('No candidate block windows available for this maintenance request.')
      ).toBeInTheDocument();
    });

    expect(screen.queryByText('Option A')).not.toBeInTheDocument();
    expect(screen.queryByText('Option B')).not.toBeInTheDocument();
    expect(screen.queryByText('Option C')).not.toBeInTheDocument();
  });
});
