import { useEffect, useRef, useState } from 'react';
import { apiBaseUrl, getAccessToken, executeTokenRefresh } from '../api/client';

export interface MaintenanceEvent {
  eventType: string;
  timestamp: string;
  requestId?: string;
  status?: string;
  department?: string;
  decisionId?: string;
  selectedWindow?: {
    start: string;
    end: string;
  };
  reason?: string;
  [key: string]: any;
}

const KNOWN_EVENT_TYPES = new Set([
  'CONNECTED',
  'MAINTENANCE_REQUEST_CREATED',
  'REQUEST_RECOMMENDED',
  'REQUEST_APPROVED',
  'REQUEST_REJECTED',
  'PLAN_REANALYZED',
]);

function isValidMaintenanceEvent(obj: unknown): obj is MaintenanceEvent {
  if (!obj || typeof obj !== 'object') return false;
  const e = obj as Record<string, unknown>;
  if (typeof e.eventType !== 'string' || !KNOWN_EVENT_TYPES.has(e.eventType)) return false;
  if (typeof e.timestamp !== 'string' || !e.timestamp.trim()) return false;
  return true;
}

export function useMaintenanceEvents(onEvent?: (event: MaintenanceEvent) => void) {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [lastEvent, setLastEvent] = useState<MaintenanceEvent | null>(null);
  const [events, setEvents] = useState<MaintenanceEvent[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  // Deduplication cache: last 100 event signatures
  const seenEventsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let isActive = true;
    let backoffDelay = 1000;
    const MAX_BACKOFF = 30000;

    async function connectSSE() {
      if (!isActive) return;

      let token = getAccessToken();
      if (!token) {
        setIsConnected(false);
        return;
      }

      abortControllerRef.current = new AbortController();

      try {
        const response = await fetch(`${apiBaseUrl}/maintenance/events`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'text/event-stream',
          },
          credentials: 'include',
          signal: abortControllerRef.current.signal,
        });

        // Handle expired token directly
        if (response.status === 401) {
          try {
            token = await executeTokenRefresh();
            if (isActive && token) {
              return connectSSE();
            }
          } catch {
            setIsConnected(false);
            return;
          }
        }

        if (!response.ok || !response.body) {
          throw new Error(`SSE connection failed: HTTP ${response.status}`);
        }

        setIsConnected(true);
        backoffDelay = 1000;

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (isActive) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const chunk of lines) {
            if (!chunk.trim() || chunk.startsWith(':')) continue;

            let currentEvent = 'message';
            let dataStr = '';

            for (const line of chunk.split('\n')) {
              if (line.startsWith('event: ')) {
                currentEvent = line.slice(7).trim();
              } else if (line.startsWith('data: ')) {
                dataStr = line.slice(6).trim();
              }
            }

            if (!dataStr) continue;

            try {
              const rawData = JSON.parse(dataStr);
              const eventPayload: MaintenanceEvent = {
                eventType: currentEvent,
                ...rawData,
              };

              if (!isValidMaintenanceEvent(eventPayload)) {
                continue;
              }

              // Deduplication
              const signature = `${eventPayload.eventType}-${eventPayload.requestId || ''}-${eventPayload.timestamp}`;
              if (seenEventsRef.current.has(signature)) {
                continue;
              }
              seenEventsRef.current.add(signature);
              if (seenEventsRef.current.size > 100) {
                const first = seenEventsRef.current.values().next().value;
                if (first) seenEventsRef.current.delete(first);
              }

              if (isActive) {
                setLastEvent(eventPayload);
                setEvents((prev) => [eventPayload, ...prev].slice(0, 50));
                onEventRef.current?.(eventPayload);
              }
            } catch {
              // Ignore unparseable frames
            }
          }
        }
      } catch (err: any) {
        if (!isActive || err.name === 'AbortError') return;
        setIsConnected(false);

        // Exponential backoff reconnect
        reconnectTimeoutRef.current = setTimeout(() => {
          if (isActive) {
            backoffDelay = Math.min(backoffDelay * 1.5, MAX_BACKOFF);
            connectSSE();
          }
        }, backoffDelay);
      }
    }

    connectSSE();

    return () => {
      isActive = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      setIsConnected(false);
    };
  }, []);

  return { isConnected, lastEvent, events };
}
