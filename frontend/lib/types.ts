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

/** SSE-события от сервера */
export type SSEEvent =
  | { type: 'message_start'; messageId: string }
  | { type: 'token'; content: string }
  | { type: 'message_end'; messageId: string; content: string }
  | { type: 'error'; error: string };
