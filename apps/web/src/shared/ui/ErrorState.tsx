import React from 'react';
import { useTranslation } from '../i18n/index.js';
import { Button } from './Button.js';

export interface ErrorStateProps {
  title: string;
  description: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ title, description, onRetry, className = '' }: ErrorStateProps) {
  const { t } = useTranslation();

  return (
    <div className={`ui-state-box ${className}`} role="alert">
      <h3 className="ui-state-title">{title}</h3>
      <p className="ui-state-desc">{description}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  );
}
