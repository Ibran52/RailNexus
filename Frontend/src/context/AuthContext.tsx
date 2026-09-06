import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Department, Role, User } from '../types';
import { authApi, PasswordChangePayload, ProfileUpdatePayload } from '../api/auth';
import { getAccessToken, setAccessToken } from '../api/client';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, pass: string) => Promise<User>;
  loginController: (email: string, controllerId: string, pass: string) => Promise<User>;
  register: (data: {
    name: string;
    email: string;
    password: string;
    role: Role | string;
    department?: Department | string;
    departmentType?: string;
  }) => Promise<void>;
  registerController: (data: {
    name: string;
    email: string;
    controllerId: string;
    password: string;
    confirmPassword?: string;
  }) => Promise<void>;
  /**
   * Updates the in-memory user state with partial profile data after a successful
   * PATCH /auth/me response. Role, department, and controllerId are immutable here.
   */
  updateUser: (updatedUser: Partial<Pick<User, 'name' | 'email'>>) => void;
  updateProfile: (payload: ProfileUpdatePayload) => Promise<User>;
  changePassword: (payload: PasswordChangePayload) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const initSession = async () => {
    try {
      const token = getAccessToken();
      if (!token) {
        // Try refreshing session with HttpOnly cookie
        const res = await authApi.refresh();
        if (res.success && res.data?.user) {
          setUser(res.data.user);
          setIsLoading(false);
          return;
        }
      } else {
        const res = await authApi.getMe();
        if (res.success && res.data) {
          setUser(res.data);
          setIsLoading(false);
          return;
        }
      }
    } catch {
      setUser(null);
      setAccessToken(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    initSession();

    const handleAuthExpired = () => {
      setUser(null);
      setAccessToken(null);
    };

    window.addEventListener('railnexus:auth:expired', handleAuthExpired);
    return () => {
      window.removeEventListener('railnexus:auth:expired', handleAuthExpired);
    };
  }, []);

  const login = async (email: string, pass: string): Promise<User> => {
    setIsLoading(true);
    try {
      const res = await authApi.login(email, pass);
      if (res.success && res.data?.user) {
        setUser(res.data.user);
        return res.data.user;
      } else {
        throw new Error(res.error?.message || 'Login failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (data: {
    name: string;
    email: string;
    password: string;
    role: Role | string;
    department?: Department | string;
    departmentType?: string;
  }) => {
    setIsLoading(true);
    try {
      const res = await authApi.register(data);
      if (res.success && res.data?.user) {
        setUser(res.data.user);
      } else {
        throw new Error(res.error?.message || 'Registration failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loginController = async (email: string, controllerId: string, pass: string): Promise<User> => {
    setIsLoading(true);
    try {
      const res = await authApi.loginController(email, controllerId, pass);
      if (res.success && res.data?.user) {
        setUser(res.data.user);
        return res.data.user;
      } else {
        throw new Error(res.error?.message || 'Controller login failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const registerController = async (data: {
    name: string;
    email: string;
    controllerId: string;
    password: string;
    confirmPassword?: string;
  }) => {
    setIsLoading(true);
    try {
      const res = await authApi.registerController(data);
      if (res.success && res.data?.user) {
        setUser(res.data.user);
      } else {
        throw new Error(res.error?.message || 'Controller registration failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Immediately propagates updated name/email to all components consuming AuthContext.
   * Call this after a successful PATCH /auth/me response.
   */
  const updateUser = useCallback((updatedUser: Partial<Pick<User, 'name' | 'email'>>) => {
    setUser((prev) => (prev ? { ...prev, ...updatedUser } : prev));
  }, []);

  const updateProfile = async (payload: ProfileUpdatePayload): Promise<User> => {
    const res = await authApi.updateProfile(payload);
    if (res.success && res.data) {
      updateUser({ name: res.data.name, email: res.data.email });
      return res.data;
    }
    throw new Error((res as any).error?.message || 'Profile update failed.');
  };

  const changePassword = async (payload: PasswordChangePayload): Promise<void> => {
    const res = await authApi.changePassword(payload);
    if (!res.success) {
      throw new Error((res as any).error?.message || 'Password change failed.');
    }
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
      setAccessToken(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        loginController,
        register,
        registerController,
        updateUser,
        updateProfile,
        changePassword,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
