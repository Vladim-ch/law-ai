'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Scale } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/stores/auth';

/**
 * Страница входа в систему.
 * Форма email + пароль, ссылка на регистрацию.
 */
export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login } = useAuthStore();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await login(email, password);
      // Редирект произойдёт через AuthProvider
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Не удалось войти. Проверьте email и пароль.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-4">
      <div className="w-full max-w-sm">
        {/* Логотип */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600/20">
            <Scale className="h-7 w-7 text-brand-400" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-100">Вход в Lawer</h1>
          <p className="mt-1 text-sm text-gray-500">AI-ассистент юридического отдела</p>
        </div>

        {/* Форма */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm text-gray-400">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-surface-elevated bg-surface-tertiary px-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 outline-none transition-colors focus:border-brand-500"
              placeholder="name@company.ru"
              autoComplete="email"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm text-gray-400">
              Пароль
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-surface-elevated bg-surface-tertiary px-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 outline-none transition-colors focus:border-brand-500"
              placeholder="Введите пароль"
              autoComplete="current-password"
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full justify-center"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Вход...' : 'Войти'}
          </Button>
        </form>

        {/* Ссылка на регистрацию */}
        <p className="mt-6 text-center text-sm text-gray-500">
          Нет аккаунта?{' '}
          <Link
            href="/register"
            className="text-brand-400 hover:text-brand-300"
          >
            Зарегистрироваться
          </Link>
        </p>
      </div>
    </div>
  );
}
