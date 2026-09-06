/**
 * eventService.ts — RailNexus Backend
 * In-memory Server-Sent Events (SSE) event bus for controller and maintenance worker notifications.
 */

import { Response } from 'express';
import { EventEmitter } from 'events';
import { Role } from '../config/constants';

class RailNexusEventBus extends EventEmitter {}
const eventBus = new RailNexusEventBus();
eventBus.setMaxListeners(200);

export interface SseClientUser {
  id?: string;
  role?: string;
  department?: string;
}

interface SseClient {
  id: string;
  res: Response;
  user?: SseClientUser;
}

const clients: Map<string, SseClient> = new Map();

/**
 * Registers an active SSE HTTP response stream for an authenticated client (Controller or Maintenance Worker).
 */
export function registerSseClient(
  clientId: string,
  res: Response,
  user?: SseClientUser
): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  // Send initial connection acknowledgement
  res.write(
    `event: CONNECTED\ndata: ${JSON.stringify({
      clientId,
      role: user?.role,
      department: user?.department,
      timestamp: new Date().toISOString(),
    })}\n\n`
  );

  clients.set(clientId, { id: clientId, res, user });

  // Heartbeat ping every 25 seconds to keep connection alive through proxies
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) {
      res.write(': heartbeat\n\n');
    }
  }, 25000);

  res.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(clientId);
  });
}

/**
 * Broadcasts an event to connected authenticated SSE streams.
 * Applies department-level isolation for maintenance worker clients.
 */
export function emitControllerEvent(eventType: string, payload: Record<string, any>): void {
  const timestamp = payload.timestamp || new Date().toISOString();
  const canonicalPayload = {
    eventType,
    timestamp,
    ...payload,
  };

  const eventMessage = `event: ${eventType}\ndata: ${JSON.stringify(canonicalPayload)}\n\n`;

  for (const [clientId, client] of clients.entries()) {
    if (client.res.writableEnded) {
      clients.delete(clientId);
      continue;
    }

    // Role and department-aware event filtering:
    // Controllers and Admins receive all network-wide events
    const isControllerOrAdmin =
      !client.user?.role ||
      client.user.role === Role.CONTROLLER ||
      client.user.role === Role.ADMIN;

    if (isControllerOrAdmin) {
      client.res.write(eventMessage);
      continue;
    }

    // For maintenance workers, apply department matching or direct creator match
    const eventDept = payload.department ? String(payload.department).trim().toUpperCase() : undefined;
    const clientDept = client.user?.department ? String(client.user.department).trim().toUpperCase() : undefined;

    const matchesDepartment = !eventDept || (clientDept && eventDept === clientDept);
    const matchesUser = client.user?.id && (payload.userId === client.user.id || payload.createdBy === client.user.id);

    if (matchesDepartment || matchesUser) {
      client.res.write(eventMessage);
    }
  }

  eventBus.emit(eventType, canonicalPayload);
}

export function getActiveClientCount(): number {
  return clients.size;
}

export function getActiveControllerClientCount(): number {
  let count = 0;
  for (const client of clients.values()) {
    if (
      !client.user?.role ||
      client.user.role === Role.CONTROLLER ||
      client.user.role === Role.ADMIN
    ) {
      count++;
    }
  }
  return count;
}

