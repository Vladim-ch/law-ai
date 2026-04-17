import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

import { Sidebar } from '@/components/layout/Sidebar';

import './globals.css';

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Lawer — AI-ассистент юридического отдела',
  description:
    'Интеллектуальный помощник для юристов: анализ документов, генерация договоров, правовая аналитика.',
};

/**
 * Корневой layout приложения.
 * Структура: фиксированная боковая панель (240px) + основная область контента.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`dark ${inter.variable}`}>
      <body className="font-sans">
        <div className="flex h-screen overflow-hidden">
          {/* Боковая панель */}
          <Sidebar />

          {/* Основная область контента */}
          <main className="flex flex-1 flex-col overflow-y-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
