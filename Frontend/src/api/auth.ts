import { apiClient, setAccessToken } from './client';
import { Department, Role, User } from '../types';

export interface AuthResponse {
  success: boolean;
  data: {
    token: string;
    user: User;
  };
  error?: {
    code: string;
    message: string;
  };
}

export interface ProfileUpdatePayload {
  name?: string;
  email?: string;
}

export interface PasswordChangePayload {
  currentPassword: string;
  newPassword: string;
  confirmPassword?: string;
}

export const authApi = {
  async login(email: string, password: string): Promise<AuthResponse> {
    const res = await apiClient.post<AuthResponse>('/auth/login', { email, password });
    if (res.data.success && res.data.data?.token) {
      setAccessToken(res.data.data.token);
    }
    return res.data;
  },

  async loginController(email: string, controllerId: string, password: string): Promise<AuthResponse> {
    const res = await apiClient.post<AuthResponse>('/auth/controller/login', { email, controllerId, password });
    if (res.data.success && res.data.data?.token) {
      setAccessToken(res.data.data.token);
    }
    return res.data;
  },

  async registerController(data: {
    name: string;
    email: string;
    controllerId: string;
    password: string;
    confirmPassword?: string;
  }): Promise<AuthResponse> {
    const res = await apiClient.post<AuthResponse>('/auth/controller/register', data);
    if (res.data.success && res.data.data?.token) {
      setAccessToken(res.data.data.token);
    }
    return res.data;
  },

  async register(data: {
    name: string;
    email: string;
    password: string;
    role: Role | string;
    department?: Department | string;
    departmentType?: string;
  }): Promise<AuthResponse> {
    const res = await apiClient.post<AuthResponse>('/auth/register', data);
    if (res.data.success && res.data.data?.token) {
      setAccessToken(res.data.data.token);
    }
    return res.data;
  },

  async getMe(): Promise<{ success: boolean; data: User }> {
    const res = await apiClient.get('/auth/me');
    return res.data;
  },

  /**
   * PATCH /auth/me — Update name and/or email.
   * Role, department, and controllerId are strictly immutable.
   */
  async updateProfile(payload: ProfileUpdatePayload): Promise<{ success: boolean; data: User; message?: string }> {
    const res = await apiClient.patch('/auth/me', payload);
    return res.data;
  },

  /**
   * PATCH /auth/password — Change password.
   * Requires currentPassword verification.
   */
  async changePassword(payload: PasswordChangePayload): Promise<{ success: boolean; message?: string }> {
    const res = await apiClient.patch('/auth/password', payload);
    return res.data;
  },

  async logout(): Promise<void> {
    try {
      await apiClient.post('/auth/logout');
    } finally {
      setAccessToken(null);
    }
  },

  async refresh(): Promise<AuthResponse> {
    const res = await apiClient.post<AuthResponse>('/auth/refresh');
    if (res.data.success && res.data.data?.token) {
      setAccessToken(res.data.data.token);
    }
    return res.data;
  },
};
