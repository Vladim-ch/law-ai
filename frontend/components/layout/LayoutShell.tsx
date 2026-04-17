'use client';

import { usePathname } from 'next/navigation';

import { AuthProvider } from '@/components/providers/AuthProvider';
import { Sidebar } from '@/components/layout/Sidebar';
import { useAuthStore } from '@/stores/auth';

/** Маршруты, на которых не показываем Sidebar */
const AUTH_ROUTES = ['/login', '/register'];

/**
 * Оболочка layout: AuthProvider + условный Sidebar.
 * На страницах авторизации Sidebar скрыт, контент занимает весь экран.
 */
export function LayoutShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <LayoutContent>{children}</LayoutContent>
    </AuthProvider>
  );
}

/** Внутренний компонент — решает, показывать ли Sidebar */
function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated } = useAuthStore();
  const isAuthRoute = AUTH_ROUTES.includes(pathname);

  // На страницах авторизации — полноэкранный layout без Sidebar
  if (isAuthRoute || !isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-y-auto">{children}</main>
    </div>
  );
}
