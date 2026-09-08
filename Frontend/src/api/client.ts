import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/+$/, '');

let accessToken: string | null = localStorage.getItem('railnexus_access_token');

export const setAccessToken = (token: string | null) => {
  accessToken = token;
  if (token) {
    localStorage.setItem('railnexus_access_token', token);
  } else {
    localStorage.removeItem('railnexus_access_token');
  }
};

export const getAccessToken = (): string | null => {
  if (!accessToken) {
    accessToken = localStorage.getItem('railnexus_access_token');
  }
  return accessToken;
};

export const apiClient = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Send HttpOnly refresh cookie
});

// Request interceptor: attach bearer token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAccessToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

let refreshPromise: Promise<string> | null = null;

export const executeTokenRefresh = async (): Promise<string> => {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const refreshResp = await axios.post(
        `${apiBaseUrl}/auth/refresh`,
        {},
        { withCredentials: true }
      );

      if (refreshResp.data?.success && refreshResp.data?.data?.token) {
        const newToken = refreshResp.data.data.token as string;
        setAccessToken(newToken);
        return newToken;
      }
      throw new Error('Invalid refresh token response');
    } catch (err) {
      setAccessToken(null);
      window.dispatchEvent(new CustomEvent('railnexus:auth:expired'));
      throw err;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
};

// Response interceptor: auto-refresh on 401 with single-flight concurrency protection
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (!originalRequest) {
      return Promise.reject(error);
    }

    // Never retry auth endpoints to avoid infinite refresh loops
    const isAuthEndpoint =
      originalRequest.url?.includes('/auth/refresh') ||
      originalRequest.url?.includes('/auth/login') ||
      originalRequest.url?.includes('/auth/register');

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;

      try {
        const newToken = await executeTokenRefresh();
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
        }
        return apiClient(originalRequest);
      } catch (refreshErr) {
        return Promise.reject(refreshErr);
      }
    }

    return Promise.reject(error);
  }
);

