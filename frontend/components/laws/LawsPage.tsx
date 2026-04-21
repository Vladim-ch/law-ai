'use client';

import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import {
  Search,
  Upload,
  FileText,
  Loader2,
  CheckCircle,
  AlertCircle,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Layers,
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { laws as lawsApi } from '@/lib/api';
import type { LawInfo, LawSearchResult } from '@/lib/types';

/** Категории нормативных актов */
const LAW_CATEGORIES = ['Кодекс', 'Федеральный закон', 'Постановление', 'Другое'] as const;

/** Допустимые расширения файлов для загрузки НПА */
const ACCEPTED_EXTENSIONS = '.docx,.pdf,.txt,.rtf';

/** Тип поиска */
type SearchMode = 'semantic' | 'text';

/** Порог для свёртки текста (символов) */
const COLLAPSE_THRESHOLD = 500;
/** Длина превью при свёрнутом тексте */
const PREVIEW_LENGTH = 300;

/** Данные соседних чанков для одного результата */
interface NeighborData {
  chunks: { chunkIndex: number; content: string }[];
  source: { type: string; id: string; name: string };
}

/**
 * Подсвечивает вхождения слов запроса в тексте.
 * Возвращает массив React-элементов с <mark> для совпадений.
 */
function highlightMatches(text: string, query: string): React.ReactNode[] {
  if (!query.trim()) return [text];

  // Собираем слова запроса длиной >= 2 символов
  const words = query
    .trim()
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  if (words.length === 0) return [text];

  const pattern = new RegExp(`(${words.join('|')})`, 'gi');
  const parts = text.split(pattern);

  return parts.map((part, i) =>
    pattern.test(part) ? (
      <mark key={i} className="bg-yellow-200 text-gray-900 rounded-sm px-0.5">
        {part}
      </mark>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

/**
 * Компонент одного результата поиска.
 * Поддерживает свёртку длинного текста и загрузку соседних чанков.
 */
function SearchResultCard({
  result,
  query,
}: {
  result: LawSearchResult;
  query: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [neighbors, setNeighbors] = useState<NeighborData | null>(null);
  const [isLoadingNeighbors, setIsLoadingNeighbors] = useState(false);
  const [showNeighbors, setShowNeighbors] = useState(false);
  const [neighborError, setNeighborError] = useState<string | null>(null);

  const isLong = result.content.length > COLLAPSE_THRESHOLD;
  const shouldCollapse = isLong && !isExpanded;

  /** Загрузить соседние чанки */
  const handleLoadNeighbors = async () => {
    if (showNeighbors) {
      setShowNeighbors(false);
      return;
    }

    if (neighbors) {
      setShowNeighbors(true);
      return;
    }

    if (!result.chunkId) return;

    setIsLoadingNeighbors(true);
    setNeighborError(null);
    try {
      const data = await lawsApi.chunkNeighbors(result.chunkId);
      setNeighbors(data);
      setShowNeighbors(true);
    } catch (err) {
      console.error('Ошибка загрузки контекста:', err);
      setNeighborError('Не удалось загрузить контекст');
    } finally {
      setIsLoadingNeighbors(false);
    }
  };

  /** Цвет индикатора релевантности */
  const getSimilarityColor = (similarity: number): string => {
    if (similarity >= 0.8) return 'text-green-400 bg-green-400/10';
    if (similarity >= 0.6) return 'text-yellow-400 bg-yellow-400/10';
    return 'text-gray-400 bg-gray-500/10';
  };

  /** Определяем, является ли чанк текущим (по совпадению content) */
  const isCurrentChunk = (chunkContent: string) =>
    chunkContent.trim() === result.content.trim();

  return (
    <div className="rounded-lg border border-surface-elevated bg-surface-secondary p-4 transition-colors hover:border-brand-500/30">
      {/* Метаданные и релевантность */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-gray-400">
          {(result.metadata?.lawName as string) ?? 'Неизвестный акт'}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${getSimilarityColor(result.similarity)}`}
        >
          {Math.round(result.similarity * 100)}%
        </span>
      </div>

      {/* Текст фрагмента — белый лист, serif */}
      <div className="rounded-md bg-white p-4 shadow-sm">
        <p
          className="text-sm leading-relaxed text-gray-900"
          style={{ fontFamily: '"Times New Roman", Times, serif' }}
        >
          {shouldCollapse
            ? highlightMatches(result.content.slice(0, PREVIEW_LENGTH) + '...', query)
            : highlightMatches(result.content, query)}
        </p>
      </div>

      {/* Кнопки управления */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {/* Свёрнуть / Показать полностью */}
        {isLong && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-brand-300 transition-colors hover:bg-brand-500/10"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                Свернуть
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                Показать полностью
              </>
            )}
          </button>
        )}

        {/* Показать контекст — только если есть chunkId */}
        {result.chunkId && (
          <button
            onClick={handleLoadNeighbors}
            disabled={isLoadingNeighbors}
            className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-brand-300 transition-colors hover:bg-brand-500/10 disabled:opacity-50"
          >
            {isLoadingNeighbors ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Layers className="h-3.5 w-3.5" />
            )}
            {showNeighbors ? 'Скрыть контекст' : 'Показать контекст'}
          </button>
        )}
      </div>

      {/* Ошибка загрузки соседних чанков */}
      {neighborError && (
        <div className="mt-2 flex items-center gap-2 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {neighborError}
        </div>
      )}

      {/* Соседние чанки */}
      {showNeighbors && neighbors && (
        <div className="mt-3 rounded-md border border-dashed border-gray-600 bg-surface p-1">
          {neighbors.source?.name && (
            <div className="px-3 pt-2 pb-1 text-xs font-medium text-gray-400">
              Источник: {neighbors.source.name}
            </div>
          )}
          <div className="divide-y divide-dashed divide-gray-600">
            {neighbors.chunks.map((chunk) => {
              const isCurrent = isCurrentChunk(chunk.content);
              return (
                <div
                  key={chunk.chunkIndex}
                  className={`p-3 ${isCurrent ? 'rounded-md border-2 border-yellow-500/60 bg-yellow-500/5' : ''}`}
                >
                  <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-500">
                    {isCurrent ? 'Текущий фрагмент' : `Фрагмент ${chunk.chunkIndex}`}
                  </span>
                  <p
                    className="text-sm leading-relaxed text-gray-900 rounded-md bg-white p-3"
                    style={{ fontFamily: '"Times New Roman", Times, serif' }}
                  >
                    {highlightMatches(chunk.content, query)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Страница «База НПА».
 * Три блока: поиск, список загруженных актов, загрузка нового акта.
 */
export function LawsPage() {
  // --- Состояние: список актов ---
  const [lawsList, setLawsList] = useState<LawInfo[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);

  // --- Состояние: поиск ---
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LawSearchResult[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState<SearchMode>('semantic');

  // --- Состояние: загрузка файла ---
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [uploadFullName, setUploadFullName] = useState('');
  const [uploadCategory, setUploadCategory] = useState<string>(LAW_CATEGORIES[0]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ chunksCount: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  /** Загрузить список актов */
  const loadLaws = useCallback(async () => {
    setIsLoadingList(true);
    try {
      const { laws } = await lawsApi.list();
      setLawsList(laws);
    } catch (err) {
      console.error('Ошибка загрузки списка НПА:', err);
    } finally {
      setIsLoadingList(false);
    }
  }, []);

  useEffect(() => {
    loadLaws();
  }, [loadLaws]);

  /** Поиск по нормативной базе */
  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) return;

    setIsSearching(true);
    setSearchError(null);
    try {
      const { results } =
        searchMode === 'semantic'
          ? await lawsApi.search(q, 20)
          : await lawsApi.searchText(q, 20);
      setSearchResults(results);
    } catch (err) {
      console.error('Ошибка поиска:', err);
      setSearchError('Ошибка при поиске. Попробуйте ещё раз.');
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, searchMode]);

  /** Обработка нажатия Enter в поисковой строке */
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  // --- Drag-and-drop ---
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setUploadFile(file);
      setUploadResult(null);
      setUploadError(null);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFile(file);
      setUploadResult(null);
      setUploadError(null);
    }
  };

  /** Загрузить и проиндексировать акт */
  const handleUpload = async () => {
    if (!uploadFile || !uploadName.trim() || !uploadFullName.trim()) return;

    setIsUploading(true);
    setUploadError(null);
    setUploadResult(null);

    try {
      const result = await lawsApi.importFile(
        uploadFile,
        uploadName.trim(),
        uploadFullName.trim(),
        uploadCategory,
      );
      setUploadResult({ chunksCount: result.chunksCount });
      // Очищаем форму
      setUploadFile(null);
      setUploadName('');
      setUploadFullName('');
      setUploadCategory(LAW_CATEGORIES[0]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      // Обновляем список актов
      await loadLaws();
    } catch (err) {
      console.error('Ошибка загрузки НПА:', err);
      setUploadError(
        err instanceof Error ? err.message : 'Ошибка при загрузке. Попробуйте ещё раз.',
      );
    } finally {
      setIsUploading(false);
    }
  };

  /** Проверка заполненности формы */
  const isUploadFormValid = uploadFile && uploadName.trim() && uploadFullName.trim();

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-3xl space-y-8">
        {/* Заголовок страницы */}
        <div className="flex items-center gap-3">
          <BookOpen className="h-7 w-7 text-brand-400" />
          <h1 className="text-2xl font-bold text-gray-100">База НПА</h1>
        </div>

        {/* ===== Блок 1: Поиск ===== */}
        <section>
          <h2 className="mb-3 text-lg font-semibold text-gray-200">Поиск по нормативной базе</h2>

          {/* Переключатель типа поиска */}
          <div className="mb-3 flex rounded-lg border border-surface-elevated bg-surface p-1">
            <button
              onClick={() => setSearchMode('semantic')}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                searchMode === 'semantic'
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Семантический поиск
            </button>
            <button
              onClick={() => setSearchMode('text')}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                searchMode === 'text'
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Текстовый поиск
            </button>
          </div>

          {/* Подсказка по режиму */}
          <p className="mb-3 text-xs text-gray-500">
            {searchMode === 'semantic'
              ? 'Поиск по смыслу — находит релевантные фрагменты, даже если слова отличаются'
              : 'Точный поиск — находит фрагменты с точным совпадением слов и фраз'}
          </p>

          {/* Поисковая строка */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Введите запрос для поиска по нормативной базе..."
                className="w-full rounded-lg border border-surface-elevated bg-surface py-2.5 pl-10 pr-4 text-sm text-gray-200 placeholder-gray-500 outline-none transition-colors focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <Button
              onClick={handleSearch}
              disabled={!searchQuery.trim() || isSearching}
              className="shrink-0 gap-2"
            >
              {isSearching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Найти
            </Button>
          </div>

          {/* Результаты поиска */}
          {searchError && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {searchError}
            </div>
          )}

          {isSearching && (
            <div className="mt-4 flex items-center justify-center gap-2 py-8 text-sm text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              Поиск...
            </div>
          )}

          {!isSearching && searchResults !== null && (
            <div className="mt-4 space-y-3">
              {searchResults.length === 0 ? (
                <div className="rounded-lg border border-surface-elevated bg-surface-secondary px-4 py-6 text-center text-sm text-gray-400">
                  {lawsList.length === 0
                    ? 'Нормативная база пуста. Загрузите документы ниже.'
                    : 'Ничего не найдено. Попробуйте другой запрос.'}
                </div>
              ) : (
                searchResults.map((result, idx) => (
                  <SearchResultCard
                    key={result.chunkId ?? idx}
                    result={result}
                    query={searchQuery}
                  />
                ))
              )}
            </div>
          )}
        </section>

        {/* ===== Блок 2: Список загруженных актов ===== */}
        <section>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-200">Загруженные нормативные акты</h2>
            <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-xs font-medium text-gray-400">
              {lawsList.length}
            </span>
          </div>

          {isLoadingList ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-brand-400" />
            </div>
          ) : lawsList.length === 0 ? (
            <div className="rounded-lg border border-surface-elevated bg-surface-secondary px-4 py-6 text-center text-sm text-gray-400">
              Нет загруженных нормативных актов. Используйте форму ниже для загрузки.
            </div>
          ) : (
            <div className="space-y-2">
              {lawsList.map((law) => (
                <div
                  key={law.id}
                  className="flex items-start gap-3 rounded-lg border border-surface-elevated bg-surface-secondary p-4 transition-colors hover:border-brand-500/30"
                >
                  <FileText className="mt-0.5 h-5 w-5 shrink-0 text-brand-400" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-200">{law.name}</span>
                      <span className="rounded-full bg-brand-600/20 px-2 py-0.5 text-xs font-medium text-brand-300">
                        {law.category}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-gray-400">{law.fullName}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {law.chunksCount}{' '}
                      {pluralizeChunks(law.chunksCount)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ===== Блок 3: Загрузка нового акта ===== */}
        <section>
          <h2 className="mb-3 text-lg font-semibold text-gray-200">Загрузить нормативный акт</h2>

          <div className="space-y-4 rounded-lg border border-surface-elevated bg-surface-secondary p-5">
            {/* Зона загрузки файла */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">Файл</label>
              <div
                ref={dropZoneRef}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
                }}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
                  isDragOver
                    ? 'border-brand-500 bg-brand-500/5'
                    : 'border-surface-elevated hover:border-gray-500'
                }`}
              >
                <Upload className="mb-2 h-8 w-8 text-gray-500" />
                {uploadFile ? (
                  <p className="text-sm text-gray-200">{uploadFile.name}</p>
                ) : (
                  <>
                    <p className="text-sm text-gray-300">
                      Перетащите файл сюда или нажмите для выбора
                    </p>
                    <p className="mt-1 text-xs text-gray-500">.docx, .pdf, .txt, .rtf</p>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_EXTENSIONS}
                  onChange={handleFileSelect}
                  className="hidden"
                  aria-label="Выбрать файл"
                />
              </div>
            </div>

            {/* Название */}
            <div>
              <label htmlFor="law-name" className="mb-1.5 block text-sm font-medium text-gray-300">
                Название <span className="text-red-400">*</span>
              </label>
              <input
                id="law-name"
                type="text"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                placeholder='Например: "ГК РФ", "ТК РФ", "152-ФЗ"'
                className="w-full rounded-lg border border-surface-elevated bg-surface py-2 px-3 text-sm text-gray-200 placeholder-gray-500 outline-none transition-colors focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>

            {/* Полное название */}
            <div>
              <label htmlFor="law-full-name" className="mb-1.5 block text-sm font-medium text-gray-300">
                Полное название <span className="text-red-400">*</span>
              </label>
              <input
                id="law-full-name"
                type="text"
                value={uploadFullName}
                onChange={(e) => setUploadFullName(e.target.value)}
                placeholder="Гражданский кодекс Российской Федерации"
                className="w-full rounded-lg border border-surface-elevated bg-surface py-2 px-3 text-sm text-gray-200 placeholder-gray-500 outline-none transition-colors focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>

            {/* Категория */}
            <div>
              <label htmlFor="law-category" className="mb-1.5 block text-sm font-medium text-gray-300">
                Категория
              </label>
              <select
                id="law-category"
                value={uploadCategory}
                onChange={(e) => setUploadCategory(e.target.value)}
                className="w-full rounded-lg border border-surface-elevated bg-surface py-2 px-3 text-sm text-gray-200 outline-none transition-colors focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              >
                {LAW_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Кнопка загрузки */}
            <Button
              onClick={handleUpload}
              disabled={!isUploadFormValid || isUploading}
              className="w-full justify-center gap-2"
              size="lg"
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {isUploading ? 'Загрузка и индексация...' : 'Загрузить и проиндексировать'}
            </Button>

            {/* Статус индексации */}
            {isUploading && (
              <div className="flex items-center gap-2 rounded-lg bg-brand-600/10 px-4 py-3 text-sm text-brand-300">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                Индексация... Это может занять несколько минут для больших документов.
              </div>
            )}

            {/* Успех */}
            {uploadResult && (
              <div className="flex items-center gap-2 rounded-lg bg-green-500/10 px-4 py-3 text-sm text-green-400">
                <CheckCircle className="h-4 w-4 shrink-0" />
                Загружено! Создано {uploadResult.chunksCount}{' '}
                {pluralizeChunks(uploadResult.chunksCount)} для поиска.
              </div>
            )}

            {/* Ошибка */}
            {uploadError && (
              <div className="flex items-center gap-2 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {uploadError}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * Склонение слова «фрагмент» по числу.
 * 1 фрагмент, 2 фрагмента, 5 фрагментов.
 */
function pluralizeChunks(count: number): string {
  const abs = Math.abs(count) % 100;
  const lastDigit = abs % 10;
  if (abs > 10 && abs < 20) return 'фрагментов';
  if (lastDigit > 1 && lastDigit < 5) return 'фрагмента';
  if (lastDigit === 1) return 'фрагмент';
  return 'фрагментов';
}
