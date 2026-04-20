'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, MoveVertical } from 'lucide-react';

import type { InlineDiff, MatchedParagraph, ModifiedParagraph } from '@/lib/types';

/** Пропсы для блока совпадающего абзаца */
interface MatchedBlockProps {
  paragraph: MatchedParagraph;
}

/** Пропсы для блока изменённого абзаца */
interface ModifiedBlockProps {
  paragraph: ModifiedParagraph;
}

/** Пропсы для блока добавленного/удалённого текста */
interface TextBlockProps {
  text: string;
}

/** Рендер inline diff — равный / добавленный / удалённый текст */
function InlineDiffRender({ parts }: { parts: InlineDiff[] }) {
  return (
    <p className="text-sm leading-relaxed">
      {parts.map((part, i) => {
        if (part.type === 'equal') {
          return <span key={i} className="text-gray-300">{part.text}</span>;
        }
        if (part.type === 'removed') {
          return (
            <span key={i} className="rounded-sm bg-red-500/20 px-0.5 text-red-300 line-through">
              {part.text}
            </span>
          );
        }
        // added
        return (
          <span key={i} className="rounded-sm bg-green-500/20 px-0.5 text-green-300">
            {part.text}
          </span>
        );
      })}
    </p>
  );
}

/** Блок совпавшего абзаца — свёрнут по умолчанию */
export function MatchedBlock({ paragraph }: MatchedBlockProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-surface-elevated bg-surface-secondary p-4">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className="flex items-center gap-1.5 text-sm font-medium text-green-400">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500/15 text-xs">
            =
          </span>
          Совпадает
        </span>
        {paragraph.moved && (
          <span className="flex items-center gap-1 rounded-full bg-yellow-500/15 px-2 py-0.5 text-xs text-yellow-400">
            <MoveVertical className="h-3 w-3" />
            перемещён
          </span>
        )}
        <div className="flex-1" />
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-gray-500" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-500" />
        )}
      </button>

      {expanded && (
        <p className="mt-3 border-l-2 border-surface-elevated pl-3 text-sm leading-relaxed text-gray-400">
          {paragraph.text}
        </p>
      )}
    </div>
  );
}

/** Блок изменённого абзаца с inline diff */
export function ModifiedBlock({ paragraph }: ModifiedBlockProps) {
  const similarityPercent = Math.round(paragraph.similarity * 100);

  return (
    <div className="rounded-lg border border-yellow-500/20 bg-surface-secondary p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex items-center gap-1.5 text-sm font-medium text-yellow-400">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-yellow-500/15 text-xs">
            ~
          </span>
          Изменён
        </span>
        <span className="rounded-full bg-yellow-500/10 px-2 py-0.5 text-xs text-yellow-400">
          {similarityPercent}% совпадение
        </span>
      </div>

      <div className="rounded-md border border-surface-elevated bg-surface p-3">
        <InlineDiffRender parts={paragraph.inlineDiff} />
      </div>
    </div>
  );
}

/** Блок добавленного абзаца */
export function AddedBlock({ text }: TextBlockProps) {
  return (
    <div className="rounded-lg border border-green-500/20 bg-surface-secondary p-4">
      <div className="mb-3 flex items-center gap-1.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500/15 text-xs text-green-400">
          +
        </span>
        <span className="text-sm font-medium text-green-400">Добавлен в документе B</span>
      </div>

      <div className="rounded-md border border-green-500/15 bg-green-500/5 p-3">
        <p className="text-sm leading-relaxed text-green-300">{text}</p>
      </div>
    </div>
  );
}

/** Блок удалённого абзаца */
export function RemovedBlock({ text }: TextBlockProps) {
  return (
    <div className="rounded-lg border border-red-500/20 bg-surface-secondary p-4">
      <div className="mb-3 flex items-center gap-1.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/15 text-xs text-red-400">
          -
        </span>
        <span className="text-sm font-medium text-red-400">Удалён из документа A</span>
      </div>

      <div className="rounded-md border border-red-500/15 bg-red-500/5 p-3">
        <p className="text-sm leading-relaxed text-red-300 line-through">{text}</p>
      </div>
    </div>
  );
}
