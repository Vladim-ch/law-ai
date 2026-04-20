'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus } from 'lucide-react';

import { TemplateList } from './TemplateList';
import { TemplateForm } from './TemplateForm';
import { TemplateCreator } from './TemplateCreator';
import { Button } from '@/components/ui/Button';
import { templates as templatesApi } from '@/lib/api';
import type { TemplateInfo, Template } from '@/lib/types';

/**
 * Страница «Шаблоны документов».
 * Три режима: список карточек, форма заполнения, создание шаблона из документа.
 */
export function TemplatesPage() {
  const [view, setView] = useState<'list' | 'fill' | 'create'>('list');
  const [templatesList, setTemplatesList] = useState<TemplateInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);

  /** Загрузить список шаблонов */
  const fetchTemplates = useCallback(async () => {
    setIsLoading(true);
    try {
      const { templates } = await templatesApi.list();
      setTemplatesList(templates);
    } catch (err) {
      console.error('Ошибка загрузки шаблонов:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  /** Выбрать шаблон — загрузить полные данные */
  const handleSelect = useCallback(async (id: string) => {
    setIsLoadingTemplate(true);
    try {
      const { template } = await templatesApi.get(id);
      setSelectedTemplate(template);
      setView('fill');
    } catch (err) {
      console.error('Ошибка загрузки шаблона:', err);
    } finally {
      setIsLoadingTemplate(false);
    }
  }, []);

  /** Вернуться к списку */
  const handleBack = useCallback(() => {
    setSelectedTemplate(null);
    setView('list');
  }, []);

  /** После успешного создания шаблона — вернуться к списку и обновить */
  const handleCreated = useCallback(() => {
    setView('list');
    fetchTemplates();
  }, [fetchTemplates]);

  // Загрузка конкретного шаблона
  if (isLoadingTemplate) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  // Создание шаблона из документа
  if (view === 'create') {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <TemplateCreator onBack={handleBack} onCreated={handleCreated} />
      </div>
    );
  }

  // Форма заполнения
  if (view === 'fill' && selectedTemplate) {
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
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-100">Шаблоны документов</h1>
          <Button
            variant="primary"
            size="md"
            className="gap-2"
            onClick={() => setView('create')}
          >
            <Plus className="h-4 w-4" />
            Создать шаблон
          </Button>
        </div>
        <TemplateList
          templates={templatesList}
          isLoading={isLoading}
          onSelect={handleSelect}
        />
      </div>
    </div>
  );
}
