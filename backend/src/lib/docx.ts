/**
 * Утилита генерации .docx файлов.
 *
 * Формат: Times New Roman, 12pt, ГОСТ Р 7.0.97-2016 (поля 2/2/3/1.5 см).
 * Используется для экспорта анализа документов и диалогов.
 */

import {
  Document as DocxDocument,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
} from 'docx';

// ---------------------------------------------------------------------------
// Константы
// ---------------------------------------------------------------------------

/** Размеры полей в twips (1 см = 567 twips). ГОСТ Р 7.0.97-2016. */
const PAGE_MARGINS = {
  top: 2 * 567,       // 2 см
  bottom: 2 * 567,    // 2 см
  left: 3 * 567,      // 3 см
  right: 1.5 * 567,   // 1.5 см
};

/** Шрифт по умолчанию. */
const DEFAULT_FONT = 'Times New Roman';

/** Размер основного текста в полупунктах (12pt = 24 half-points). */
const BODY_SIZE = 24;

/** Размер заголовка в полупунктах (14pt = 28 half-points). */
const HEADING_SIZE = 28;

// ---------------------------------------------------------------------------
// Генерация .docx из текста
// ---------------------------------------------------------------------------

/**
 * Генерирует .docx файл из текста с заголовком.
 *
 * Формат:
 *   - Заголовок: название (Heading1, Times New Roman, 14pt, жирный, по центру)
 *   - Тело: абзацы через \n\n, Times New Roman 12pt
 *   - Поля страницы: ГОСТ Р 7.0.97-2016 (2/2/3/1.5 см)
 */
export async function generateDocx(
  filledText: string,
  templateName: string,
): Promise<Buffer> {
  const paragraphs = filledText.split(/\n\n+/);

  const children: Paragraph[] = [
    // Заголовок документа
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [
        new TextRun({
          text: templateName,
          font: DEFAULT_FONT,
          size: HEADING_SIZE,
          bold: true,
        }),
      ],
    }),
  ];

  // Тело документа — каждый абзац как Paragraph
  for (const text of paragraphs) {
    const trimmed = text.trim();
    if (!trimmed) continue;

    children.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [
          new TextRun({
            text: trimmed,
            font: DEFAULT_FONT,
            size: BODY_SIZE,
          }),
        ],
      }),
    );
  }

  const doc = new DocxDocument({
    sections: [
      {
        properties: {
          page: { margin: PAGE_MARGINS },
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}

// ---------------------------------------------------------------------------
// Экспорт диалога в .docx
// ---------------------------------------------------------------------------

/** Сообщение для экспорта в .docx. */
export interface ExportMessage {
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
}

/**
 * Генерирует .docx файл из истории диалога.
 *
 * Структура:
 *   - Заголовок: название диалога + дата
 *   - Каждое сообщение: роль (жирный) + текст
 *   - Между сообщениями — горизонтальный разделитель (нижняя граница абзаца)
 */
export async function generateConversationDocx(
  title: string,
  date: Date,
  messages: ExportMessage[],
): Promise<Buffer> {
  const dateStr = date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const roleLabels: Record<string, string> = {
    USER: 'Юрист',
    ASSISTANT: 'AI-ассистент',
    SYSTEM: 'Система',
  };

  const children: Paragraph[] = [
    // Заголовок
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [
        new TextRun({
          text: `${title}`,
          font: DEFAULT_FONT,
          size: HEADING_SIZE,
          bold: true,
        }),
      ],
    }),
    // Дата под заголовком
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 360 },
      children: [
        new TextRun({
          text: dateStr,
          font: DEFAULT_FONT,
          size: BODY_SIZE,
          italics: true,
          color: '666666',
        }),
      ],
    }),
  ];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]!;
    const label = roleLabels[msg.role] ?? msg.role;

    // Метка роли (жирный)
    children.push(
      new Paragraph({
        spacing: { before: 120, after: 60 },
        children: [
          new TextRun({
            text: `${label}:`,
            font: DEFAULT_FONT,
            size: BODY_SIZE,
            bold: true,
          }),
        ],
      }),
    );

    // Текст сообщения — разбиваем по абзацам
    const contentParagraphs = msg.content.split(/\n\n+/);
    for (const para of contentParagraphs) {
      const trimmed = para.trim();
      if (!trimmed) continue;

      children.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [
            new TextRun({
              text: trimmed,
              font: DEFAULT_FONT,
              size: BODY_SIZE,
            }),
          ],
        }),
      );
    }

    // Горизонтальный разделитель между сообщениями (кроме последнего)
    if (i < messages.length - 1) {
      children.push(
        new Paragraph({
          spacing: { before: 120, after: 120 },
          border: {
            bottom: {
              style: BorderStyle.SINGLE,
              size: 1,
              color: 'CCCCCC',
              space: 6,
            },
          },
          children: [],
        }),
      );
    }
  }

  const doc = new DocxDocument({
    sections: [
      {
        properties: {
          page: { margin: PAGE_MARGINS },
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}
