/** Типы данных, общие для всего приложения */

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: string;
}

/** Информация о документе (без содержимого) */
export interface DocumentInfo {
  id: string;
  filename: string;
  fileType: string;
  createdAt: string;
}

/** Полный документ с текстом */
export interface Document extends DocumentInfo {
  filePath: string;
  contentText: string | null;
}

/** Параметр шаблона документа */
export interface TemplateParam {
  key: string;
  label: string;
  type: 'string' | 'date' | 'text';
  required: boolean;
  default?: string;
}

/** Краткая информация о шаблоне (без тела) */
export interface TemplateInfo {
  id: string;
  name: string;
  category: string;
  parameters: TemplateParam[];
  createdAt: string;
}

/** Полный шаблон с телом документа */
export interface Template extends TemplateInfo {
  templateBody: string;
}

/** Информация о нормативном акте */
export interface LawInfo {
  id: string;
  name: string;
  fullName: string;
  category: string;
  chunksCount: number;
}

/** Результат поиска по нормативной базе */
export interface LawSearchResult {
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
}

/** Элемент inline diff (равный, добавленный, удалённый текст) */
export interface InlineDiff {
  type: 'equal' | 'added' | 'removed';
  text: string;
}

/** Совпавший абзац */
export interface MatchedParagraph {
  indexA: number;
  indexB: number;
  text: string;
  moved: boolean;
}

/** Изменённый абзац с inline diff */
export interface ModifiedParagraph {
  indexA: number;
  indexB: number;
  textA: string;
  textB: string;
  similarity: number;
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

/** Результат сравнения двух документов */
export interface CompareResult {
  matched: MatchedParagraph[];
  modified: ModifiedParagraph[];
  addedInB: string[];
  removedFromA: string[];
  movedCount: number;
  stats: CompareStats;
}

/** SSE-события от сервера */
export type SSEEvent =
  | { type: 'message_start'; messageId: string }
  | { type: 'token'; content: string }
  | { type: 'message_end'; messageId: string; content: string }
  | { type: 'error'; error: string };
