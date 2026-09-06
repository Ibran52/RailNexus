import { describe, it, expect } from 'vitest';
import { emitControllerEvent, registerSseClient } from '../src/server/services/eventService';
import { Response } from 'express';

describe('Server-Sent Events (SSE) Bus', () => {
  it('should register client and broadcast event to connected streams', () => {
    let sentData = '';
    const mockResponse = {
      setHeader: () => {},
      flushHeaders: () => {},
      write: (chunk: string) => {
        sentData += chunk;
        return true;
      },
      on: () => {},
      writableEnded: false,
    } as unknown as Response;

    // Register
    registerSseClient('test-client-123', mockResponse);

    // Initial connection ack should be sent
    expect(sentData).toContain('event: CONNECTED');

    // Emit event
    emitControllerEvent('TEST_EVENT', { sampleKey: 'sampleValue' });

    expect(sentData).toContain('event: TEST_EVENT');
    expect(sentData).toContain('"sampleKey":"sampleValue"');
  });
});
