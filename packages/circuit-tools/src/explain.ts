import { MANDATE_V1_INPUTS, type MandateV1InputName } from './mandateV1.js';

/**
 * Standard stable codes for each failing rule.
 * These codes are consumed by the UI / agent SDK to map to translations.
 */
export const RULE_FAILURE_CODES: Record<MandateV1InputName, string> = {
  sane: 'ERR_INSANE_PARAMS',
  tokenAllowed: 'ERR_TOKEN_NOT_ALLOWED',
  notExpired: 'ERR_MANDATE_EXPIRED',
  notFrozen: 'ERR_VAULT_FROZEN',
  sizeOk: 'ERR_TRADE_SIZE_EXCEEDED',
  dailyOk: 'ERR_DAILY_VOLUME_EXCEEDED',
  tradesOk: 'ERR_DAILY_TRADES_EXCEEDED',
  cooldownOk: 'ERR_COOLDOWN_ACTIVE',
  isExit: 'ERR_NOT_EXIT',
};

/**
 * Explains blocked rules from the 9 input bits.
 * Returns a list of stable failure codes for rules that failed (bit = 0).
 * If isExit is 1 (bit 8 = 1), only sanity check matters for the allow decision;
 * if sane is 0, only ERR_INSANE_PARAMS is returned.
 * If isExit is 0 (buy), all failing conditions among bits 0..7 are returned.
 */
export function explainBlock(bits: number): string[] {
  const isSane = (bits & (1 << 0)) !== 0;
  const isExit = (bits & (1 << 8)) !== 0;

  const failedCodes: string[] = [];

  if (!isSane) {
    failedCodes.push(RULE_FAILURE_CODES.sane);
  }

  // If it's an exit trade and sane is satisfied, the trade is allowed (no failure codes)
  if (isExit) {
    return failedCodes;
  }

  // For a buy trade, examine bits 1 through 7
  for (let i = 1; i <= 7; i++) {
    const bitSet = (bits & (1 << i)) !== 0;
    if (!bitSet) {
      const name = MANDATE_V1_INPUTS[i];
      if (name) {
        failedCodes.push(RULE_FAILURE_CODES[name]);
      }
    }
  }

  return failedCodes;
}
