import { Scale, MessageSquarePlus } from 'lucide-react';

/**
 * Главная страница — заглушка с приглашением начать диалог.
 * В будущем здесь будет чат-интерфейс.
 */
export default function HomePage() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-md text-center">
        {/* Логотип */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600/20">
          <Scale className="h-8 w-8 text-brand-400" />
        </div>

        {/* Заголовок */}
        <h1 className="mb-2 text-2xl font-semibold text-gray-100">Lawer</h1>
        <p className="mb-8 text-gray-400">AI-ассистент юридического отдела</p>

        {/* Подсказки возможностей */}
        <div className="mb-8 grid gap-3 text-left text-sm">
          <FeatureHint text="Анализ юридических документов и выявление рисков" />
          <FeatureHint text="Генерация договоров по шаблонам" />
          <FeatureHint text="Ответы на вопросы с ссылками на НПА РФ" />
          <FeatureHint text="Управление задачами и дедлайнами" />
        </div>

        {/* Приглашение к действию */}
        <div className="flex items-center justify-center gap-2 text-gray-500">
          <MessageSquarePlus className="h-4 w-4" />
          <span className="text-sm">Начните новый диалог</span>
        </div>
      </div>
    </div>
  );
}

/** Элемент списка возможностей */
function FeatureHint({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-surface-elevated bg-surface-secondary px-4 py-3 text-gray-300">
      {text}
    </div>
  );
}
