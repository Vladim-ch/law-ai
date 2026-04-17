'use client';

import { ChatWindow } from '@/components/chat/ChatWindow';

/**
 * Главная страница — чат-интерфейс.
 * Защита авторизацией реализована через AuthProvider в layout.
 */
export default function HomePage() {
  return <ChatWindow />;
}
