'use client';

import { usePathname } from 'next/navigation';

import { AuthProvider } from '@/components/providers/AuthProvider';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';

/** Маршруты, на которых не показываем TopBar и Sidebar */
const AUTH_ROUTES = ['/login', '/register'];

/**
 * Оболочка layout: AuthProvider + условные TopBar и Sidebar.
 * На страницах авторизации оболочка скрыта, контент занимает весь экран.
 */
export function LayoutShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <LayoutContent>{children}</LayoutContent>
    </AuthProvider>
  );
}

/**
 * Внутренний компонент — решает, что именно показывать.
 *
 * Правила:
 *  - На /login и /register рендерим только children (полный экран).
 *  - Если пользователь не авторизован — тоже только children
 *    (до редиректа AuthProvider'ом).
 *  - В остальных случаях сверху всегда TopBar, а Sidebar виден
 *    только в секции «Диалоги».
 */
function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated } = useAuthStore();
  const activeSection = useAppStore((s) => s.activeSection);
  const isAuthRoute = AUTH_ROUTES.includes(pathname);

  // На страницах авторизации — полноэкранный layout без оболочки
  if (isAuthRoute || !isAuthenticated) {
    return <>{children}</>;
  }

  // Sidebar нужен только в секции диалогов
  const showSidebar = activeSection === 'chat';

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        {showSidebar && <Sidebar />}
        <main className="flex flex-1 flex-col overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
