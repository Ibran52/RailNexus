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
      _id: 'mongo-id-wif-1',
      requestId: 'REQ-WIF-001',
      maintenanceType: 'Track Tamping',
      fromStation: 'DIVA',
      toStation: 'KOPR',
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
    {
      _id: 'mongo-id-wif-2',
      requestId: 'REQ-WIF-002',
      maintenanceType: 'Track Renewal',
      fromStation: 'BUD',
      toStation: 'ABH',
      durationMinutes: 120,
      earliestStart: '2026-09-01T10:00:00Z',
      latestEnd: '2026-09-01T15:00:00Z',
      priority: RequestPriority.CRITICAL,
      status: RequestStatus.PENDING,
      department: Department.SNT,
      createdBy: 'officer-2',
      planningVersion: 1,
      createdAt: '2026-09-01T09:10:00Z',
      updatedAt: '2026-09-01T09:10:00Z',
    },
  ] as MaintenanceRequest[];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('correctly labels simulation output as WHAT-IF / SIMULATION ONLY and non-operational', async () => {
    vi.mocked(controllerApi.getAllRequests).mockResolvedValue(dummyRequests);
    vi.mocked(controllerApi.runWhatIf).mockResolvedValue({
      metrics: {
        total_delay_minutes: 14,
        direct_delay_minutes: 6,
        cascade_delay_minutes: 8,
        conflict_count: 0,
        affected_train_count: 2,
      },
      recommendation: {
        impact_score: 22,
        conflict_count: 0,
        is_feasible: true,
      },
      is_feasible: false,
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
      expect(screen.getAllByText('WHAT-IF / SIMULATION ONLY').length).toBeGreaterThanOrEqual(1);
    });

    expect(
      screen.getByText(/This projection is sandbox-evaluated and does NOT commit operational block approvals/i)
    ).toBeInTheDocument();

    expect(screen.getByText(/14/i)).toBeInTheDocument();
    expect(screen.getByText('22')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('Feasible')).toBeInTheDocument();
    expect(controllerApi.runWhatIf).toHaveBeenCalledTimes(1);
  });

  it('replaces the prior successful result when a later simulation fails', async () => {
    vi.mocked(controllerApi.getAllRequests).mockResolvedValue(dummyRequests);
    vi.mocked(controllerApi.runWhatIf)
      .mockResolvedValueOnce({
        metrics: {
          total_delay_minutes: 0,
          direct_delay_minutes: 0,
          cascade_delay_minutes: 0,
          conflict_count: 0,
          affected_train_count: 0,
        },
        recommendation: {
          impact_score: 0,
          conflict_count: 0,
          is_feasible: true,
        },
        explanation: 'DIVA->KOPR rationale',
      })
      .mockRejectedValueOnce({
        response: { data: { error: { message: 'No feasible window for BUD->ABH.' } } },
      });

    render(
      <MemoryRouter>
        <WhatIfSimulatorPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/REQ-WIF-001/)).toBeInTheDocument();
    });

    const firstInputs = screen.getAllByRole('textbox');
    await userEvent.type(firstInputs[0], '1900-01-01T11:30:00');
    await userEvent.type(firstInputs[1], '1900-01-01T14:00:00');
    await userEvent.click(screen.getByRole('button', { name: /Run Simulation/i }));

    await waitFor(() => {
      expect(screen.getByText(/DIVA->KOPR rationale/i)).toBeInTheDocument();
    });

    await userEvent.selectOptions(screen.getByRole('combobox'), 'REQ-WIF-002');
    const secondInputs = screen.getAllByRole('textbox');
    await userEvent.clear(secondInputs[0]);
    await userEvent.clear(secondInputs[1]);
    await userEvent.type(secondInputs[0], '1900-01-01T10:14:00');
    await userEvent.type(secondInputs[1], '1900-01-01T15:30:00');
    await userEvent.click(screen.getByRole('button', { name: /Run Simulation/i }));

    await waitFor(() => {
      expect(screen.getByText(/Simulation Failed \/ Invalid Request/i)).toBeInTheDocument();
      expect(screen.getAllByText(/No feasible window for BUD->ABH\./i).length).toBeGreaterThan(0);
    });

    expect(screen.queryByText(/DIVA->KOPR rationale/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Simulation Complete — Impact Metrics/i)).not.toBeInTheDocument();
    expect(screen.queryByText('0 min')).not.toBeInTheDocument();
  });

  it('clears stale failure state when a later simulation succeeds', async () => {
    vi.mocked(controllerApi.getAllRequests).mockResolvedValue(dummyRequests);
    vi.mocked(controllerApi.runWhatIf)
      .mockRejectedValueOnce({
        response: { data: { error: { message: 'Initial request invalid.' } } },
      })
      .mockResolvedValueOnce({
        metrics: {
          total_delay_minutes: 12,
          direct_delay_minutes: 5,
          cascade_delay_minutes: 7,
          conflict_count: 1,
          affected_train_count: 3,
        },
        recommendation: {
          impact_score: 12,
          conflict_count: 1,
          is_feasible: true,
        },
        explanation: 'Latest request succeeded after previous failure',
      });

    render(
      <MemoryRouter>
        <WhatIfSimulatorPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/REQ-WIF-001/)).toBeInTheDocument();
    });

    const firstInputs = screen.getAllByRole('textbox');
    await userEvent.type(firstInputs[0], '1900-01-01T11:30:00');
    await userEvent.type(firstInputs[1], '1900-01-01T14:00:00');
    await userEvent.click(screen.getByRole('button', { name: /Run Simulation/i }));

    await waitFor(() => {
      expect(screen.getByText(/Simulation Failed \/ Invalid Request/i)).toBeInTheDocument();
    });

    await userEvent.selectOptions(screen.getByRole('combobox'), 'REQ-WIF-002');
    const secondInputs = screen.getAllByRole('textbox');
    await userEvent.clear(secondInputs[0]);
    await userEvent.clear(secondInputs[1]);
    await userEvent.type(secondInputs[0], '1900-01-01T10:14:00');
    await userEvent.type(secondInputs[1], '1900-01-01T15:30:00');
    await userEvent.click(screen.getByRole('button', { name: /Run Simulation/i }));

    await waitFor(() => {
      expect(screen.getByText(/Simulation Complete — Impact Metrics/i)).toBeInTheDocument();
      expect(screen.getByText(/Latest request succeeded after previous failure/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(/Initial request invalid\./i)).not.toBeInTheDocument();
  });

  it('keeps the failed state when repeated requests fail without reusing any previous data', async () => {
    vi.mocked(controllerApi.getAllRequests).mockResolvedValue(dummyRequests);
    vi.mocked(controllerApi.runWhatIf).mockRejectedValue({
      response: { data: { error: { message: 'Repeated failure - no feasible window.' } } },
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
    await userEvent.click(screen.getByRole('button', { name: /Run Simulation/i }));

    await waitFor(() => {
      expect(screen.getByText(/Simulation Failed \/ Invalid Request/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Repeated failure - no feasible window\./i).length).toBeGreaterThan(0);
    });

    expect(screen.queryByText(/Simulation Complete — Impact Metrics/i)).not.toBeInTheDocument();
  });
});
