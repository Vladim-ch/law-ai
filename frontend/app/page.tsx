'use client';

import { ChatWindow } from '@/components/chat/ChatWindow';
import { TemplatesPage } from '@/components/templates/TemplatesPage';
import { LawsPage } from '@/components/laws/LawsPage';
import { useAppStore } from '@/stores/app';

/**
 * Главная страница — переключение между чатом, шаблонами и базой НПА.
 * Защита авторизацией реализована через AuthProvider в layout.
 */
export default function HomePage() {
  const activeSection = useAppStore((s) => s.activeSection);

  if (activeSection === 'templates') {
    return <TemplatesPage />;
  }

  if (activeSection === 'laws') {
    return <LawsPage />;
  }

  return <ChatWindow />;
}
