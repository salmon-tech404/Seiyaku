// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ThemeProvider, useTheme } from './ThemeContext.js';

function ThemeConsumer() {
  const { theme, toggleTheme } = useTheme();
  const toggleLabel = 'Toggle';
  return (
    <div>
      <span data-testid="theme-val">{theme}</span>
      <button onClick={toggleTheme}>{toggleLabel}</button>
    </div>
  );
}

describe('ThemeContext and persistence fallback', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders with dark default and toggles theme', () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    const val = screen.getByTestId('theme-val');
    const initialTheme = val.textContent;

    fireEvent.click(screen.getByRole('button', { name: 'Toggle' }));
    expect(val.textContent).not.toBe(initialTheme);
  });

  it('falls back safely without throwing when localStorage throws an error', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: Local storage access denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(() => {
      render(
        <ThemeProvider>
          <ThemeConsumer />
        </ThemeProvider>,
      );
    }).not.toThrow();

    // Toggling should also not throw
    expect(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Toggle' }));
    }).not.toThrow();
  });
});
