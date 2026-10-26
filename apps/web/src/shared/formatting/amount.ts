/**
 * Formats a bigint token amount with its decimals using Intl.NumberFormat.
 * @param amount - Raw token amount in base units
 * @param decimals - Token decimals (default: 6 for USDC)
 * @param unit - Optional symbol string (e.g. 'USDC')
 */
export function formatAmount(amount: bigint, decimals: number = 6, unit?: string): string {
  const isNegative = amount < 0n;
  const absVal = isNegative ? -amount : amount;

  const divisor = 10n ** BigInt(decimals);
  const integerPart = absVal / divisor;
  const fractionPart = absVal % divisor;

  // Format integer part with locale grouping
  const intStr = new Intl.NumberFormat('en-US').format(integerPart);

  if (decimals === 0) {
    const formatted = `${isNegative ? '-' : ''}${intStr}`;
    return unit ? `${formatted} ${unit}` : formatted;
  }

  // Pad fraction with leading zeroes up to decimals digits
  let fracStr = fractionPart.toString().padStart(decimals, '0');
  // Trim trailing zeroes, but keep at least 2 decimals for currency unless it's an integer
  fracStr = fracStr.replace(/0+$/, '');
  if (fracStr.length === 0) {
    fracStr = '00';
  } else if (fracStr.length === 1) {
    fracStr = `${fracStr}0`;
  }

  const formatted = `${isNegative ? '-' : ''}${intStr}.${fracStr}`;
  return unit ? `${formatted} ${unit}` : formatted;
}
