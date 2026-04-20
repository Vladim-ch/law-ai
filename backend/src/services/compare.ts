/**
 * Сервис семантического сравнения документов.
 *
 * Алгоритм:
 * 1. Разбивает оба документа на абзацы (по двойному переводу строки)
 * 2. Попарно вычисляет trigram similarity (аналог pg_trgm, но в JS)
 * 3. Жадно сопоставляет абзацы по убыванию similarity
 * 4. Классифицирует пары: matched (≥0.85), modified (0.5–0.85), added/removed
 * 5. Для modified-пар строит inline diff через LCS слов
 *
 * Экспортирует:
 *   - compareDocuments() — структурный diff двух документов
 *   - analyzeComparison() — LLM-анализ отличий (SSE-стриминг)
 */

import type { PrismaClient } from '@prisma/client';
import type OpenAI from 'openai';

import { getDocument } from './document.js';
import { getSystemMessage } from '../lib/system-prompt.js';
import { streamChat } from '../lib/llm.js';

// ---------------------------------------------------------------------------
// Типы
// ---------------------------------------------------------------------------

/** Элемент пословного diff */
export interface InlineDiff {
  type: 'equal' | 'added' | 'removed';
  text: string;
}

/** Совпавший абзац (similarity ≥ 0.85) */
export interface MatchedParagraph {
  indexA: number;
  indexB: number;
  text: string;
  /** true, если абзац переместился (позиция изменилась) */
  moved: boolean;
}

/** Изменённый абзац (0.5 ≤ similarity < 0.85) */
export interface ModifiedParagraph {
  indexA: number;
  indexB: number;
  textA: string;
  textB: string;
  similarity: number;
  /** Пословный diff (пуст для длинных абзацев >500 слов) */
  inlineDiff: InlineDiff[];
}

/** Статистика сравнения */
export interface CompareStats {
  total: number;
  matched: number;
  modified: number;
  added: number;
  removed: number;
}

/** Полный результат сравнения двух документов */
export interface CompareResult {
  matched: MatchedParagraph[];
  modified: ModifiedParagraph[];
  addedInB: string[];
  removedFromA: string[];
  /** Количество абзацев, сменивших позицию */
  movedCount: number;
  stats: CompareStats;
}

// ---------------------------------------------------------------------------
// Пороги similarity
// ---------------------------------------------------------------------------

/** Порог для классификации «совпадает» (текст практически идентичен) */
const MATCH_THRESHOLD = 0.85;

/** Порог для классификации «изменён» (тот же смысл, другой текст) */
const MODIFIED_THRESHOLD = 0.5;

/** Порог длины (в словах) для отключения inline diff */
const INLINE_DIFF_MAX_WORDS = 500;

// ---------------------------------------------------------------------------
// Trigram similarity (JS-реализация аналога pg_trgm)
// ---------------------------------------------------------------------------

/**
 * Генерирует множество триграмм из строки.
 * Добавляет пробелы по краям (как pg_trgm) для корректного покрытия.
 */
function trigrams(str: string): Set<string> {
  const s = `  ${str.toLowerCase().trim()}  `;
  const result = new Set<string>();
  for (let i = 0; i < s.length - 2; i++) {
    result.add(s.slice(i, i + 3));
  }
  return result;
}

/**
 * Вычисляет коэффициент Жаккара для триграмм двух строк.
 * Возвращает число от 0 (полностью различны) до 1 (идентичны).
 */
export function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.trim() || !b.trim()) return 0;

  const triA = trigrams(a);
  const triB = trigrams(b);

  let intersection = 0;
  for (const tri of triA) {
    if (triB.has(tri)) intersection++;
  }

  const union = triA.size + triB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ---------------------------------------------------------------------------
// Разбивка текста на абзацы
// ---------------------------------------------------------------------------

/**
 * Разбивает текст по двойному переводу строки.
 * Фильтрует пустые абзацы, каждый — trim.
 */
export function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

// ---------------------------------------------------------------------------
// LCS (Longest Common Subsequence) для массива слов
// ---------------------------------------------------------------------------

/**
 * Находит LCS двух массивов строк (слов).
 * Возвращает множество индексов из A и B, входящих в LCS.
 *
 * Используется стандартный DP-алгоритм O(n*m).
 */
function lcsIndices(
  wordsA: string[],
  wordsB: string[],
): { indicesA: Set<number>; indicesB: Set<number> } {
  const n = wordsA.length;
  const m = wordsB.length;

  // DP-таблица (оптимизация: храним только две строки)
  // Но для восстановления пути нужна полная таблица
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (wordsA[i - 1] === wordsB[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
      }
    }
  }

  // Восстановление пути
  const indicesA = new Set<number>();
  const indicesB = new Set<number>();
  let i = n;
  let j = m;

  while (i > 0 && j > 0) {
    if (wordsA[i - 1] === wordsB[j - 1]) {
      indicesA.add(i - 1);
      indicesB.add(j - 1);
      i--;
      j--;
    } else if (dp[i - 1]![j]! >= dp[i]![j - 1]!) {
      i--;
    } else {
      j--;
    }
  }

  return { indicesA, indicesB };
}

// ---------------------------------------------------------------------------
// Inline diff (пословный)
// ---------------------------------------------------------------------------

/**
 * Строит пословный diff между двумя текстами через LCS.
 *
 * Для длинных текстов (>500 слов в любом из них) возвращает
 * упрощённый diff на уровне абзацев (removed + added).
 */
export function computeInlineDiff(textA: string, textB: string): InlineDiff[] {
  const wordsA = textA.split(/\s+/).filter(Boolean);
  const wordsB = textB.split(/\s+/).filter(Boolean);

  // Для длинных текстов — упрощённый diff
  if (wordsA.length > INLINE_DIFF_MAX_WORDS || wordsB.length > INLINE_DIFF_MAX_WORDS) {
    const result: InlineDiff[] = [];
    if (textA.trim()) result.push({ type: 'removed', text: textA });
    if (textB.trim()) result.push({ type: 'added', text: textB });
    return result;
  }

  const { indicesA, indicesB } = lcsIndices(wordsA, wordsB);

  // Строим результат, проходя обе последовательности
  const result: InlineDiff[] = [];
  let iA = 0;
  let iB = 0;

  // Сортируем индексы LCS для последовательного прохода
  const sortedA = [...indicesA].sort((a, b) => a - b);
  const sortedB = [...indicesB].sort((a, b) => a - b);
  let lcsIdx = 0;

  while (iA < wordsA.length || iB < wordsB.length) {
    const nextLcsA = lcsIdx < sortedA.length ? sortedA[lcsIdx]! : wordsA.length;
    const nextLcsB = lcsIdx < sortedB.length ? sortedB[lcsIdx]! : wordsB.length;

    // Собираем удалённые слова (до следующего LCS-элемента в A)
    const removedWords: string[] = [];
    while (iA < nextLcsA) {
      removedWords.push(wordsA[iA]!);
      iA++;
    }
    if (removedWords.length > 0) {
      result.push({ type: 'removed', text: removedWords.join(' ') });
    }

    // Собираем добавленные слова (до следующего LCS-элемента в B)
    const addedWords: string[] = [];
    while (iB < nextLcsB) {
      addedWords.push(wordsB[iB]!);
      iB++;
    }
    if (addedWords.length > 0) {
      result.push({ type: 'added', text: addedWords.join(' ') });
    }

    // Совпавшее слово (LCS-элемент)
    if (lcsIdx < sortedA.length) {
      result.push({ type: 'equal', text: wordsA[nextLcsA]! });
      iA++;
      iB++;
      lcsIdx++;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Сопоставление абзацев (greedy matching)
// ---------------------------------------------------------------------------

/**
 * Жадное сопоставление абзацев документов A и B.
 *
 * Алгоритм:
 * 1. Для каждой пары (i, j) считаем similarity
 * 2. Сортируем все пары по убыванию similarity
 * 3. Последовательно выбираем лучшую пару, если оба абзаца ещё свободны
 * 4. Классифицируем: matched (≥0.85), modified (0.5–0.85)
 * 5. Оставшиеся — removed/added
 */
export function matchParagraphs(
  paragraphsA: string[],
  paragraphsB: string[],
): CompareResult {
  const n = paragraphsA.length;
  const m = paragraphsB.length;

  // Шаг 1: вычисляем similarity для всех пар
  interface SimilarityPair {
    indexA: number;
    indexB: number;
    sim: number;
  }

  const pairs: SimilarityPair[] = [];

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      const sim = calculateSimilarity(paragraphsA[i]!, paragraphsB[j]!);
      if (sim >= MODIFIED_THRESHOLD) {
        pairs.push({ indexA: i, indexB: j, sim });
      }
    }
  }

  // Шаг 2: сортируем по убыванию similarity
  pairs.sort((a, b) => b.sim - a.sim);

  // Шаг 3: жадное сопоставление
  const usedA = new Set<number>();
  const usedB = new Set<number>();
  const matched: MatchedParagraph[] = [];
  const modified: ModifiedParagraph[] = [];

  for (const pair of pairs) {
    if (usedA.has(pair.indexA) || usedB.has(pair.indexB)) continue;

    usedA.add(pair.indexA);
    usedB.add(pair.indexB);

    if (pair.sim >= MATCH_THRESHOLD) {
      matched.push({
        indexA: pair.indexA,
        indexB: pair.indexB,
        text: paragraphsA[pair.indexA]!,
        moved: pair.indexA !== pair.indexB,
      });
    } else {
      modified.push({
        indexA: pair.indexA,
        indexB: pair.indexB,
        textA: paragraphsA[pair.indexA]!,
        textB: paragraphsB[pair.indexB]!,
        similarity: pair.sim,
        inlineDiff: computeInlineDiff(
          paragraphsA[pair.indexA]!,
          paragraphsB[pair.indexB]!,
        ),
      });
    }
  }

  // Шаг 4: оставшиеся
  const removedFromA: string[] = [];
  for (let i = 0; i < n; i++) {
    if (!usedA.has(i)) removedFromA.push(paragraphsA[i]!);
  }

  const addedInB: string[] = [];
  for (let j = 0; j < m; j++) {
    if (!usedB.has(j)) addedInB.push(paragraphsB[j]!);
  }

  // Количество перемещённых абзацев
  const movedCount = matched.filter((p) => p.moved).length;

  return {
    matched,
    modified,
    addedInB,
    removedFromA,
    movedCount,
    stats: {
      total: n + m,
      matched: matched.length,
      modified: modified.length,
      added: addedInB.length,
      removed: removedFromA.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Сравнение двух документов (основная функция)
// ---------------------------------------------------------------------------

/**
 * Загружает два документа, проверяет принадлежность пользователю,
 * разбивает на абзацы и возвращает структурный diff.
 *
 * @throws Error — если документ не найден или текст не извлечён
 */
export async function compareDocuments(
  prisma: PrismaClient,
  documentIdA: string,
  documentIdB: string,
  userId: string,
): Promise<CompareResult> {
  // Загружаем оба документа параллельно
  const [docA, docB] = await Promise.all([
    getDocument(prisma, documentIdA, userId),
    getDocument(prisma, documentIdB, userId),
  ]);

  if (!docA) {
    const err = new Error('Документ A не найден') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  if (!docB) {
    const err = new Error('Документ B не найден') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  if (!docA.contentText) {
    const err = new Error('Текст документа A не извлечён') as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }

  if (!docB.contentText) {
    const err = new Error('Текст документа B не извлечён') as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }

  const paragraphsA = splitIntoParagraphs(docA.contentText);
  const paragraphsB = splitIntoParagraphs(docB.contentText);

  return matchParagraphs(paragraphsA, paragraphsB);
}

// ---------------------------------------------------------------------------
// LLM-анализ сравнения (SSE-стриминг)
// ---------------------------------------------------------------------------

/** Максимальная длина фрагмента текста в промпте для LLM */
const SNIPPET_MAX_LENGTH = 100;

/**
 * Сравнивает два документа и стримит LLM-анализ отличий.
 *
 * Формирует промпт с перечнем изменений (modified, added, removed)
 * и передаёт его в streamChat для посимвольной генерации.
 *
 * @returns async-генератор строковых токенов ответа LLM
 */
export async function* analyzeComparison(
  prisma: PrismaClient,
  documentIdA: string,
  documentIdB: string,
  userId: string,
  prompt?: string,
): AsyncGenerator<string> {
  // Загружаем документы
  const [docA, docB] = await Promise.all([
    getDocument(prisma, documentIdA, userId),
    getDocument(prisma, documentIdB, userId),
  ]);

  if (!docA) {
    const err = new Error('Документ A не найден') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  if (!docB) {
    const err = new Error('Документ B не найден') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  if (!docA.contentText || !docB.contentText) {
    const err = new Error('Текст одного из документов не извлечён') as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }

  // Сравниваем
  const paragraphsA = splitIntoParagraphs(docA.contentText);
  const paragraphsB = splitIntoParagraphs(docB.contentText);
  const result = matchParagraphs(paragraphsA, paragraphsB);

  // Формируем промпт для LLM
  const modifiedSection = result.modified
    .map(
      (m) =>
        `"${m.textA.slice(0, SNIPPET_MAX_LENGTH)}" → "${m.textB.slice(0, SNIPPET_MAX_LENGTH)}"`,
    )
    .join('\n');

  const addedSection = result.addedInB
    .map((t) => t.slice(0, SNIPPET_MAX_LENGTH))
    .join('\n');

  const removedSection = result.removedFromA
    .map((t) => t.slice(0, SNIPPET_MAX_LENGTH))
    .join('\n');

  const userPrompt = `Сравни две версии юридического документа и проанализируй изменения.

Документ A: ${docA.filename}
Документ B: ${docB.filename}

Статистика:
- Совпавших абзацев: ${result.stats.matched}
- Изменённых абзацев: ${result.stats.modified}
- Добавлено в B: ${result.stats.added}
- Удалено из A: ${result.stats.removed}
- Перемещённых абзацев: ${result.movedCount}

Изменённые разделы:
${modifiedSection || '(нет)'}

Добавлено в B:
${addedSection || '(нет)'}

Удалено из A:
${removedSection || '(нет)'}

${prompt || 'Какие изменения юридически значимы? Есть ли новые риски? Изменились ли ключевые условия?'}`;

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    getSystemMessage(),
    { role: 'user', content: userPrompt },
  ];

  yield* streamChat(messages);
}
