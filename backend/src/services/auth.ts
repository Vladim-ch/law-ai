/**
 * Сервис аутентификации — бизнес-логика регистрации и входа.
 *
 * Изолирует работу с bcrypt и Prisma от HTTP-слоя (роутов),
 * что упрощает тестирование и переиспользование.
 */

import bcrypt from 'bcrypt';
import type { PrismaClient, User } from '@prisma/client';

/** Количество раундов соли bcrypt. 12 — баланс между безопасностью и скоростью. */
const BCRYPT_SALT_ROUNDS = 12;

/**
 * Хеширует пароль с помощью bcrypt.
 * Salt генерируется автоматически с указанным числом раундов.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

/**
 * Сравнивает открытый пароль с bcrypt-хешем.
 * Возвращает true при совпадении, false — в остальных случаях.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Данные для создания нового пользователя. */
export interface CreateUserData {
  email: string;
  name: string;
  password: string;
  role?: 'ADMIN' | 'LAWYER' | 'VIEWER';
}

/**
 * Создаёт пользователя с хешированным паролем.
 *
 * При дублировании email (Prisma unique constraint, код P2002)
 * выбрасывает ошибку с человекочитаемым сообщением.
 */
export async function createUser(prisma: PrismaClient, data: CreateUserData): Promise<User> {
  const passwordHash = await hashPassword(data.password);

  try {
    return await prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        passwordHash,
        ...(data.role ? { role: data.role } : {}),
      },
    });
  } catch (error: unknown) {
    // Prisma выбрасывает PrismaClientKnownRequestError с кодом P2002
    // при нарушении unique constraint.
    if (
      error instanceof Error &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      const err = new Error('Пользователь с таким email уже существует');
      (err as Error & { statusCode: number }).statusCode = 409;
      throw err;
    }
    throw error;
  }
}

/**
 * Аутентифицирует пользователя по email и паролю.
 *
 * Возвращает объект User при успешной проверке.
 * При неверных credentials (нет пользователя ИЛИ неверный пароль)
 * выбрасывает одинаковую ошибку — защита от user enumeration.
 */
export async function authenticateUser(
  prisma: PrismaClient,
  email: string,
  password: string,
): Promise<User> {
  const user = await prisma.user.findUnique({ where: { email } });

  // Единое сообщение для обоих случаев: пользователь не найден / неверный пароль.
  // Это security best practice — не даём атакующему понять, какой именно
  // параметр неверен (защита от user enumeration).
  if (!user) {
    const err = new Error('Неверный email или пароль');
    (err as Error & { statusCode: number }).statusCode = 401;
    throw err;
  }

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    const err = new Error('Неверный email или пароль');
    (err as Error & { statusCode: number }).statusCode = 401;
    throw err;
  }

  return user;
}
