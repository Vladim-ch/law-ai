/**
 * Точка входа в backend.
 *
 * Задачи этого файла:
 *   1) загрузить и провалидировать переменные окружения (через импорт env.ts
 *      — это происходит как побочный эффект при первом require);
 *   2) собрать Fastify-инстанс через buildServer();
 *   3) начать слушать HTTP на BACKEND_HOST:BACKEND_PORT;
 *   4) корректно завершить работу по SIGTERM/SIGINT: перестать принимать
 *      новые соединения, дождаться завершения текущих, закрыть ресурсы.
 *
 * Загрузка .env: Node 20.6+ поддерживает `--env-file=../.env` — скрипты npm
 * в package.json используют именно его, поэтому в коде dotenv не нужен.
 */

import { env } from './config/env.js';
import { buildServer } from './server.js';

/**
 * Таймаут graceful shutdown. Если за это время соединения не закрылись —
 * форсированно завершаем процесс, чтобы не повиснуть в CI/оркестраторе.
 */
const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main(): Promise<void> {
  const app = await buildServer();

  try {
    const address = await app.listen({
      host: env.BACKEND_HOST,
      port: env.BACKEND_PORT,
    });

    app.log.info(
      {
        address,
        nodeEnv: env.NODE_ENV,
        pid: process.pid,
        tz: env.TZ,
      },
      'Lawer backend запущен',
    );
  } catch (err) {
    app.log.fatal({ err }, 'Не удалось запустить HTTP-сервер');
    // Не полагаемся на дефолт — явно кодом 1, чтобы оркестратор перезапустил
    // контейнер.
    process.exit(1);
  }

  // --- Graceful shutdown ---------------------------------------------------

  // Флаг защищает от повторного входа в shutdown, если сигнал прилетает дважды.
  let isShuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (isShuttingDown) {
      app.log.warn({ signal }, 'Повторный сигнал остановки — игнорируем');
      return;
    }
    isShuttingDown = true;

    app.log.info({ signal }, 'Получен сигнал остановки, закрываем сервер');

    // Жёсткий таймер: если app.close() зависнет — убьём процесс с кодом 1.
    const forceExit = setTimeout(() => {
      app.log.error(
        { timeoutMs: SHUTDOWN_TIMEOUT_MS },
        'Превышен таймаут graceful shutdown, форсированное завершение',
      );
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    // unref() — чтобы таймер сам по себе не удерживал event loop, если
    // app.close() завершится раньше.
    forceExit.unref();

    try {
      await app.close();
      clearTimeout(forceExit);
      app.log.info('Сервер корректно остановлен');
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'Ошибка при остановке сервера');
      process.exit(1);
    }
  };

  // SIGTERM приходит от docker stop / k8s, SIGINT — при Ctrl+C в терминале.
  process.on('SIGTERM', (signal) => {
    void shutdown(signal);
  });
  process.on('SIGINT', (signal) => {
    void shutdown(signal);
  });

  // Последняя линия обороны: необработанные исключения/промисы логируем
  // и роняем процесс. Продолжать работу в неизвестном состоянии опаснее,
  // чем рестарт контейнера.
  process.on('uncaughtException', (err) => {
    app.log.fatal({ err }, 'uncaughtException — процесс будет остановлен');
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    app.log.fatal({ reason }, 'unhandledRejection — процесс будет остановлен');
    process.exit(1);
  });
}

// Top-level await доступен (ESM + target es2022), но явный .catch понятнее
// для читателя и гарантирует ненулевой exit code при ошибке в main().
main().catch((err) => {
  // На этапе main() логгер ещё может быть не создан, поэтому console.error.
  // eslint-disable-next-line no-console
  console.error('Критическая ошибка при старте backend:', err);
  process.exit(1);
});
