import React, { useEffect } from 'react';

export interface ToastProps {
  message: string;
  visible: boolean;
  onDismiss: () => void;
  durationMs?: number;
}

export function Toast({ message, visible, onDismiss, durationMs = 3000 }: ToastProps) {
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
  }, [visible, onDismiss, durationMs]);

  if (!visible) return null;

  return (
    <div className="ui-toast" role="status" aria-live="polite">
      {message}
    </div>
  );
}
