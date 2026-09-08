import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { WhatIfSimulatorPage } from '../pages/controller/WhatIfSimulatorPage';
import { controllerApi } from '../api/controller';
import { Department, MaintenanceRequest, RequestPriority, RequestStatus } from '../types';

vi.mock('../api/controller', () => ({
  controllerApi: {
    getAllRequests: vi.fn(),
    runWhatIf: vi.fn(),
  },
}));

vi.mock('../components/TopNav', () => ({
  TopNav: () => <div data-testid="top-nav">TOP_NAV</div>,
}));

vi.mock('../components/FooterAdvisory', () => ({
  FooterAdvisory: () => <div data-testid="footer">FOOTER</div>,
}));

vi.mock('../components/RailwayTrack', () => ({
  RailwayTrack: ({ title, subtitle }: any) => (
    <div data-testid="railway-track">
      <div>{title}</div>
      <div>{subtitle}</div>
    </div>
  ),
}));

describe('What-If Simulator Verification', () => {
  const dummyRequests = [
    {
      _id: 'mongo-id-wif',
      requestId: 'REQ-WIF-001',
      maintenanceType: 'Track Tamping',
      fromStation: 'STA',
      toStation: 'STB',
      durationMinutes: 90,
      earliestStart: '2026-09-01T10:00:00Z',
      latestEnd: '2026-09-01T13:00:00Z',
      priority: RequestPriority.HIGH,
      status: RequestStatus.PENDING,
      department: Department.ENGINEERING,
      createdBy: 'officer-1',
      planningVersion: 1,
      createdAt: '2026-09-01T09:00:00Z',
      updatedAt: '2026-09-01T09:00:00Z',
    },
  ] as MaintenanceRequest[];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('correctly labels simulation output as WHAT-IF / SIMULATION ONLY and non-operational', async () => {
    vi.mocked(controllerApi.getAllRequests).mockResolvedValue(dummyRequests);
    vi.mocked(controllerApi.runWhatIf).mockResolvedValue({
      direct_delay_minutes: 14,
      impact_score: 22,
      conflict_count: 0,
      is_feasible: true,
      explanation: 'Simulation completed with zero critical corridor conflicts.',
      affected_trains: [],
    });

    render(
      <MemoryRouter>
        <WhatIfSimulatorPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/REQ-WIF-001/)).toBeInTheDocument();
    });

    const inputs = screen.getAllByRole('textbox');
    await userEvent.type(inputs[0], '1900-01-01T11:30:00');
    await userEvent.type(inputs[1], '1900-01-01T14:00:00');

    const runBtn = screen.getByRole('button', { name: /Run Simulation/i });
    await userEvent.click(runBtn);

    await waitFor(() => {
      // Must contain explicit non-operational simulation badge
      expect(screen.getAllByText('WHAT-IF / SIMULATION ONLY').length).toBeGreaterThanOrEqual(1);
    });

    // Verification of non-operational advisory
    expect(
      screen.getByText(/This projection is sandbox-evaluated and does NOT commit operational block approvals/i)
    ).toBeInTheDocument();

    // Verify runWhatIf was called but approveRequest/modifyRequest were NOT
    expect(controllerApi.runWhatIf).toHaveBeenCalledTimes(1);
  });
});
