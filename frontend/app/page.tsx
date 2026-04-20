'use client';

import { ChatWindow } from '@/components/chat/ChatWindow';
import { TemplatesPage } from '@/components/templates/TemplatesPage';
import { useAppStore } from '@/stores/app';

/**
 * Главная страница — переключение между чатом и шаблонами.
 * Защита авторизацией реализована через AuthProvider в layout.
 */
export default function HomePage() {
  const activeSection = useAppStore((s) => s.activeSection);

  if (activeSection === 'templates') {
    return <TemplatesPage />;
  }

  return <ChatWindow />;
}
