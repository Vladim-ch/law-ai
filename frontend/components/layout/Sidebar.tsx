'use client';

import {
  Scale,
  MessageSquare,
  FileText,
  ListTodo,
  BookOpen,
  Plus,
  User,
} from 'lucide-react';

import { Button } from '@/components/ui/Button';

/** Элемент навигации боковой панели */
interface NavItem {
  label: string;
  icon: React.ReactNode;
}

/** Пункты навигации (роутинг будет добавлен позже) */
const navItems: NavItem[] = [
  { label: 'Диалоги', icon: <MessageSquare className="h-4 w-4" /> },
  { label: 'Шаблоны', icon: <FileText className="h-4 w-4" /> },
  { label: 'Задачи', icon: <ListTodo className="h-4 w-4" /> },
  { label: 'База знаний', icon: <BookOpen className="h-4 w-4" /> },
];

/**
 * Боковая панель навигации.
 * Фиксированная ширина 240px, полная высота экрана.
 */
export function Sidebar() {
  return (
    <aside className="flex w-sidebar flex-col border-r border-surface-elevated bg-surface-secondary">
      {/* Логотип */}
      <div className="flex items-center gap-2 px-4 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
          <Scale className="h-4 w-4 text-white" />
        </div>
        <span className="text-lg font-semibold text-gray-100">Lawer</span>
      </div>

      {/* Кнопка «Новый диалог» */}
      <div className="px-3 pb-2">
        <Button variant="primary" size="md" className="w-full justify-center gap-2">
          <Plus className="h-4 w-4" />
          Новый диалог
        </Button>
      </div>

      {/* Навигация */}
      <nav className="flex-1 space-y-0.5 px-3 py-2">
        {navItems.map((item) => (
          <button
            key={item.label}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-400 hover:bg-surface-tertiary hover:text-gray-200"
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>

      {/* Пользователь (заглушка) */}
      <div className="border-t border-surface-elevated p-3">
        <div className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-400">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-elevated">
            <User className="h-3.5 w-3.5" />
          </div>
          <span>Юрист</span>
        </div>
      </div>
    </aside>
  );
}
