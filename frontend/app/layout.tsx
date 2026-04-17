import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

import { LayoutShell } from '@/components/layout/LayoutShell';

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
 * Оборачивает контент в AuthProvider и условно показывает Sidebar.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`dark ${inter.variable}`}>
      <body className="font-sans">
        <LayoutShell>{children}</LayoutShell>
      </body>
    </html>
  );
}
