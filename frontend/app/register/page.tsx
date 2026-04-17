'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Scale } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/stores/auth';

/**
 * Страница регистрации.
 * Форма: email, ФИО, пароль, подтверждение пароля.
 */
export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register } = useAuthStore();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }

    if (password.length < 6) {
      setError('Пароль должен содержать минимум 6 символов');
      return;
    }

    setIsSubmitting(true);

    try {
      await register(email, name, password);
      // Редирект произойдёт через AuthProvider
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Не удалось зарегистрироваться. Попробуйте ещё раз.',
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
          <h1 className="text-2xl font-semibold text-gray-100">Регистрация</h1>
          <p className="mt-1 text-sm text-gray-500">Создайте аккаунт в Lawer</p>
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
            <label htmlFor="name" className="mb-1.5 block text-sm text-gray-400">
              ФИО
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-surface-elevated bg-surface-tertiary px-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 outline-none transition-colors focus:border-brand-500"
              placeholder="Иванов Иван Иванович"
              autoComplete="name"
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
              placeholder="Минимум 6 символов"
              autoComplete="new-password"
            />
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="mb-1.5 block text-sm text-gray-400"
            >
              Подтверждение пароля
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg border border-surface-elevated bg-surface-tertiary px-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 outline-none transition-colors focus:border-brand-500"
              placeholder="Повторите пароль"
              autoComplete="new-password"
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full justify-center"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Регистрация...' : 'Зарегистрироваться'}
          </Button>
        </form>

        {/* Ссылка на вход */}
        <p className="mt-6 text-center text-sm text-gray-500">
          Уже есть аккаунт?{' '}
          <Link href="/login" className="text-brand-400 hover:text-brand-300">
            Войти
          </Link>
        </p>
      </div>
    </div>
  );
}
