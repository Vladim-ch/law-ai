/**
 * Fastify-плагин для MinIO (S3-совместимое хранилище).
 *
 * MinIO-клиент — stateless HTTP-клиент, не держит постоянное соединение,
 * поэтому хук onClose не нужен.
 */

import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import * as Minio from 'minio';

import { env } from '../config/env.js';

/** Расширяем типы FastifyInstance для доступа к `app.minio`. */
declare module 'fastify' {
  interface FastifyInstance {
    minio: Minio.Client;
  }
}

const minioPlugin: FastifyPluginAsync = async (app) => {
  const minioClient = new Minio.Client({
    endPoint: env.MINIO_ENDPOINT,
    port: env.MINIO_PORT,
    useSSL: env.MINIO_USE_SSL,
    accessKey: env.MINIO_ROOT_USER,
    secretKey: env.MINIO_ROOT_PASSWORD,
  });

  // Проверяем доступность MinIO при старте — запрашиваем наличие бакета.
  const bucketExists = await minioClient.bucketExists(env.MINIO_BUCKET_DOCUMENTS);
  if (!bucketExists) {
    app.log.warn(
      `MinIO: бакет "${env.MINIO_BUCKET_DOCUMENTS}" не найден — будет создан автоматически`,
    );
    await minioClient.makeBucket(env.MINIO_BUCKET_DOCUMENTS);
  }

  app.log.info('MinIO: клиент инициализирован, бакет доступен');
  app.decorate('minio', minioClient);
};

export default fp(minioPlugin, {
  name: 'minio',
});
