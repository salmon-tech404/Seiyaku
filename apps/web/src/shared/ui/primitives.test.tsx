// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Countdown } from './Countdown.js';
import { FieldRow } from './FieldRow.js';
import { Button } from './Button.js';
import { Dialog } from './Dialog.js';

describe('UI Primitives', () => {
  describe('Countdown with fake timers', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('ticks down each second and calls onComplete when reached', () => {
      const now = Math.floor(Date.now() / 1000);
      const target = now + 3;
      const onComplete = vi.fn();

      render(<Countdown targetTimestampSec={target} onComplete={onComplete} />);

      expect(screen.getByText(/3s/i)).toBeDefined();

      // Advance by 1 second
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(onComplete).not.toHaveBeenCalled();

      // Advance by 2 more seconds (reaches 0)
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(onComplete).toHaveBeenCalled();
    });
  });

  describe('Tooltip and FieldRow keyboard behaviour', () => {
    it('shows tooltip on focus and hides on escape', () => {
      render(
        <FieldRow label="Max spend" tooltip="Maximum allowed base token spend">
          <input type="text" />
        </FieldRow>,
      );

      const trigger = screen.getByRole('button', { name: /help information/i });
      expect(screen.queryByRole('tooltip')).toBeNull();

      // Focus trigger
      fireEvent.focus(trigger);
      expect(screen.getByRole('tooltip')).toBeDefined();
      expect(screen.getByText('Maximum allowed base token spend')).toBeDefined();

      // Press Escape to dismiss
      fireEvent.keyDown(trigger, { key: 'Escape' });
      expect(screen.queryByRole('tooltip')).toBeNull();
    });
  });

  describe('Button component', () => {
    it('renders with variants and handles loading state', () => {
      const label = 'Submit';
      const { rerender } = render(<Button variant="primary">{label}</Button>);
      const btn = screen.getByRole('button', { name: label });
      expect(btn.className).toContain('ui-btn-primary');

      rerender(
        <Button variant="primary" loading>
          {label}
        </Button>,
      );
      expect(screen.getByText(/loading/i)).toBeDefined();
      expect(btn.hasAttribute('disabled')).toBe(true);
    });
  });

  describe('Dialog modal focus and escape handling', () => {
    it('renders dialog and handles escape key to close', () => {
      const onClose = vi.fn();
      const dialogTitle = 'Confirm trade';
      const body = 'Dialog body text';
      render(
        <Dialog open={true} onClose={onClose} title={dialogTitle}>
          <p>{body}</p>
        </Dialog>,
      );

      expect(screen.getByRole('dialog')).toBeDefined();
      expect(screen.getByText(dialogTitle)).toBeDefined();

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onClose).toHaveBeenCalled();
    });
  });
});
