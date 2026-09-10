import { useEffect, useRef, useState } from 'react';
import { apiBaseUrl, getAccessToken, executeTokenRefresh } from '../api/client';

export interface ControllerEvent {
  eventType: string;
  timestamp: string;
  requestId?: string;
  department?: string;
  brainRunId?: string;
  decisionId?: string;
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

function isValidControllerEvent(obj: unknown): obj is ControllerEvent {
  if (!obj || typeof obj !== 'object') return false;
  const e = obj as Record<string, unknown>;
  if (typeof e.eventType !== 'string' || !KNOWN_EVENT_TYPES.has(e.eventType)) return false;
  if (typeof e.timestamp !== 'string' || !e.timestamp.trim()) return false;
  return true;
}

export type ControllerSseStatus = 'CONNECTING' | 'ONLINE' | 'RECONNECTING' | 'OFFLINE';

export function useControllerEvents(onEvent?: (event: ControllerEvent) => void) {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ControllerSseStatus>('CONNECTING');
  const [lastEvent, setLastEvent] = useState<ControllerEvent | null>(null);
  const [events, setEvents] = useState<ControllerEvent[]>([]);
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
        setConnectionStatus('OFFLINE');
        return;
      }

      setConnectionStatus('CONNECTING');

      abortControllerRef.current = new AbortController();

      try {
        const response = await fetch(`${apiBaseUrl}/controller/events`, {
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
            // Attempt single-flight refresh
            token = await executeTokenRefresh();
            if (isActive && token) {
              // Immediately reconnect with fresh token
              return connectSSE();
            }
          } catch (refreshErr) {
            // Refresh failed: authentication cleared by executeTokenRefresh
            setIsConnected(false);
            setConnectionStatus('OFFLINE');
            return;
          }
        }

        if (!response.ok || !response.body) {
          throw new Error(`SSE connection failed: HTTP ${response.status}`);
        }

        setIsConnected(true);
        setConnectionStatus('ONLINE');
        // Reset backoff on successful connection
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
            if (!chunk.trim() || chunk.startsWith(':')) continue; // Ignore heartbeats/comments

            const eventMatch = chunk.match(/^event:\s*(.+)$/m);
            const dataMatch = chunk.match(/^data:\s*(.+)$/m);

            if (dataMatch) {
              try {
                const parsedData = JSON.parse(dataMatch[1]);
                const eventType = eventMatch ? eventMatch[1].trim() : parsedData.eventType;
                const candidate = {
                  ...parsedData,
                  eventType,
                };

                // Strict schema type guard: drop malformed events or missing timestamp without fallback
                if (!isValidControllerEvent(candidate)) {
                  continue;
                }

                const eventObj = candidate;


                // Deduplicate events by type + id + timestamp
                const eventSig = `${eventObj.eventType}:${eventObj.requestId || ''}:${eventObj.decisionId || ''}:${eventObj.timestamp}`;
                if (seenEventsRef.current.has(eventSig)) {
                  continue;
                }
                seenEventsRef.current.add(eventSig);
                if (seenEventsRef.current.size > 200) {
                  // Keep cache bounded
                  const it = seenEventsRef.current.values();
                  for (let i = 0; i < 50; i++) {
                    seenEventsRef.current.delete(it.next().value!);
                  }
                }

                if (isActive) {
                  setLastEvent(eventObj);
                  setEvents((prev) => [eventObj, ...prev.slice(0, 49)]);
                  onEventRef.current?.(eventObj);
                }
              } catch (parseErr) {
                console.warn('Failed to parse SSE message data:', parseErr);
              }
            }
          }
        }
      } catch (err: any) {
        if (err.name !== 'AbortError' && isActive) {
          setIsConnected(false);
          setConnectionStatus('RECONNECTING');
          // Exponential backoff reconnect
          const nextDelay = backoffDelay;
          backoffDelay = Math.min(backoffDelay * 2, MAX_BACKOFF);

          reconnectTimeoutRef.current = setTimeout(() => {
            if (isActive) connectSSE();
          }, nextDelay);
        }
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
      setConnectionStatus('OFFLINE');
    };
  }, []);

  return { isConnected, connectionStatus, lastEvent, events };
}
