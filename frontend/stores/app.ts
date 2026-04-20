import { create } from 'zustand';

/** Секции приложения */
type ActiveSection = 'chat' | 'templates';

/** Глобальное состояние приложения */
interface AppState {
  /** Видимость боковой панели (для адаптивности на планшетах) */
  sidebarOpen: boolean;

  /** Текущая активная секция */
  activeSection: ActiveSection;

  /** Переключить видимость боковой панели */
  toggleSidebar: () => void;

  /** Установить видимость боковой панели явно */
  setSidebarOpen: (open: boolean) => void;

  /** Переключить активную секцию */
  setActiveSection: (section: ActiveSection) => void;
}

/**
 * Zustand-store для глобального состояния UI.
 * Управляет боковой панелью и навигацией между секциями.
 */
export const useAppStore = create<AppState>((set) => ({
  sidebarOpen: true,
  activeSection: 'chat',

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  setActiveSection: (section) => set({ activeSection: section }),
}));
