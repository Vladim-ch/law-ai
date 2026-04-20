/**
 * Скрипт импорта нормативных актов из каталога data/laws/.
 *
 * Запуск: npm run import:laws
 *
 * Алгоритм:
 * 1. Читает manifest.json из data/laws/
 * 2. Для каждой записи: загружает .txt файл, импортирует в БД, индексирует
 * 3. Логирует прогресс в stdout
 *
 * Если manifest.json не найден — выводит инструкцию.
 */

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

import { PrismaClient } from '@prisma/client';

import { importLawFromFile, indexLaw } from '../services/law.js';

// ---------------------------------------------------------------------------
// Типы
// ---------------------------------------------------------------------------

/** Запись из manifest.json */
interface ManifestEntry {
  filename: string;
  name: string;
  fullName: string;
  category: string;
}

// ---------------------------------------------------------------------------
// Пути
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Каталог с файлами законов */
const LAWS_DIR = join(__dirname, '..', '..', 'data', 'laws');
const MANIFEST_PATH = join(LAWS_DIR, 'manifest.json');

// ---------------------------------------------------------------------------
// Основная логика
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== Импорт нормативных актов ===\n');

  // Проверяем наличие manifest.json
  if (!existsSync(MANIFEST_PATH)) {
    console.error(
      'Файл manifest.json не найден.\n\n' +
      'Создайте data/laws/manifest.json со списком файлов для импорта.\n' +
      'Формат:\n' +
      '[\n' +
      '  {\n' +
      '    "filename": "gk-rf.txt",\n' +
      '    "name": "ГК РФ",\n' +
      '    "fullName": "Гражданский кодекс Российской Федерации",\n' +
      '    "category": "codex"\n' +
      '  }\n' +
      ']\n',
    );
    process.exit(1);
  }

  // Читаем манифест
  const manifestRaw = await readFile(MANIFEST_PATH, 'utf-8');
  const manifest: ManifestEntry[] = JSON.parse(manifestRaw);

  if (manifest.length === 0) {
    console.log('Манифест пуст — нечего импортировать.');
    return;
  }

  console.log(`Найдено записей в манифесте: ${manifest.length}\n`);

  const prisma = new PrismaClient();

  try {
    let imported = 0;
    let totalChunks = 0;

    for (const entry of manifest) {
      const filePath = join(LAWS_DIR, entry.filename);

      // Проверяем наличие файла
      if (!existsSync(filePath)) {
        console.warn(`  [ПРОПУСК] Файл не найден: ${entry.filename}`);
        continue;
      }

      console.log(`  Импорт: ${entry.name} (${entry.filename})`);

      // Импортируем запись в БД
      const law = await importLawFromFile(prisma, filePath, {
        name: entry.name,
        fullName: entry.fullName,
        category: entry.category,
      });

      console.log(`    -> Запись создана: ${law.id}`);

      // Индексируем для RAG-поиска
      const chunksCount = await indexLaw(prisma, law.id);

      console.log(`    -> Проиндексировано чанков: ${chunksCount}`);

      imported++;
      totalChunks += chunksCount;
    }

    console.log(`\n=== Готово ===`);
    console.log(`Импортировано: ${imported} из ${manifest.length}`);
    console.log(`Всего чанков: ${totalChunks}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Ошибка импорта:', error);
  process.exit(1);
});
