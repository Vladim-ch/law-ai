import { create } from 'zustand';

/** Глобальное состояние приложения */
interface AppState {
  /** Видимость боковой панели (для адаптивности на планшетах) */
  sidebarOpen: boolean;

  /** Переключить видимость боковой панели */
  toggleSidebar: () => void;

  /** Установить видимость боковой панели явно */
  setSidebarOpen: (open: boolean) => void;
}

/**
 * Zustand-store для глобального состояния UI.
 * Пока содержит только управление боковой панелью.
 */
export const useAppStore = create<AppState>((set) => ({
  sidebarOpen: true,

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));
