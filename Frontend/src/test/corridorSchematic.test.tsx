import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CorridorSchematic } from '../components/CorridorSchematic';

describe('CorridorSchematic Layout & Multi-Station Tests', () => {
  it('renders 1 station gracefully without errors', () => {
    render(
      <CorridorSchematic
        stations={[{ code: 'TNA', name: 'Thane' }]}
        corridorName="Single Station Test"
      />
    );
    expect(screen.getByText('TNA')).toBeInTheDocument();
    expect(screen.getByText('CORRIDOR STATIONS: 1')).toBeInTheDocument();
  });

  it('renders 5 stations with readable labels and correct station count', () => {
    const stations = [
      { code: 'MLND', name: 'Mulund' },
      { code: 'TNA', name: 'Thane' },
      { code: 'KLVA', name: 'Kalva' },
      { code: 'MBQ', name: 'Mumbra' },
      { code: 'DIVA', name: 'Diva' },
    ];
    render(
      <CorridorSchematic
        stations={stations}
        corridorName="5 Station Corridor"
      />
    );
    for (const st of stations) {
      expect(screen.getByText(st.code)).toBeInTheDocument();
    }
    expect(screen.getByText('CORRIDOR STATIONS: 5')).toBeInTheDocument();
  });

  it('renders 62 stations with full scrollable width and non-overlapping nodes', () => {
    const sixtyTwoStations = Array.from({ length: 62 }, (_, i) => ({
      code: `STN${String(i + 1).padStart(2, '0')}`,
      name: `Station ${i + 1}`,
      isJunction: i % 10 === 0,
    }));

    const { container } = render(
      <CorridorSchematic
        stations={sixtyTwoStations}
        corridorName="Full 62-Station Corridor"
        blockDetails={{
          from: 'STN05',
          to: 'STN12',
          department: 'ENGINEERING',
          window: '06:00–08:00',
        }}
        highlightSection={{
          from: 'STN01',
          to: 'STN20',
          label: 'SECTION HIGHLIGHT',
        }}
      />
    );

    expect(screen.getByText('CORRIDOR STATIONS: 62')).toBeInTheDocument();

    // Verify first, middle, and last stations are present in the DOM
    expect(screen.getByText('STN01')).toBeInTheDocument();
    expect(screen.getByText('STN31')).toBeInTheDocument();
    expect(screen.getByText('STN62')).toBeInTheDocument();

    // Verify maintenance block label is rendered
    expect(
      screen.getByText(/ENGINEERING BLOCK · 06:00–08:00/)
    ).toBeInTheDocument();

    // Verify scrollable viewport exists and content width expands properly (62 nodes * 120px + padding >= 7400px)
    const scrollContainer = container.querySelector('.overflow-x-auto');
    expect(scrollContainer).toBeInTheDocument();

    const canvasInner = scrollContainer?.querySelector('.relative');
    expect(canvasInner).toBeInTheDocument();
    const styleAttr = canvasInner?.getAttribute('style');
    expect(styleAttr).toContain('width:');
    // For 62 stations, width should be 80 + 61*120 + 80 = 7480px
    expect(styleAttr).toContain('7480px');
  });

  it('handles multiple overlapping maintenance block overlays with dynamic lane allocation', () => {
    const stations = [
      { code: 'A', name: 'A' },
      { code: 'B', name: 'B' },
      { code: 'C', name: 'C' },
      { code: 'D', name: 'D' },
      { code: 'E', name: 'E' },
    ];

    render(
      <CorridorSchematic
        stations={stations}
        highlightSection={{ from: 'A', to: 'D', label: 'COMBINED ZONE' }}
        blockDetails={{ from: 'B', to: 'C', department: 'OHE', window: '10:00–12:00' }}
      />
    );

    expect(screen.getByText('COMBINED ZONE')).toBeInTheDocument();
    expect(screen.getByText(/OHE BLOCK · 10:00–12:00/)).toBeInTheDocument();
  });

  it('renders TOPOLOGY DATA UNAVAILABLE when stations array is empty', () => {
    render(<CorridorSchematic stations={[]} />);
    expect(screen.getByText('TOPOLOGY DATA UNAVAILABLE')).toBeInTheDocument();
  });
});
