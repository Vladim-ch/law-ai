'use client';

import { useState, useCallback, useRef } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Upload,
  Loader2,
  Trash2,
  Plus,
  Save,
  Check,
  FileText,
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { templates as templatesApi } from '@/lib/api';
import { ALLOWED_EXTENSIONS } from '@/lib/api';
import type { ExtractedTemplate, ExtractedParameter, TemplateParam } from '@/lib/types';

/** Список шагов wizard'а */
const STEPS = [
  { label: 'Загрузка', number: 1 },
  { label: 'Параметры', number: 2 },
  { label: 'Превью', number: 3 },
  { label: 'Сохранение', number: 4 },
] as const;

/** Категории шаблонов */
const CATEGORIES = [
  'Договор',
  'Соглашение',
  'Акт',
  'Заявление',
  'Приказ',
  'Доверенность',
  'Протокол',
  'Другое',
];

interface TemplateCreatorProps {
  onBack: () => void;
  onCreated: () => void;
}

/**
 * Wizard создания шаблона из документа.
 * 4 шага: загрузка файла, редактирование параметров, превью, сохранение.
 */
export function TemplateCreator({ onBack, onCreated }: TemplateCreatorProps) {
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);

  // Шаг 1: загрузка
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [isExtracting, setIsExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Шаг 2: параметры
  const [parameters, setParameters] = useState<ExtractedParameter[]>([]);
  const [templateBody, setTemplateBody] = useState('');
  const [originalText, setOriginalText] = useState('');

  // Шаг 4: сохранение
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  /** Обработка выбора файла */
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      // Подставить имя файла как название шаблона, если пусто
      if (!name) {
        const baseName = selected.name.replace(/\.[^.]+$/, '');
        setName(baseName);
      }
    }
  }, [name]);

  /** Шаг 1 → Шаг 2: загрузить файл и извлечь шаблон */
  const handleExtract = useCallback(async () => {
    if (!file) {
      setError('Выберите файл для загрузки');
      return;
    }
    if (!name.trim()) {
      setError('Укажите название шаблона');
      return;
    }

    setError(null);
    setIsExtracting(true);

    try {
      const result: ExtractedTemplate = await templatesApi.extractFromFile(file);
      setParameters(result.parameters);
      setTemplateBody(result.templateBody);
      setOriginalText(result.originalText);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка извлечения шаблона из документа');
    } finally {
      setIsExtracting(false);
    }
  }, [file, name]);

  /** Обновить параметр */
  const updateParam = useCallback((index: number, field: keyof ExtractedParameter, value: string | boolean) => {
    setParameters((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }, []);

  /** Удалить параметр */
  const removeParam = useCallback((index: number) => {
    setParameters((prev) => prev.filter((_, i) => i !== index));
  }, []);

  /** Добавить новый параметр */
  const addParam = useCallback(() => {
    const newKey = `param_${Date.now()}`;
    setParameters((prev) => [
      ...prev,
      { key: newKey, label: '', type: 'string' as const, value: '', required: false },
    ]);
  }, []);

  /** Сохранить шаблон на сервер */
  const handleSave = useCallback(async () => {
    setError(null);
    setIsSaving(true);

    // Конвертировать ExtractedParameter[] → TemplateParam[]
    const templateParams: TemplateParam[] = parameters.map((p) => ({
      key: p.key,
      label: p.label,
      type: p.type,
      required: p.required,
      default: p.value || undefined,
    }));

    try {
      await templatesApi.create({
        name: name.trim(),
        category,
        templateBody,
        parameters: templateParams,
      });
      setIsSaved(true);
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения шаблона');
    } finally {
      setIsSaving(false);
    }
  }, [name, category, templateBody, parameters]);

  /** Рендер подсветки плейсхолдеров {{key}} в тексте шаблона */
  const renderHighlightedTemplate = useCallback((text: string) => {
    const parts = text.split(/({{[^}]+}})/g);
    return parts.map((part, i) => {
      if (/^{{.+}}$/.test(part)) {
        return (
          <span
            key={i}
            className="inline rounded px-1 py-0.5"
            style={{ backgroundColor: 'rgba(99, 102, 241, 0.2)', color: '#a5b4fc' }}
          >
            {part}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  }, []);

  /** Склонение "параметр" */
  const pluralParams = (count: number): string => {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return `${count} параметр`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} параметра`;
    return `${count} параметров`;
  };

  return (
    <div className="mx-auto w-full max-w-5xl">
      {/* Кнопка назад */}
      <button
        onClick={onBack}
        className="mb-4 flex items-center gap-1.5 text-sm text-gray-400 transition-colors hover:text-gray-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Назад к шаблонам
      </button>

      {/* Steps indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-center gap-1">
          {STEPS.map((s, i) => (
            <div key={s.number} className="flex items-center">
              {/* Кружок с номером */}
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                    step > s.number
                      ? 'bg-brand-600 text-white'
                      : step === s.number
                        ? 'bg-brand-600 text-white ring-2 ring-brand-400/40 ring-offset-2 ring-offset-surface'
                        : 'bg-surface-elevated text-gray-500'
                  }`}
                >
                  {step > s.number ? <Check className="h-4 w-4" /> : s.number}
                </div>
                <span
                  className={`text-sm font-medium ${
                    step >= s.number ? 'text-gray-200' : 'text-gray-500'
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {/* Линия между шагами */}
              {i < STEPS.length - 1 && (
                <div
                  className={`mx-3 h-px w-12 transition-colors ${
                    step > s.number ? 'bg-brand-600' : 'bg-surface-elevated'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Ошибка */}
      {error && (
        <div className="mb-6 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* ============ Шаг 1: Загрузка документа ============ */}
      {step === 1 && (
        <div className="mx-auto max-w-lg">
          <h2 className="mb-2 text-xl font-semibold text-gray-100">
            Создать шаблон из документа
          </h2>
          <p className="mb-6 text-sm text-gray-400">
            Загрузите готовый договор — AI проанализирует его и создаст шаблон для повторного использования.
          </p>

          {/* Зона загрузки файла */}
          <div
            className="group mb-6 cursor-pointer rounded-xl border-2 border-dashed border-surface-elevated p-8 text-center transition-colors hover:border-brand-600/40"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_EXTENSIONS}
              onChange={handleFileChange}
              className="hidden"
            />
            {file ? (
              <div className="flex flex-col items-center gap-2">
                <FileText className="h-10 w-10 text-brand-400" />
                <p className="text-sm font-medium text-gray-200">{file.name}</p>
                <p className="text-xs text-gray-500">
                  {(file.size / 1024).toFixed(1)} КБ
                </p>
                <span className="text-xs text-brand-400">Нажмите, чтобы заменить</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-10 w-10 text-gray-500 transition-colors group-hover:text-brand-400" />
                <p className="text-sm font-medium text-gray-300">
                  Выбрать файл
                </p>
                <p className="text-xs text-gray-500">.docx, .pdf, .txt</p>
              </div>
            )}
          </div>

          {/* Название шаблона */}
          <div className="mb-4">
            <label htmlFor="tpl-name" className="mb-1.5 block text-sm font-medium text-gray-300">
              Название шаблона <span className="text-red-400">*</span>
            </label>
            <input
              id="tpl-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Договор оказания услуг"
              className="w-full rounded-lg border border-surface-elevated bg-surface px-3 py-2 text-sm text-gray-200 placeholder-gray-600 transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {/* Категория */}
          <div className="mb-6">
            <label htmlFor="tpl-category" className="mb-1.5 block text-sm font-medium text-gray-300">
              Категория
            </label>
            <select
              id="tpl-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-surface-elevated bg-surface px-3 py-2 text-sm text-gray-200 transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Кнопка продолжения */}
          <Button
            variant="primary"
            size="lg"
            className="w-full gap-2"
            onClick={handleExtract}
            disabled={isExtracting || !file}
          >
            {isExtracting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                AI анализирует документ...
              </>
            ) : (
              <>
                Анализировать документ
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>

          {isExtracting && (
            <p className="mt-3 text-center text-xs text-gray-500">
              Это может занять 1-2 минуты
            </p>
          )}
        </div>
      )}

      {/* ============ Шаг 2: Редактирование параметров ============ */}
      {step === 2 && (
        <div>
          <h2 className="mb-1 text-xl font-semibold text-gray-100">
            Редактирование параметров
          </h2>
          <p className="mb-6 text-sm text-gray-400">
            Найдено {pluralParams(parameters.length)}. Проверьте и при необходимости отредактируйте.
          </p>

          {/* Таблица параметров */}
          <div className="mb-6 overflow-x-auto rounded-xl border border-surface-elevated">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-elevated bg-surface-secondary">
                  <th className="px-4 py-3 text-left font-medium text-gray-400">Ключ</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-400">Название</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-400">Значение</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-400">Тип</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-400">Обяз.</th>
                  <th className="w-12 px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {parameters.map((param, index) => (
                  <tr
                    key={param.key + index}
                    className="border-b border-surface-elevated/50 last:border-0"
                  >
                    {/* Ключ */}
                    <td className="px-4 py-2">
                      <code className="rounded bg-surface-elevated px-1.5 py-0.5 text-xs text-brand-300">
                        {param.key}
                      </code>
                    </td>
                    {/* Название (редактируемое) */}
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={param.label}
                        onChange={(e) => updateParam(index, 'label', e.target.value)}
                        className="w-full rounded border border-surface-elevated bg-surface px-2 py-1 text-sm text-gray-200 focus:border-brand-500 focus:outline-none"
                      />
                    </td>
                    {/* Значение (из документа, только чтение) */}
                    <td className="px-4 py-2">
                      <span className="text-xs text-gray-400">{param.value || '—'}</span>
                    </td>
                    {/* Тип */}
                    <td className="px-4 py-2">
                      <select
                        value={param.type}
                        onChange={(e) => updateParam(index, 'type', e.target.value)}
                        className="rounded border border-surface-elevated bg-surface px-2 py-1 text-sm text-gray-200 focus:border-brand-500 focus:outline-none"
                      >
                        <option value="string">Строка</option>
                        <option value="date">Дата</option>
                        <option value="text">Текст</option>
                      </select>
                    </td>
                    {/* Обязательный */}
                    <td className="px-4 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={param.required}
                        onChange={(e) => updateParam(index, 'required', e.target.checked)}
                        className="h-4 w-4 cursor-pointer rounded border-surface-elevated accent-brand-500"
                      />
                    </td>
                    {/* Удалить */}
                    <td className="px-4 py-2 text-center">
                      <button
                        onClick={() => removeParam(index)}
                        className="rounded p-1 text-gray-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                        title="Удалить параметр"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Добавить параметр */}
          <button
            onClick={addParam}
            className="mb-8 flex items-center gap-1.5 text-sm text-brand-400 transition-colors hover:text-brand-300"
          >
            <Plus className="h-4 w-4" />
            Добавить параметр
          </button>

          {/* Навигация */}
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="md" className="gap-2" onClick={() => setStep(1)}>
              <ArrowLeft className="h-4 w-4" />
              Назад
            </Button>
            <Button
              variant="primary"
              size="md"
              className="gap-2"
              onClick={() => setStep(3)}
            >
              Превью
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ============ Шаг 3: Превью (side-by-side) ============ */}
      {step === 3 && (
        <div className="flex flex-col">
          <h2 className="mb-1 text-xl font-semibold text-gray-100">
            Превью шаблона
          </h2>
          <p className="mb-6 text-sm text-gray-400">
            Сравните оригинальный документ и сгенерированный шаблон.
          </p>

          {/* Side-by-side */}
          <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:gap-6">
            {/* Лист: Оригинал */}
            <div className="flex flex-1 flex-col">
              <div className="mb-2 text-center text-xs font-medium text-gray-400">
                Оригинал
              </div>
              <div
                className="flex-1 overflow-y-auto rounded bg-white shadow-lg"
                style={{
                  fontFamily: "'Times New Roman', 'PT Serif', Georgia, serif",
                  boxShadow: '0 2px 20px rgba(0,0,0,0.3), 0 0 1px rgba(0,0,0,0.2)',
                  maxHeight: '60vh',
                }}
              >
                <div className="px-10 py-8">
                  {originalText.split('\n').map((line, i) => (
                    <p key={i} className="mb-1 text-sm leading-[1.8] text-gray-800">
                      {line || '\u00A0'}
                    </p>
                  ))}
                </div>
              </div>
            </div>

            {/* Лист: Шаблон */}
            <div className="flex flex-1 flex-col">
              <div className="mb-2 text-center text-xs font-medium text-gray-400">
                Шаблон
              </div>
              <div
                className="flex-1 overflow-y-auto rounded bg-white shadow-lg"
                style={{
                  fontFamily: "'Times New Roman', 'PT Serif', Georgia, serif",
                  boxShadow: '0 2px 20px rgba(0,0,0,0.3), 0 0 1px rgba(0,0,0,0.2)',
                  maxHeight: '60vh',
                }}
              >
                <div className="px-10 py-8">
                  {templateBody.split('\n').map((line, i) => (
                    <p key={i} className="mb-1 text-sm leading-[1.8] text-gray-800">
                      {line ? renderHighlightedTemplate(line) : '\u00A0'}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Навигация */}
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="md" className="gap-2" onClick={() => setStep(2)}>
              <ArrowLeft className="h-4 w-4" />
              Назад
            </Button>
            <Button
              variant="primary"
              size="md"
              className="gap-2"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Сохранение...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Сохранить шаблон
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ============ Шаг 4: Успешное сохранение ============ */}
      {step === 4 && isSaved && (
        <div className="mx-auto max-w-md text-center">
          <div className="mb-4 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-600/10">
              <Check className="h-8 w-8 text-brand-400" />
            </div>
          </div>
          <h2 className="mb-2 text-xl font-semibold text-gray-100">
            Шаблон сохранён
          </h2>
          <p className="mb-6 text-sm text-gray-400">
            Шаблон &laquo;{name}&raquo; успешно создан и доступен в списке шаблонов.
          </p>
          <Button variant="primary" size="lg" onClick={onCreated}>
            К списку шаблонов
          </Button>
        </div>
      )}
    </div>
  );
}
