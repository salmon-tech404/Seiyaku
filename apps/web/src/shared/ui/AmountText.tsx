import React from 'react';
import { formatAmount } from '../formatting/amount.js';

export interface AmountTextProps {
  amount: bigint;
  decimals?: number;
  unit?: string;
  className?: string;
}

export function AmountText({ amount, decimals = 6, unit, className = '' }: AmountTextProps) {
  const formatted = formatAmount(amount, decimals, unit);

  return <span className={`ui-amount-text ${className}`}>{formatted}</span>;
}
