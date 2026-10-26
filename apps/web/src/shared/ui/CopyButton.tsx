import React, { useState } from 'react';
import { useTranslation } from '../i18n/index.js';
import { Button } from './Button.js';

export interface CopyButtonProps {
  textToCopy: string;
  className?: string;
}

export function CopyButton({ textToCopy, className = '' }: CopyButtonProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(textToCopy);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard write failed
    }
  };

  return (
    <Button
      variant="quiet"
      onClick={handleCopy}
      aria-label={copied ? t('common.copied') : t('common.copy')}
      className={`ui-copy-btn ${className}`}
    >
      <span>{copied ? t('common.copied') : t('common.copy')}</span>
    </Button>
  );
}
