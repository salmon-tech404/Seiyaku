import React from 'react';
import { useTranslation } from '../i18n/index.js';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'quiet';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  children: React.ReactNode;
}

export function Button({
  variant = 'secondary',
  loading = false,
  disabled,
  children,
  className = '',
  ...props
}: ButtonProps) {
  const { t } = useTranslation();

  return (
    <button
      type={props.type ?? 'button'}
      disabled={disabled || loading}
      className={`ui-btn ui-btn-${variant} ${className}`}
      {...props}
    >
      {loading ? (
        <>
          <span className="ui-spinner" aria-hidden="true" />
          <span>{t('common.loading')}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
