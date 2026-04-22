'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

/** Tailwind-стили для Markdown-элементов */
const components: Components = {
  h1: ({ children }) => (
    <h1 className="mb-4 mt-6 text-2xl font-bold text-gray-100">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-3 mt-5 text-xl font-semibold text-gray-100">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-4 text-lg font-semibold text-gray-200">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mb-2 mt-3 text-base font-semibold text-gray-200">{children}</h4>
  ),
  h5: ({ children }) => (
    <h5 className="mb-1 mt-2 text-sm font-semibold text-gray-300">{children}</h5>
  ),
  h6: ({ children }) => (
    <h6 className="mb-1 mt-2 text-sm font-medium text-gray-400">{children}</h6>
  ),
  p: ({ children }) => (
    <p className="mb-3 leading-relaxed text-gray-300">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="mb-3 ml-4 list-disc space-y-1 text-gray-300">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 ml-4 list-decimal space-y-1 text-gray-300">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="mb-3 border-l-4 border-brand-500 pl-4 italic text-gray-400">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="mb-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-surface-elevated bg-surface-tertiary">
      {children}
    </thead>
  ),
  th: ({ children }) => (
    <th className="px-3 py-2 text-left font-semibold text-gray-200">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border-b border-surface-elevated px-3 py-2 text-gray-300">
      {children}
    </td>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-brand-400 underline decoration-brand-400/30 hover:decoration-brand-400"
    >
      {children}
    </a>
  ),
  code: ({ children, className }) => {
    // Inline code: нет className и контент — простая строка без переносов
    const isInline =
      !className && typeof children === 'string' && !children.includes('\n');

    if (isInline) {
      return (
        <code className="rounded bg-surface-elevated px-1.5 py-0.5 font-mono text-sm text-brand-300">
          {children}
        </code>
      );
    }

    // Блочный код — стили на <pre>, code прозрачный
    return <code className={className || ''}>{children}</code>;
  },
  pre: ({ children }) => (
    <pre className="mb-3 max-w-full overflow-x-auto rounded-lg bg-surface p-4 font-mono text-sm text-gray-200">
      {children}
    </pre>
  ),
  hr: () => <hr className="my-4 border-surface-elevated" />,
  strong: ({ children }) => (
    <strong className="font-semibold text-gray-200">{children}</strong>
  ),
  em: ({ children }) => <em className="italic text-gray-300">{children}</em>,
  del: ({ children }) => (
    <del className="text-gray-500 line-through">{children}</del>
  ),
};

interface MarkdownRendererProps {
  content: string;
}

/**
 * Обёртка над react-markdown с Tailwind-стилями для тёмной темы.
 * Поддерживает GFM: таблицы, strikethrough, чеклисты.
 */
export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
}
