/**
 * Сервис шаблонов юридических документов.
 *
 * Функции:
 *   - CRUD для шаблонов (Template)
 *   - Seed предустановленных шаблонов (договор оказания услуг, NDA, поставка)
 *   - Заполнение шаблона параметрами (fillTemplate)
 *   - Генерация .docx файла (generateDocx)
 *   - LLM-доработка заполненного шаблона (generateWithLLM)
 */

import type { PrismaClient, Template } from '@prisma/client';
import type OpenAI from 'openai';
import {
  Document as DocxDocument,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from 'docx';

import { getSystemMessage } from '../lib/system-prompt.js';
import { streamChat, chat } from '../lib/llm.js';
import { getDocument, parseDocumentText } from './document.js';

// ---------------------------------------------------------------------------
// Типы параметров шаблона
// ---------------------------------------------------------------------------

/** Описание одного параметра шаблона (хранится в JSONB-поле `parameters`). */
export interface TemplateParameter {
  key: string;
  label: string;
  type: 'string' | 'date' | 'text';
  required: boolean;
  default?: string;
}

// ---------------------------------------------------------------------------
// Константы: тела шаблонов
// ---------------------------------------------------------------------------

const SERVICE_CONTRACT_BODY = `ДОГОВОР ОКАЗАНИЯ УСЛУГ № {{contract_number}}

г. Москва                                                                                              {{contract_date}}

{{executor_name}}, ИНН {{executor_inn}}, именуемое в дальнейшем «Исполнитель», с одной стороны, и {{customer_name}}, ИНН {{customer_inn}}, именуемое в дальнейшем «Заказчик», с другой стороны, совместно именуемые «Стороны», заключили настоящий Договор о нижеследующем:

1. ПРЕДМЕТ ДОГОВОРА

1.1. Исполнитель обязуется по заданию Заказчика оказать следующие услуги: {{service_description}} (далее — «Услуги»), а Заказчик обязуется принять и оплатить Услуги в порядке и на условиях, предусмотренных настоящим Договором.

1.2. Срок оказания Услуг: {{deadline}}.

2. ПРАВА И ОБЯЗАННОСТИ СТОРОН

2.1. Исполнитель обязуется:
   а) оказать Услуги надлежащего качества в установленный срок;
   б) незамедлительно информировать Заказчика о возникновении обстоятельств, препятствующих надлежащему исполнению обязательств;
   в) предоставить Заказчику акт оказанных услуг в течение 5 (пяти) рабочих дней после завершения оказания Услуг.

2.2. Заказчик обязуется:
   а) обеспечить Исполнителя необходимой информацией и документами для оказания Услуг;
   б) принять оказанные Услуги и подписать акт оказанных услуг в течение 5 (пяти) рабочих дней с момента его получения либо направить мотивированный отказ;
   в) оплатить Услуги в порядке, предусмотренном разделом 3 настоящего Договора.

3. СТОИМОСТЬ УСЛУГ И ПОРЯДОК РАСЧЁТОВ

3.1. Стоимость Услуг составляет {{price}} ({{price}}) рублей, НДС не облагается (применяется УСН).

3.2. Оплата производится в безналичном порядке путём перечисления денежных средств на расчётный счёт Исполнителя в течение 10 (десяти) банковских дней с момента подписания акта оказанных услуг.

4. ОТВЕТСТВЕННОСТЬ СТОРОН

4.1. За нарушение сроков оказания Услуг Исполнитель уплачивает Заказчику пеню в размере {{penalty_percent}}% от стоимости Услуг за каждый день просрочки, но не более 10% от стоимости Услуг.

4.2. За нарушение сроков оплаты Заказчик уплачивает Исполнителю пеню в размере {{penalty_percent}}% от суммы задолженности за каждый день просрочки.

4.3. Стороны освобождаются от ответственности за неисполнение обязательств, если оно явилось следствием обстоятельств непреодолимой силы (форс-мажор), определяемых в соответствии со ст. 401 ГК РФ.

5. ПОРЯДОК РАЗРЕШЕНИЯ СПОРОВ

5.1. Все споры и разногласия, возникающие в связи с исполнением настоящего Договора, Стороны будут стремиться разрешить путём переговоров. Срок ответа на претензию — 15 (пятнадцать) рабочих дней.

5.2. При невозможности урегулирования споров путём переговоров они подлежат рассмотрению в Арбитражном суде г. Москвы в соответствии с действующим законодательством Российской Федерации.

6. ЗАКЛЮЧИТЕЛЬНЫЕ ПОЛОЖЕНИЯ

6.1. Настоящий Договор вступает в силу с момента его подписания и действует до полного исполнения Сторонами своих обязательств.

6.2. Договор составлен в двух экземплярах, имеющих одинаковую юридическую силу, по одному для каждой из Сторон.

РЕКВИЗИТЫ И ПОДПИСИ СТОРОН

Исполнитель:                                          Заказчик:
{{executor_name}}                              {{customer_name}}
ИНН: {{executor_inn}}                          ИНН: {{customer_inn}}

___________________ / ____________         ___________________ / ____________`;

const NDA_BODY = `СОГЛАШЕНИЕ О НЕРАЗГЛАШЕНИИ (NDA) № {{nda_number}}

г. Москва                                                                                              {{nda_date}}

{{disclosing_party}}, именуемое в дальнейшем «Раскрывающая сторона», с одной стороны, и {{receiving_party}}, именуемое в дальнейшем «Получающая сторона», с другой стороны, совместно именуемые «Стороны», заключили настоящее Соглашение о нижеследующем:

1. ПРЕДМЕТ СОГЛАШЕНИЯ

1.1. Настоящее Соглашение регулирует порядок передачи и защиты конфиденциальной информации, передаваемой Раскрывающей стороной Получающей стороне в целях: {{purpose}}.

1.2. Под конфиденциальной информацией понимается любая информация, переданная одной Стороной другой Стороне в письменной, устной, электронной или иной форме, включая, но не ограничиваясь: коммерческая тайна, технические данные, финансовая информация, бизнес-планы, клиентская база, условия сделок.

2. ОБЯЗАТЕЛЬСТВА ПОЛУЧАЮЩЕЙ СТОРОНЫ

2.1. Получающая сторона обязуется:
   а) не разглашать конфиденциальную информацию третьим лицам без предварительного письменного согласия Раскрывающей стороны;
   б) использовать конфиденциальную информацию исключительно в целях, указанных в п. 1.1;
   в) обеспечить защиту конфиденциальной информации от несанкционированного доступа с той же степенью заботливости, с какой она защищает собственную конфиденциальную информацию, но не менее разумной степени;
   г) незамедлительно уведомить Раскрывающую сторону о любом факте несанкционированного раскрытия или использования конфиденциальной информации.

2.2. Обязательства по неразглашению не распространяются на информацию, которая:
   а) являлась общедоступной на момент раскрытия;
   б) стала общедоступной после раскрытия не по вине Получающей стороны;
   в) была независимо разработана Получающей стороной;
   г) получена от третьего лица без обязательств о конфиденциальности;
   д) подлежит раскрытию в силу требований закона или по решению суда.

3. СРОК ДЕЙСТВИЯ

3.1. Настоящее Соглашение вступает в силу с момента подписания и действует в течение {{confidentiality_period}} лет.

3.2. Обязательства по сохранению конфиденциальности сохраняют силу в течение {{confidentiality_period}} лет после прекращения действия настоящего Соглашения.

4. ОТВЕТСТВЕННОСТЬ

4.1. В случае нарушения обязательств по настоящему Соглашению Получающая сторона обязана возместить Раскрывающей стороне все причинённые убытки в соответствии со ст. 15 ГК РФ.

4.2. Штраф за каждый подтверждённый факт нарушения конфиденциальности составляет {{penalty_amount}} рублей. Уплата штрафа не освобождает от обязанности возмещения убытков в части, не покрытой штрафом.

5. ПОРЯДОК РАЗРЕШЕНИЯ СПОРОВ

5.1. Споры по настоящему Соглашению разрешаются путём переговоров. Срок ответа на претензию — 10 (десять) рабочих дней.

5.2. При недостижении согласия спор передаётся на рассмотрение в Арбитражный суд г. Москвы.

6. ЗАКЛЮЧИТЕЛЬНЫЕ ПОЛОЖЕНИЯ

6.1. Настоящее Соглашение составлено в двух экземплярах, по одному для каждой из Сторон.

6.2. К настоящему Соглашению применяется законодательство Российской Федерации, в том числе положения ГК РФ о коммерческой тайне и Федеральный закон от 29.07.2004 № 98-ФЗ «О коммерческой тайне».

РЕКВИЗИТЫ И ПОДПИСИ СТОРОН

Раскрывающая сторона:                         Получающая сторона:
{{disclosing_party}}                           {{receiving_party}}

___________________ / ____________         ___________________ / ____________`;

const SUPPLY_CONTRACT_BODY = `ДОГОВОР ПОСТАВКИ № {{contract_number}}

г. Москва                                                                                              {{contract_date}}

{{supplier_name}}, именуемое в дальнейшем «Поставщик», с одной стороны, и {{buyer_name}}, именуемое в дальнейшем «Покупатель», с другой стороны, совместно именуемые «Стороны», заключили настоящий Договор о нижеследующем:

1. ПРЕДМЕТ ДОГОВОРА

1.1. Поставщик обязуется передать, а Покупатель — принять и оплатить следующий товар: {{goods_description}} (далее — «Товар»).

1.2. Количество Товара: {{quantity}}.

1.3. Цена за единицу Товара: {{unit_price}} рублей.

1.4. Общая стоимость Товара по настоящему Договору составляет {{total_price}} рублей, НДС не облагается (применяется УСН) / в т.ч. НДС 20%.

2. УСЛОВИЯ ПОСТАВКИ

2.1. Срок поставки: {{delivery_deadline}}.

2.2. Адрес доставки: {{delivery_address}}.

2.3. Поставка осуществляется силами и за счёт Поставщика. Датой исполнения обязательства по поставке считается дата подписания товарной накладной (ТОРГ-12) или универсального передаточного документа (УПД) Покупателем.

2.4. Право собственности на Товар переходит к Покупателю в момент подписания товарной накладной (ст. 223 ГК РФ).

3. КАЧЕСТВО ТОВАРА

3.1. Качество Товара должно соответствовать техническим условиям, ГОСТам или иным стандартам, действующим на территории Российской Федерации.

3.2. На Товар предоставляется гарантия качества сроком 12 (двенадцать) месяцев с даты поставки.

3.3. В случае обнаружения недостатков Покупатель направляет Поставщику рекламацию в письменной форме в течение 10 (десяти) рабочих дней с момента обнаружения. Поставщик обязан устранить недостатки или заменить Товар в течение 15 (пятнадцати) рабочих дней с момента получения рекламации (ст. 475 ГК РФ).

4. ПОРЯДОК РАСЧЁТОВ

4.1. Оплата производится в безналичном порядке путём перечисления денежных средств на расчётный счёт Поставщика.

4.2. Покупатель производит оплату в течение 10 (десяти) банковских дней с момента подписания товарной накладной.

5. ОТВЕТСТВЕННОСТЬ СТОРОН

5.1. За нарушение сроков поставки Поставщик уплачивает Покупателю пеню в размере 0,1% от стоимости непоставленного Товара за каждый день просрочки, но не более 10% от общей стоимости Товара.

5.2. За нарушение сроков оплаты Покупатель уплачивает Поставщику пеню в размере 0,1% от суммы задолженности за каждый день просрочки.

5.3. Стороны освобождаются от ответственности в случае действия обстоятельств непреодолимой силы в соответствии со ст. 401 ГК РФ.

6. ПОРЯДОК РАЗРЕШЕНИЯ СПОРОВ

6.1. Стороны обязуются принимать все меры к разрешению споров путём переговоров. Обязательный претензионный порядок — срок ответа на претензию 15 (пятнадцать) рабочих дней.

6.2. При невозможности урегулирования споров путём переговоров они подлежат рассмотрению в Арбитражном суде г. Москвы.

7. ЗАКЛЮЧИТЕЛЬНЫЕ ПОЛОЖЕНИЯ

7.1. Настоящий Договор вступает в силу с момента его подписания и действует до полного исполнения Сторонами обязательств.

7.2. Договор составлен в двух экземплярах, имеющих одинаковую юридическую силу.

РЕКВИЗИТЫ И ПОДПИСИ СТОРОН

Поставщик:                                            Покупатель:
{{supplier_name}}                              {{buyer_name}}

___________________ / ____________         ___________________ / ____________`;

// ---------------------------------------------------------------------------
// Seed-данные: описание параметров каждого шаблона
// ---------------------------------------------------------------------------

const SERVICE_CONTRACT_PARAMS: TemplateParameter[] = [
  { key: 'contract_number', label: 'Номер договора', type: 'string', required: true },
  { key: 'contract_date', label: 'Дата договора', type: 'date', required: true },
  { key: 'executor_name', label: 'Наименование Исполнителя', type: 'string', required: true },
  { key: 'executor_inn', label: 'ИНН Исполнителя', type: 'string', required: false },
  { key: 'customer_name', label: 'Наименование Заказчика', type: 'string', required: true },
  { key: 'customer_inn', label: 'ИНН Заказчика', type: 'string', required: false },
  { key: 'service_description', label: 'Описание услуг', type: 'text', required: true },
  { key: 'price', label: 'Стоимость (руб.)', type: 'string', required: true },
  { key: 'deadline', label: 'Срок оказания услуг', type: 'string', required: true },
  { key: 'penalty_percent', label: 'Пеня за просрочку (%)', type: 'string', required: false, default: '0.1' },
];

const NDA_PARAMS: TemplateParameter[] = [
  { key: 'nda_number', label: 'Номер соглашения', type: 'string', required: true },
  { key: 'nda_date', label: 'Дата', type: 'date', required: true },
  { key: 'disclosing_party', label: 'Раскрывающая сторона', type: 'string', required: true },
  { key: 'receiving_party', label: 'Получающая сторона', type: 'string', required: true },
  { key: 'purpose', label: 'Цель раскрытия информации', type: 'text', required: true },
  { key: 'confidentiality_period', label: 'Срок конфиденциальности (лет)', type: 'string', required: true, default: '3' },
  { key: 'penalty_amount', label: 'Штраф за нарушение (руб.)', type: 'string', required: false },
];

const SUPPLY_CONTRACT_PARAMS: TemplateParameter[] = [
  { key: 'contract_number', label: 'Номер договора', type: 'string', required: true },
  { key: 'contract_date', label: 'Дата', type: 'date', required: true },
  { key: 'supplier_name', label: 'Наименование Поставщика', type: 'string', required: true },
  { key: 'buyer_name', label: 'Наименование Покупателя', type: 'string', required: true },
  { key: 'goods_description', label: 'Наименование и описание товара', type: 'text', required: true },
  { key: 'quantity', label: 'Количество', type: 'string', required: true },
  { key: 'unit_price', label: 'Цена за единицу (руб.)', type: 'string', required: true },
  { key: 'total_price', label: 'Общая стоимость (руб.)', type: 'string', required: true },
  { key: 'delivery_address', label: 'Адрес доставки', type: 'string', required: true },
  { key: 'delivery_deadline', label: 'Срок поставки', type: 'string', required: true },
];

/** Предустановленные шаблоны для seed. */
const DEFAULT_TEMPLATES = [
  {
    name: 'Договор оказания услуг',
    category: 'Договор',
    templateBody: SERVICE_CONTRACT_BODY,
    parameters: SERVICE_CONTRACT_PARAMS,
  },
  {
    name: 'Соглашение о неразглашении (NDA)',
    category: 'Соглашение',
    templateBody: NDA_BODY,
    parameters: NDA_PARAMS,
  },
  {
    name: 'Договор поставки',
    category: 'Договор',
    templateBody: SUPPLY_CONTRACT_BODY,
    parameters: SUPPLY_CONTRACT_PARAMS,
  },
] as const;

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

interface SeedResult {
  found: number;
  created: number;
}

/**
 * Создаёт предустановленные шаблоны, если они отсутствуют в БД.
 * Идемпотентная операция — проверяет по полю `name`.
 *
 * Для seed-шаблонов используется первый ADMIN-пользователь в системе.
 * Если пользователей нет — пропускаем seed (шаблоны создадутся при
 * первом запуске после регистрации администратора).
 */
export async function seedDefaultTemplates(
  prisma: PrismaClient,
): Promise<SeedResult> {
  // Ищем пользователя-администратора для привязки createdById
  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
    select: { id: true },
  });

  // Если нет ни одного ADMIN — берём любого пользователя
  const fallbackUser = admin ?? await prisma.user.findFirst({
    select: { id: true },
  });

  if (!fallbackUser) {
    // Нет пользователей — seed невозможен, вернём нули
    return { found: 0, created: 0 };
  }

  let found = 0;
  let created = 0;

  for (const tpl of DEFAULT_TEMPLATES) {
    const existing = await prisma.template.findFirst({
      where: { name: tpl.name },
      select: { id: true },
    });

    if (existing) {
      found++;
      continue;
    }

    await prisma.template.create({
      data: {
        name: tpl.name,
        category: tpl.category,
        templateBody: tpl.templateBody,
        parameters: tpl.parameters as unknown as object,
        createdById: fallbackUser.id,
      },
    });

    created++;
  }

  return { found, created };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

interface ListTemplatesParams {
  category?: string;
  limit: number;
  offset: number;
}

interface ListTemplatesResult {
  templates: Pick<Template, 'id' | 'name' | 'category' | 'parameters' | 'createdAt'>[];
  total: number;
}

/** Список шаблонов с пагинацией и опциональной фильтрацией по категории. */
export async function listTemplates(
  prisma: PrismaClient,
  params: ListTemplatesParams,
): Promise<ListTemplatesResult> {
  const where = params.category ? { category: params.category } : {};

  const [templates, total] = await Promise.all([
    prisma.template.findMany({
      where,
      select: {
        id: true,
        name: true,
        category: true,
        parameters: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
      take: params.limit,
      skip: params.offset,
    }),
    prisma.template.count({ where }),
  ]);

  return { templates, total };
}

/** Получить шаблон по ID (включая тело шаблона). */
export async function getTemplate(
  prisma: PrismaClient,
  id: string,
): Promise<Template | null> {
  return prisma.template.findUnique({ where: { id } });
}

interface CreateTemplateData {
  name: string;
  category: string;
  templateBody: string;
  parameters: TemplateParameter[];
  createdById: string;
}

/** Создать пользовательский шаблон. */
export async function createTemplate(
  prisma: PrismaClient,
  data: CreateTemplateData,
): Promise<Template> {
  return prisma.template.create({
    data: {
      name: data.name,
      category: data.category,
      templateBody: data.templateBody,
      parameters: data.parameters as unknown as object,
      createdById: data.createdById,
    },
  });
}

/**
 * Удалить шаблон.
 * Удалять может только создатель или ADMIN.
 *
 * @returns true — удалено, false — не найден или нет прав.
 */
export async function deleteTemplate(
  prisma: PrismaClient,
  id: string,
  userId: string,
  userRole: string,
): Promise<boolean> {
  const template = await prisma.template.findUnique({
    where: { id },
    select: { id: true, createdById: true },
  });

  if (!template) return false;

  // Только создатель или ADMIN
  if (template.createdById !== userId && userRole !== 'ADMIN') {
    return false;
  }

  await prisma.template.delete({ where: { id } });
  return true;
}

// ---------------------------------------------------------------------------
// Заполнение шаблона
// ---------------------------------------------------------------------------

/**
 * Заменяет плейсхолдеры `{{key}}` в тексте шаблона на значения из `params`.
 * Возвращает заполненный текст.
 */
export function fillTemplate(
  templateBody: string,
  params: Record<string, string>,
): string {
  return templateBody.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    return params[key] ?? `{{${key}}}`;
  });
}

/**
 * Проверяет обязательные параметры шаблона.
 * Возвращает массив ключей отсутствующих обязательных параметров.
 */
export function validateRequiredParams(
  templateParams: TemplateParameter[],
  providedParams: Record<string, string>,
): string[] {
  const missing: string[] = [];

  for (const param of templateParams) {
    if (!param.required) continue;

    const value = providedParams[param.key];
    // Если значение не передано и нет default — считаем пропущенным
    if ((!value || value.trim() === '') && !param.default) {
      missing.push(param.key);
    }
  }

  return missing;
}

/**
 * Заполняет параметры с учётом default-значений.
 * Возвращает итоговый набор параметров.
 */
export function mergeWithDefaults(
  templateParams: TemplateParameter[],
  providedParams: Record<string, string>,
): Record<string, string> {
  const merged: Record<string, string> = { ...providedParams };

  for (const param of templateParams) {
    if (param.default && (!merged[param.key] || merged[param.key]!.trim() === '')) {
      merged[param.key] = param.default;
    }
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Генерация .docx
// ---------------------------------------------------------------------------

/** Размеры полей в twips (1 см = 567 twips). */
const PAGE_MARGINS = {
  top: 2 * 567,       // 2 см
  bottom: 2 * 567,    // 2 см
  left: 3 * 567,      // 3 см
  right: 1.5 * 567,   // 1.5 см
};

/**
 * Генерирует .docx файл из заполненного текста.
 *
 * Формат:
 *   - Заголовок: название шаблона (Heading1, Times New Roman, 14pt)
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
          font: 'Times New Roman',
          size: 28, // 14pt (размер в полупунктах)
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
            font: 'Times New Roman',
            size: 24, // 12pt
          }),
        ],
      }),
    );
  }

  const doc = new DocxDocument({
    sections: [
      {
        properties: {
          page: {
            margin: PAGE_MARGINS,
          },
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}

// ---------------------------------------------------------------------------
// LLM-доработка шаблона
// ---------------------------------------------------------------------------

/**
 * Заполняет шаблон и отправляет в LLM для доработки.
 * Возвращает async-генератор токенов (для SSE-стриминга).
 */
export function generateWithLLM(
  filledText: string,
  userPrompt?: string,
): AsyncGenerator<string> {
  const prompt = userPrompt
    || 'проверь на соответствие законодательству РФ и улучши формулировки';

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    getSystemMessage(),
    {
      role: 'user',
      content: `Доработай следующий юридический документ.

Задание: ${prompt}

Документ:
---
${filledText}
---

Верни доработанный текст документа целиком. Сохрани структуру и форматирование. Если вносишь изменения — поясни их в конце документа в разделе «Внесённые изменения».`,
    },
  ];

  return streamChat(messages);
}

// ---------------------------------------------------------------------------
// Извлечение шаблона из документа через LLM
// ---------------------------------------------------------------------------

/** Параметр, извлечённый LLM из текста документа. */
export interface ExtractedParameter {
  key: string;       // snake_case: executor_name, contract_date
  label: string;     // "Наименование исполнителя"
  type: 'string' | 'date' | 'text';
  value: string;     // найденное значение в документе
  required: boolean;
}

/** Результат извлечения шаблона из документа. */
export interface ExtractedTemplate {
  parameters: ExtractedParameter[];
  templateBody: string;   // текст с {{плейсхолдерами}}
  originalText: string;   // оригинальный текст для превью
}

/** Промпт для извлечения параметров и создания шаблона из документа. */
function buildExtractionPrompt(contentText: string): string {
  return `Проанализируй юридический документ и создай из него шаблон для повторного использования.

Задача:
1. Найди все конкретные значения, которые нужно заменить на параметры: имена/наименования сторон, ИНН, адреса, даты, суммы, сроки, описания предмета договора.
2. Замени каждое найденное значение на плейсхолдер {{key}} в тексте документа.
3. Для каждого параметра укажи: ключ (snake_case, латиница), название на русском, тип (string/date/text), найденное значение, обязательность.

ВАЖНО:
- Ключи параметров — латиница, snake_case (например: executor_name, contract_date, price)
- Не трогай юридические формулировки и ссылки на статьи — заменяй только конкретные данные
- Если значение встречается несколько раз — используй один и тот же ключ
- Тип "date" для дат, "text" для длинных описаний (>100 символов), "string" для остального

Верни ответ СТРОГО в формате JSON (без markdown, без пояснений, только JSON):
{
  "parameters": [
    { "key": "executor_name", "label": "Наименование исполнителя", "type": "string", "value": "ИП Иванов И.И.", "required": true },
    { "key": "contract_date", "label": "Дата договора", "type": "date", "value": "01.06.2025", "required": true }
  ],
  "templateBody": "Текст документа с {{executor_name}} и {{contract_date}}..."
}

Документ:
---
${contentText}
---`;
}

// ---------------------------------------------------------------------------
// Robust JSON-парсер для ответов LLM
// ---------------------------------------------------------------------------

/** Структура, ожидаемая от LLM в JSON-ответе. */
interface LLMExtractedJSON {
  parameters: ExtractedParameter[];
  templateBody: string;
}

/**
 * Извлекает и парсит JSON из ответа LLM.
 *
 * LLM (Qwen 7B) может вернуть JSON в разных обёртках:
 * 1. Чистый JSON
 * 2. JSON в markdown code-блоке (```json ... ```)
 * 3. Текст с пояснениями + JSON внутри
 * 4. Полный мусор — ошибка
 */
export function parseExtractedJSON(llmResponse: string): LLMExtractedJSON {
  const trimmed = llmResponse.trim();

  // 1. Попробовать JSON.parse напрямую
  try {
    const parsed = JSON.parse(trimmed);
    validateExtractedJSON(parsed);
    return parsed;
  } catch { /* продолжаем */ }

  // 2. Найти ```json ... ``` и парсить содержимое
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch?.[1]) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      validateExtractedJSON(parsed);
      return parsed;
    } catch { /* продолжаем */ }
  }

  // 3. Найти первый { ... последний } и парсить
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const jsonCandidate = trimmed.slice(firstBrace, lastBrace + 1);
    try {
      const parsed = JSON.parse(jsonCandidate);
      validateExtractedJSON(parsed);
      return parsed;
    } catch { /* продолжаем */ }
  }

  // 4. Ничего не сработало
  throw new Error('Не удалось извлечь параметры из документа: LLM вернул невалидный ответ');
}

/**
 * Проверяет структуру распарсенного JSON.
 * Бросает ошибку, если структура не соответствует ожиданиям.
 */
function validateExtractedJSON(data: unknown): asserts data is LLMExtractedJSON {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Ответ LLM не является объектом');
  }

  const obj = data as Record<string, unknown>;

  if (!Array.isArray(obj.parameters)) {
    throw new Error('Поле "parameters" отсутствует или не является массивом');
  }

  if (typeof obj.templateBody !== 'string' || obj.templateBody.length === 0) {
    throw new Error('Поле "templateBody" отсутствует или пустое');
  }

  // Валидируем каждый параметр
  for (const param of obj.parameters) {
    if (typeof param !== 'object' || param === null) {
      throw new Error('Элемент parameters не является объектом');
    }
    const p = param as Record<string, unknown>;
    if (typeof p.key !== 'string' || typeof p.label !== 'string') {
      throw new Error('Параметр должен содержать поля key и label');
    }
    if (!['string', 'date', 'text'].includes(p.type as string)) {
      throw new Error(`Неизвестный тип параметра: ${p.type}`);
    }
  }
}

/** Температура для извлечения — максимально детерминированный ответ. */
const EXTRACTION_TEMPERATURE = 0.1;

/**
 * Извлекает шаблон из загруженного документа через LLM.
 *
 * Алгоритм:
 * 1. Загружает документ из БД (проверяет userId)
 * 2. Проверяет наличие contentText
 * 3. Отправляет текст в LLM с промптом для извлечения параметров
 * 4. Парсит JSON-ответ LLM (с fallback для markdown-обёрток)
 * 5. Возвращает ExtractedTemplate
 *
 * @param prisma — Prisma-клиент
 * @param llmChat — функция chat() для вызова LLM
 * @param documentId — UUID загруженного документа
 * @param userId — UUID текущего пользователя (для проверки доступа)
 */
export async function extractTemplateFromDocument(
  prisma: PrismaClient,
  llmChat: typeof chat,
  documentId: string,
  userId: string,
): Promise<ExtractedTemplate> {
  // Загружаем документ с проверкой принадлежности пользователю
  const document = await getDocument(prisma, documentId, userId);

  if (!document) {
    throw Object.assign(
      new Error('Документ не найден или нет доступа'),
      { statusCode: 404 },
    );
  }

  if (!document.contentText) {
    throw Object.assign(
      new Error('Текст документа не извлечён. Загрузите документ в поддерживаемом формате (docx, pdf, txt)'),
      { statusCode: 400 },
    );
  }

  return extractTemplateFromText(llmChat, document.contentText);
}

/**
 * Извлекает шаблон из файла напрямую (без предварительного upload в БД).
 *
 * Парсит текст из буфера файла через parseDocumentText,
 * затем вызывает LLM для извлечения параметров.
 *
 * @param llmChat — функция chat() для вызова LLM
 * @param buffer — буфер файла
 * @param fileType — расширение файла (docx, pdf, txt, rtf)
 * @param _filename — имя файла (для логирования, пока не используется)
 */
export async function extractTemplateFromFile(
  llmChat: typeof chat,
  buffer: Buffer,
  fileType: string,
  _filename: string,
): Promise<ExtractedTemplate> {
  const contentText = await parseDocumentText(buffer, fileType);

  if (!contentText || contentText.trim().length === 0) {
    throw Object.assign(
      new Error('Не удалось извлечь текст из файла'),
      { statusCode: 400 },
    );
  }

  return extractTemplateFromText(llmChat, contentText);
}

/**
 * Общая логика извлечения шаблона: отправка текста в LLM и парсинг ответа.
 */
async function extractTemplateFromText(
  llmChat: typeof chat,
  contentText: string,
): Promise<ExtractedTemplate> {
  const prompt = buildExtractionPrompt(contentText);

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    {
      role: 'user',
      content: prompt,
    },
  ];

  const llmResponse = await llmChat(messages, { temperature: EXTRACTION_TEMPERATURE });

  const extracted = parseExtractedJSON(llmResponse);

  return {
    parameters: extracted.parameters,
    templateBody: extracted.templateBody,
    originalText: contentText,
  };
}
