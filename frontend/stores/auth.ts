'use client';

import { create } from 'zustand';

import { auth as authApi } from '@/lib/api';
import type { User } from '@/lib/types';

/** Состояние авторизации */
interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  /** Вход по email и паролю */
  login: (email: string, password: string) => Promise<void>;

  /** Регистрация нового пользователя */
  register: (email: string, name: string, password: string) => Promise<void>;

  /** Выход из системы */
  logout: () => void;

  /** Проверить авторизацию по токену из localStorage */
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: typeof window !== 'undefined' ? localStorage.getItem('token') : null,
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (email, password) => {
    const { token, user } = await authApi.login(email, password);
    localStorage.setItem('token', token);
    set({ token, user, isAuthenticated: true });
  },

  register: async (email, name, password) => {
    const { token, user } = await authApi.register(email, name, password);
    localStorage.setItem('token', token);
    set({ token, user, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('token');
    set({ token: null, user: null, isAuthenticated: false });
  },

  checkAuth: async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      set({ isLoading: false, isAuthenticated: false });
      return;
    }

    try {
      const { user } = await authApi.me();
      set({ token, user, isAuthenticated: true, isLoading: false });
    } catch {
      localStorage.removeItem('token');
      set({ token: null, user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));
