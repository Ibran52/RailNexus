import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GeographicCorridorImpactMap } from '../components/GeographicCorridorImpactMap';
import { Department, RequestPriority, RequestStatus } from '../types';

const request = {
  _id: 'req-1', requestId: 'REQ-1', createdBy: 'user-1', department: Department.ENGINEERING,
  maintenanceType: 'TRACK', fromStation: 'AAA', toStation: 'BBB', durationMinutes: 60,
  earliestStart: '1900-01-01T10:00:00', latestEnd: '1900-01-01T12:00:00',
  priority: RequestPriority.HIGH, status: RequestStatus.RECOMMENDED, planningVersion: 1,
  createdAt: '', updatedAt: '',
};

describe('GeographicCorridorImpactMap', () => {
  it('uses verified coordinates and section endpoints without fabricated stations', () => {
    render(
      <GeographicCorridorImpactMap
        stations={[
          { station_code: 'AAA', station_name: 'Alpha', latitude: 18.5, longitude: 73.8 },
          { station_code: 'BBB', station_name: 'Beta', latitude: 18.6, longitude: 73.9 },
          { station_code: 'INVALID', latitude: 180, longitude: 0 },
        ]}
        sections={[{ section_id: 1, from_station: 'AAA', to_station: 'BBB' }]}
        request={request}
        candidate={{ conflicts: [{ train_number: 123, from_station: 'AAA', to_station: 'BBB' }], affected_trains: [{ train_number: 123 }] }}
      />
    );

    expect(screen.getByText('STATIC TOPOLOGY · LIVE LOCATION DATA UNAVAILABLE')).toBeInTheDocument();
    expect(screen.getByText('MAINTENANCE BLOCK')).toBeInTheDocument();
    expect(screen.getByText('CONFLICTS')).toBeInTheDocument();
    expect(screen.getByText('AFFECTED TRAINS')).toBeInTheDocument();
    expect(screen.queryByText('INVALID')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Geographic railway corridor schematic' })).toBeInTheDocument();
  });

  it('shows missing data when verified coordinates are unavailable', () => {
    render(<GeographicCorridorImpactMap stations={[]} sections={[]} request={null} candidate={null} />);
    expect(screen.getByText('MISSING DATA')).toBeInTheDocument();
  });
});
