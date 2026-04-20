'use client';

import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { TemplateInfo } from '@/lib/types';

/** Склоняет слово "параметр" по количеству */
function pluralParams(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} параметр`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} параметра`;
  return `${count} параметров`;
}

interface TemplateListProps {
  templates: TemplateInfo[];
  isLoading: boolean;
  onSelect: (id: string) => void;
}

/** Список карточек шаблонов */
export function TemplateList({ templates, isLoading, onSelect }: TemplateListProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse rounded-xl border border-surface-elevated bg-surface-secondary p-5"
          >
            <div className="mb-3 h-10 w-10 rounded-lg bg-surface-elevated" />
            <div className="mb-2 h-5 w-3/4 rounded bg-surface-elevated" />
            <div className="mb-4 h-4 w-1/3 rounded bg-surface-elevated" />
            <div className="h-9 w-24 rounded-lg bg-surface-elevated" />
          </div>
        ))}
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-500">
        <FileText className="mb-3 h-12 w-12" />
        <p className="text-lg font-medium">Шаблоны не найдены</p>
        <p className="mt-1 text-sm">Попробуйте изменить фильтр категории</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {templates.map((tpl) => (
        <div
          key={tpl.id}
          className="group rounded-xl border border-surface-elevated bg-surface-secondary p-5 transition-colors hover:border-brand-600/40"
        >
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600/10">
            <FileText className="h-5 w-5 text-brand-400" />
          </div>
          <h3 className="mb-1 text-sm font-semibold text-gray-200">{tpl.name}</h3>
          <div className="mb-1 flex items-center gap-2">
            <span className="inline-block rounded-md bg-surface-elevated px-2 py-0.5 text-xs text-gray-400">
              {tpl.category}
            </span>
          </div>
          <p className="mb-4 text-xs text-gray-500">
            {pluralParams(tpl.parameters.length)}
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onSelect(tpl.id)}
          >
            Заполнить
          </Button>
        </div>
      ))}
    </div>
  );
}
