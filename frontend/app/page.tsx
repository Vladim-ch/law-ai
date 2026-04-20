'use client';

import { ChatWindow } from '@/components/chat/ChatWindow';
import { TemplatesPage } from '@/components/templates/TemplatesPage';
import { LawsPage } from '@/components/laws/LawsPage';
import { ComparePage } from '@/components/compare/ComparePage';
import { useAppStore } from '@/stores/app';

/**
 * Главная страница — переключение между чатом, шаблонами, базой НПА и сравнением.
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

  if (activeSection === 'compare') {
    return <ComparePage />;
  }

  return <ChatWindow />;
}
