import React, { useState, useId } from 'react';
import { useTranslation } from '../i18n/index.js';

export interface TooltipProps {
  content: string;
  children?: React.ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const tooltipId = useId();
  const { t } = useTranslation();

  return (
    <span className="ui-tooltip-container">
      <button
        type="button"
        className="ui-tooltip-trigger"
        aria-describedby={visible ? tooltipId : undefined}
        aria-label={t('common.help')}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setVisible(false);
          }
        }}
      >
        {children ?? '?'}
      </button>
      {visible && (
        <span id={tooltipId} role="tooltip" className="ui-tooltip-content">
          {content}
        </span>
      )}
    </span>
  );
}
