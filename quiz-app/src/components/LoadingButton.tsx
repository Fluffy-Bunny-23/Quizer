'use client';

import { ButtonHTMLAttributes, ReactNode } from 'react';
import Icon from '@mdi/react';
import { mdiLoading } from '@mdi/js';

interface LoadingButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'accent';
  children: ReactNode;
}

export function LoadingButton({
  loading = false,
  variant = 'primary',
  children,
  className = '',
  disabled,
  ...props
}: LoadingButtonProps) {
  const baseStyles =
    'font-semibold py-3 px-6 rounded-lg shadow-lg flex items-center justify-center gap-2 transition-all duration-200 ease-out';

  const variantStyles = {
    primary: 'bg-primary text-white hover:bg-primary-light hover:shadow-xl hover:scale-105 active:scale-95',
    secondary:
      'bg-secondary text-white hover:opacity-90 hover:shadow-xl hover:scale-105 active:scale-95',
    accent: 'bg-accent text-black hover:opacity-90 hover:shadow-xl hover:scale-105 active:scale-95',
  };

  const loadingStyles = loading ? 'opacity-70 cursor-not-allowed' : '';
  const disabledStyles = disabled || loading ? 'opacity-50 cursor-not-allowed hover:scale-100' : '';

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${loadingStyles} ${disabledStyles} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading}
      {...props}
    >
      {loading && (
        <span className="inline-flex">
          <Icon path={mdiLoading} size={1} className="animate-spin" />
        </span>
      )}
      {children}
    </button>
  );
}
