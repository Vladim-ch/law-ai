'use client';

import { ArrowLeft } from 'lucide-react';

import type { CompareResult as CompareResultType, InlineDiff } from '@/lib/types';

interface CompareResultProps {
  result: CompareResultType;
  filenameA: string;
  filenameB: string;
  onReset: () => void;
}

/**
 * Элемент side-by-side — одна строка сравнения.
 */
interface DiffRow {
  type: 'matched' | 'modified' | 'added' | 'removed';
  textA?: string;
  textB?: string;
  moved?: boolean;
  similarity?: number;
  inlineDiffA?: InlineDiff[];
  inlineDiffB?: InlineDiff[];
  sortKey: number;
}

/**
 * Собирает все блоки diff в единый список для side-by-side.
 */
function buildDiffRows(result: CompareResultType): DiffRow[] {
  const rows: DiffRow[] = [];

  for (const p of result.matched) {
    rows.push({
      type: 'matched',
      textA: p.text,
      textB: p.text,
      moved: p.moved,
      sortKey: Math.min(p.indexA, p.indexB),
    });
  }

  for (const p of result.modified) {
    const diffA = p.inlineDiff.filter((d) => d.type !== 'added');
    const diffB = p.inlineDiff.filter((d) => d.type !== 'removed');
    rows.push({
      type: 'modified',
      textA: p.textA,
      textB: p.textB,
      similarity: p.similarity,
      inlineDiffA: diffA,
      inlineDiffB: diffB,
      sortKey: Math.min(p.indexA, p.indexB),
    });
  }

  result.removedFromA.forEach((text, i) => {
    rows.push({ type: 'removed', textA: text, sortKey: 1000 + i });
  });

  result.addedInB.forEach((text, i) => {
    rows.push({ type: 'added', textB: text, sortKey: 2000 + i });
  });

  rows.sort((a, b) => a.sortKey - b.sortKey);
  return rows;
}

/** Рендер inline diff с подсветкой */
function InlineHighlight({ parts }: { parts: InlineDiff[] }) {
  return (
    <p className="text-sm leading-[1.8]">
      {parts.map((part, i) => {
        if (part.type === 'removed') {
          return (
            <span key={i} className="rounded-sm bg-red-200 px-0.5 text-red-800">
              {part.text}
            </span>
          );
        }
        if (part.type === 'added') {
          return (
            <span key={i} className="rounded-sm bg-green-200 px-0.5 text-green-800">
              {part.text}
            </span>
          );
        }
        return (
          <span key={i} className="text-gray-800">
            {part.text}
          </span>
        );
      })}
    </p>
  );
}

/**
 * Side-by-side результат сравнения в стиле двух листов Word.
 * Белый фон, serif-шрифт, тени — ассоциация с бумажным документом.
 */
export function CompareResult({
  result,
  filenameA,
  filenameB,
  onReset,
}: CompareResultProps) {
  const { stats, movedCount } = result;
  const rows = buildDiffRows(result);

  return (
    <div className="flex flex-1 flex-col overflow-hidden p-4">
      {/* Шапка */}
      <div className="mb-4 space-y-3">
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1.5 text-sm text-gray-400 transition-colors hover:text-gray-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Новое сравнение
        </button>

        {/* Статистика */}
        <div className="flex flex-wrap items-center gap-2">
          {stats.matched > 0 && (
            <span className="rounded-full bg-gray-500/10 px-3 py-1 text-xs text-gray-400">
              ✅ {stats.matched} совпадений
            </span>
          )}
          {stats.modified > 0 && (
            <span className="rounded-full bg-yellow-500/10 px-3 py-1 text-xs text-yellow-400">
              ✏️ {stats.modified} изменений
            </span>
          )}
          {stats.added > 0 && (
            <span className="rounded-full bg-green-500/10 px-3 py-1 text-xs text-green-400">
              🆕 {stats.added} добавлений
            </span>
          )}
          {stats.removed > 0 && (
            <span className="rounded-full bg-red-500/10 px-3 py-1 text-xs text-red-400">
              🗑️ {stats.removed} удалений
            </span>
          )}
          {movedCount > 0 && (
            <span className="rounded-full bg-blue-500/10 px-3 py-1 text-xs text-blue-400">
              ↕ {movedCount} перемещений
            </span>
          )}
        </div>
      </div>

      {/* Два «листа бумаги» side-by-side */}
      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Лист A */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Заголовок файла — вне листа */}
          <div className="mb-2 truncate text-center text-xs font-medium text-gray-400">
            {filenameA}
          </div>
          {/* Лист */}
          <div
            className="flex-1 overflow-y-auto rounded bg-white shadow-lg"
            style={{
              fontFamily: "'Times New Roman', 'PT Serif', Georgia, serif",
              boxShadow: '0 2px 20px rgba(0,0,0,0.3), 0 0 1px rgba(0,0,0,0.2)',
            }}
          >
            <div className="px-10 py-8">
              {rows.map((row, i) => (
                <div
                  key={i}
                  className={`mb-1 rounded-sm px-1 py-0.5 ${
                    row.type === 'removed'
                      ? 'bg-red-100'
                      : row.type === 'modified'
                        ? 'bg-yellow-50'
                        : row.type === 'added'
                          ? 'bg-gray-100'
                          : ''
                  }`}
                >
                  {row.type === 'matched' && (
                    <div>
                      <p className="text-sm leading-[1.8] text-gray-800">{row.textA}</p>
                      {row.moved && (
                        <span className="inline-block rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-600">
                          ↕ перемещён
                        </span>
                      )}
                    </div>
                  )}
                  {row.type === 'modified' && row.inlineDiffA && (
                    <InlineHighlight parts={row.inlineDiffA} />
                  )}
                  {row.type === 'removed' && (
                    <p className="text-sm leading-[1.8] text-red-700 line-through">
                      {row.textA}
                    </p>
                  )}
                  {row.type === 'added' && (
                    <p className="text-center text-[10px] italic text-gray-400">—</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Лист B */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Заголовок файла */}
          <div className="mb-2 truncate text-center text-xs font-medium text-gray-400">
            {filenameB}
          </div>
          {/* Лист */}
          <div
            className="flex-1 overflow-y-auto rounded bg-white shadow-lg"
            style={{
              fontFamily: "'Times New Roman', 'PT Serif', Georgia, serif",
              boxShadow: '0 2px 20px rgba(0,0,0,0.3), 0 0 1px rgba(0,0,0,0.2)',
            }}
          >
            <div className="px-10 py-8">
              {rows.map((row, i) => (
                <div
                  key={i}
                  className={`mb-1 rounded-sm px-1 py-0.5 ${
                    row.type === 'added'
                      ? 'bg-green-100'
                      : row.type === 'modified'
                        ? 'bg-yellow-50'
                        : row.type === 'removed'
                          ? 'bg-gray-100'
                          : ''
                  }`}
                >
                  {row.type === 'matched' && (
                    <p className="text-sm leading-[1.8] text-gray-800">{row.textB}</p>
                  )}
                  {row.type === 'modified' && row.inlineDiffB && (
                    <InlineHighlight parts={row.inlineDiffB} />
                  )}
                  {row.type === 'added' && (
                    <p className="text-sm leading-[1.8] text-green-800">{row.textB}</p>
                  )}
                  {row.type === 'removed' && (
                    <p className="text-center text-[10px] italic text-gray-400">—</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
