'use client';

import {
  Scale,
  MessageSquare,
  FileText,
  BookOpen,
  ArrowLeftRight,
  LogOut,
  type LucideIcon,
} from 'lucide-react';

import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';

/** Описание одной вкладки навигации */
type NavItem = {
  id: 'chat' | 'templates' | 'laws' | 'compare';
  label: string;
  icon: LucideIcon;
};

/** Список вкладок в порядке отображения */
const NAV_ITEMS: NavItem[] = [
  { id: 'chat', label: 'Диалоги', icon: MessageSquare },
  { id: 'templates', label: 'Шаблоны', icon: FileText },
  { id: 'laws', label: 'НПА', icon: BookOpen },
  { id: 'compare', label: 'Сравнение', icon: ArrowLeftRight },
];

/**
 * Верхняя панель приложения.
 *
 * Структура слева-направо:
 *  - Логотип «Lawer» (бренд).
 *  - По центру — pill-tab навигация по четырём секциям.
 *  - Справа — профиль пользователя с кнопкой выхода.
 *
 * Высота фиксированная (~56px), сама панель не скроллится —
 * вся прокрутка происходит ниже, в основном контенте.
 */
export function TopBar() {
  const { user, logout } = useAuthStore();
  const { activeSection, setActiveSection } = useAppStore();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-surface-elevated bg-surface-secondary px-4">
      {/* Логотип — левая часть */}
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
          <Scale className="h-4 w-4 text-white" />
        </div>
        <span className="text-lg font-semibold text-gray-100">Lawer</span>
      </div>

      {/* Навигация — по центру */}
      <nav
        aria-label="Разделы приложения"
        className="flex items-center gap-1 rounded-xl bg-surface p-1"
      >
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const isActive = activeSection === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveSection(id)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-surface-elevated text-gray-100 shadow-sm'
                  : 'text-gray-500 hover:bg-surface-tertiary hover:text-gray-200'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      {/* Профиль пользователя — правая часть */}
      <div className="flex items-center gap-2">
        {user && (
          <>
            <div className="flex items-center gap-2 rounded-lg px-2 py-1.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600/20 text-xs font-medium text-brand-400">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <span className="hidden max-w-[160px] truncate text-sm text-gray-300 sm:inline">
                {user.name}
              </span>
            </div>
            <button
              type="button"
              onClick={logout}
              className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-surface-tertiary hover:text-gray-200"
              aria-label="Выйти"
              title="Выйти"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
    </header>
  );
}
