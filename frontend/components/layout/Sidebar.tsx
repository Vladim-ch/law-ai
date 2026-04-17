'use client';

import { Scale, Plus, LogOut, Trash2, MessageSquare } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/stores/auth';
import { useChatStore } from '@/stores/chat';
import { useEffect } from 'react';

/** Форматирует дату для отображения в списке диалогов */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return 'Сегодня';
  if (days === 1) return 'Вчера';
  if (days < 7) return `${days} дн. назад`;
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

/**
 * Боковая панель навигации.
 * Содержит: логотип, кнопку нового диалога, список диалогов, профиль пользователя.
 */
export function Sidebar() {
  const { user, logout } = useAuthStore();
  const {
    conversations,
    currentConversationId,
    loadConversations,
    selectConversation,
    createConversation,
    deleteConversation,
    clearCurrentConversation,
  } = useChatStore();

  // Загружаем диалоги при монтировании (если авторизован)
  useEffect(() => {
    if (user) {
      loadConversations();
    }
  }, [user, loadConversations]);

  /** Создать новый диалог */
  const handleNewChat = async () => {
    await createConversation();
  };

  /** Удалить диалог с подтверждением */
  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteConversation(id);
  };

  // Сортируем по updatedAt (новые сверху)
  const sortedConversations = [...conversations].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  return (
    <aside className="flex w-sidebar flex-col border-r border-surface-elevated bg-surface-secondary">
      {/* Логотип */}
      <div className="flex items-center gap-2 px-4 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
          <Scale className="h-4 w-4 text-white" />
        </div>
        <span className="text-lg font-semibold text-gray-100">Lawer</span>
      </div>

      {/* Кнопка «Новый диалог» */}
      <div className="px-3 pb-2">
        <Button
          variant="primary"
          size="md"
          className="w-full justify-center gap-2"
          onClick={handleNewChat}
        >
          <Plus className="h-4 w-4" />
          Новый диалог
        </Button>
      </div>

      {/* Список диалогов */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {sortedConversations.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-gray-600">
            Нет диалогов
          </div>
        ) : (
          <div className="space-y-0.5">
            {sortedConversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => selectConversation(conv.id)}
                role="button"
                tabIndex={0}
                className={`group flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                  currentConversationId === conv.id
                    ? 'bg-surface-tertiary text-gray-200'
                    : 'text-gray-400 hover:bg-surface-tertiary hover:text-gray-200'
                }`}
              >
                <MessageSquare className="h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate">{conv.title || 'Новый диалог'}</p>
                  <p className="text-xs text-gray-600">{formatDate(conv.updatedAt)}</p>
                </div>
                {/* Кнопка удаления */}
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    deleteConversation(conv.id);
                  }}
                  className="shrink-0 rounded p-1.5 text-gray-600 transition-colors hover:bg-red-500/10 hover:text-red-400"
                  aria-label="Удалить диалог"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Пользователь */}
      {user && (
        <div className="border-t border-surface-elevated p-3">
          <div className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600/20 text-xs font-medium text-brand-400">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <span className="min-w-0 flex-1 truncate text-gray-300">{user.name}</span>
            <button
              onClick={logout}
              className="shrink-0 rounded p-1 text-gray-500 transition-colors hover:text-gray-300"
              aria-label="Выйти"
              title="Выйти"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
