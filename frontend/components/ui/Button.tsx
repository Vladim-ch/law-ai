import { type ButtonHTMLAttributes, forwardRef } from 'react';

/** Варианты стилизации кнопки */
type ButtonVariant = 'primary' | 'secondary' | 'ghost';

/** Размеры кнопки */
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/** Классы для вариантов оформления */
const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white hover:bg-brand-500 active:bg-brand-700 focus-visible:ring-brand-500',
  secondary:
    'bg-surface-elevated text-gray-200 hover:bg-gray-700 active:bg-gray-600 focus-visible:ring-gray-500',
  ghost:
    'bg-transparent text-gray-400 hover:bg-surface-tertiary hover:text-gray-200 focus-visible:ring-gray-500',
};

/** Классы для размеров */
const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1.5 text-xs rounded-md',
  md: 'px-3.5 py-2 text-sm rounded-lg',
  lg: 'px-5 py-2.5 text-base rounded-lg',
};

/**
 * Базовый компонент кнопки.
 * Поддерживает варианты: primary, secondary, ghost.
 * Поддерживает размеры: sm, md, lg.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className = '', children, ...props }, ref) => {
    const baseStyles =
      'inline-flex items-center font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:pointer-events-none disabled:opacity-50';

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
