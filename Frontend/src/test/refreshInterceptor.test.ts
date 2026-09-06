import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { apiClient, executeTokenRefresh, setAccessToken, getAccessToken } from '../api/client';

vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>();
  return {
    ...actual,
    default: {
      ...actual.default,
      post: vi.fn(),
      create: actual.default.create,
    },
  };
});

describe('Single-Flight Token Refresh & Axios Interceptor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setAccessToken('initial-expired-token');
  });

  it('handles single 401 by performing token refresh and returning fresh token', async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: {
        success: true,
        data: { token: 'refreshed-jwt-token' },
      },
    });

    const token = await executeTokenRefresh();

    expect(token).toBe('refreshed-jwt-token');
    expect(getAccessToken()).toBe('refreshed-jwt-token');
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post).toHaveBeenCalledWith(
      '/api/v1/auth/refresh',
      {},
      { withCredentials: true }
    );
  });

  it('guarantees multiple simultaneous refresh requests execute only ONE flight', async () => {
    let resolveRefresh: any;
    const pendingRefreshPromise = new Promise((resolve) => {
      resolveRefresh = resolve;
    });

    vi.mocked(axios.post).mockReturnValue(pendingRefreshPromise as any);

    // Trigger 3 concurrent requests to refresh
    const callA = executeTokenRefresh();
    const callB = executeTokenRefresh();
    const callC = executeTokenRefresh();

    // Verify axios.post has only been called ONCE despite 3 concurrent triggers
    expect(axios.post).toHaveBeenCalledTimes(1);

    // Resolve the single flight
    resolveRefresh({
      data: {
        success: true,
        data: { token: 'single-flight-shared-token' },
      },
    });

    const [tokenA, tokenB, tokenC] = await Promise.all([callA, callB, callC]);

    expect(tokenA).toBe('single-flight-shared-token');
    expect(tokenB).toBe('single-flight-shared-token');
    expect(tokenC).toBe('single-flight-shared-token');
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  it('clears auth state and dispatches logout event once when refresh fails', async () => {
    const expiredEventSpy = vi.fn();
    window.addEventListener('railnexus:auth:expired', expiredEventSpy);

    vi.mocked(axios.post).mockRejectedValue(new Error('Session revoked or refresh token expired'));

    const call1 = executeTokenRefresh();
    const call2 = executeTokenRefresh();

    await expect(call1).rejects.toThrow('Session revoked or refresh token expired');
    await expect(call2).rejects.toThrow('Session revoked or refresh token expired');

    // Auth state cleared
    expect(getAccessToken()).toBeNull();
    // Refresh only called once
    expect(axios.post).toHaveBeenCalledTimes(1);
    // Expired event dispatched once
    expect(expiredEventSpy).toHaveBeenCalledTimes(1);

    window.removeEventListener('railnexus:auth:expired', expiredEventSpy);
  });
});
