import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

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
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.stubEnv('VITE_API_URL', 'https://railnexus-backend.onrender.com');
    vi.stubEnv('DEV', false);

    localStorage.clear();
    const clientModule = await import('../api/client');
    clientModule.setAccessToken('initial-expired-token');
    (globalThis as any).__railnexusTestExports = clientModule;
  });

  it('uses the configured production API base when VITE_API_URL is present', async () => {
    const { apiBaseUrl } = await import('../api/client');
    expect(apiBaseUrl).toBe('https://railnexus-backend.onrender.com/api/v1');
  });

  it('keeps localhost support in development when no VITE_API_URL is configured', async () => {
    vi.stubEnv('VITE_API_URL', '');
    vi.resetModules();
    const { apiBaseUrl } = await import('../api/client');

    expect(apiBaseUrl).toBe('http://localhost:5000/api/v1');
  });

  it('handles single 401 by performing token refresh and returning fresh token', async () => {
    const { executeTokenRefresh, getAccessToken } = (globalThis as any).__railnexusTestExports;

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
      'https://railnexus-backend.onrender.com/api/v1/auth/refresh',
      {},
      { withCredentials: true }
    );
  });

  it('guarantees multiple simultaneous refresh requests execute only ONE flight', async () => {
    const { executeTokenRefresh } = (globalThis as any).__railnexusTestExports;

    let resolveRefresh: any;
    const pendingRefreshPromise = new Promise((resolve) => {
      resolveRefresh = resolve;
    });

    vi.mocked(axios.post).mockReturnValue(pendingRefreshPromise as any);

    const callA = executeTokenRefresh();
    const callB = executeTokenRefresh();
    const callC = executeTokenRefresh();

    expect(axios.post).toHaveBeenCalledTimes(1);

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
    const { executeTokenRefresh, getAccessToken } = (globalThis as any).__railnexusTestExports;
    const expiredEventSpy = vi.fn();
    window.addEventListener('railnexus:auth:expired', expiredEventSpy);

    vi.mocked(axios.post).mockRejectedValue(new Error('Session revoked or refresh token expired'));

    const call1 = executeTokenRefresh();
    const call2 = executeTokenRefresh();

    await expect(call1).rejects.toThrow('Session revoked or refresh token expired');
    await expect(call2).rejects.toThrow('Session revoked or refresh token expired');

    expect(getAccessToken()).toBeNull();
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(expiredEventSpy).toHaveBeenCalledTimes(1);

    window.removeEventListener('railnexus:auth:expired', expiredEventSpy);
  });
});
