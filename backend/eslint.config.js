// =============================================================================
// ESLint flat-config (ESLint 9+).
// =============================================================================
// Минимальный набор правил: ESLint recommended + typescript-eslint recommended.
// Плагины для импортов/форматирования намеренно не включены — форматирование
// делает Prettier, а импорт-порядок разумнее навести отдельным патчем позже,
// когда стабилизируется структура модулей.
// =============================================================================

import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Игнорируем артефакты сборки и зависимости.
  {
    ignores: ['dist/**', 'node_modules/**', 'prisma/migrations/**'],
  },

  // База от ESLint.
  js.configs.recommended,

  // База от typescript-eslint (без type-aware правил — они требуют
  // parserOptions.project и замедляют линт; включим, когда появится
  // реальный объём кода).
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Node-глобали (process, Buffer, console и т.п.).
        process: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },

    rules: {
      // Консоль в прод-коде не используем — логгер Pino. Warn вместо error,
      // чтобы в отладке можно было временно оставить console.
      'no-console': 'warn',

      // Неиспользуемые переменные: игнорируем, если имя начинается с `_`
      // (удобно для аргументов колбэков, которые обязаны быть по сигнатуре).
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // any разрешаем только через явный ts-expect-error комментарий.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
);
