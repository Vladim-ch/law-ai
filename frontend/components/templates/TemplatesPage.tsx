'use client';

import { useState, useEffect, useCallback } from 'react';

import { TemplateList } from './TemplateList';
import { TemplateForm } from './TemplateForm';
import { templates as templatesApi } from '@/lib/api';
import type { TemplateInfo, Template } from '@/lib/types';

/**
 * Страница «Шаблоны документов».
 * Два режима: список карточек и форма заполнения выбранного шаблона.
 */
export function TemplatesPage() {
  const [templatesList, setTemplatesList] = useState<TemplateInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);

  /** Загрузить список шаблонов */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const { templates } = await templatesApi.list();
        if (!cancelled) setTemplatesList(templates);
      } catch (err) {
        console.error('Ошибка загрузки шаблонов:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /** Выбрать шаблон — загрузить полные данные */
  const handleSelect = useCallback(async (id: string) => {
    setIsLoadingTemplate(true);
    try {
      const { template } = await templatesApi.get(id);
      setSelectedTemplate(template);
    } catch (err) {
      console.error('Ошибка загрузки шаблона:', err);
    } finally {
      setIsLoadingTemplate(false);
    }
  }, []);

  /** Вернуться к списку */
  const handleBack = useCallback(() => {
    setSelectedTemplate(null);
  }, []);

  // Загрузка конкретного шаблона
  if (isLoadingTemplate) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  // Форма заполнения
  if (selectedTemplate) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <TemplateForm template={selectedTemplate} onBack={handleBack} />
      </div>
    );
  }

  // Список шаблонов
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-6 text-2xl font-bold text-gray-100">Шаблоны документов</h1>
        <TemplateList
          templates={templatesList}
          isLoading={isLoading}
          onSelect={handleSelect}
        />
      </div>
    </div>
  );
}
