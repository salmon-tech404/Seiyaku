import { MANDATE_V1_INPUTS, RULE_FAILURE_CODES } from '@seiyaku/circuit-tools';
import type { Reason } from './types.js';

export const REASON_MESSAGES: Record<'en' | 'vi', Record<string, string>> = {
  en: {
    ERR_INSANE_PARAMS:
      'Trade parameters failed sanity checks (positive amounts, valid tokens, valid fee tier, sufficient balance)',
    ERR_TOKEN_NOT_ALLOWED: 'Token is not on the vault allowlist',
    ERR_MANDATE_EXPIRED: 'Mandate expiration timestamp has passed',
    ERR_VAULT_FROZEN: 'Vault is currently frozen',
    ERR_TRADE_SIZE_EXCEEDED: 'Trade amount exceeds maximum per-trade limit',
    ERR_DAILY_VOLUME_EXCEEDED: 'Daily buy volume limit exceeded for current UTC day',
    ERR_DAILY_TRADES_EXCEEDED: 'Daily trade count limit reached for current UTC day',
    ERR_COOLDOWN_ACTIVE: 'Cooldown period after last buy has not elapsed',
    ERR_NOT_EXIT: 'Trade is not a valid exit trade',
  },
  vi: {
    ERR_INSANE_PARAMS:
      'Thông số giao dịch không hợp lệ (số tiền phải dương, token hợp lệ, phí hợp lệ, số dư đủ)',
    ERR_TOKEN_NOT_ALLOWED: 'Token không nằm trong danh sách cho phép của vault',
    ERR_MANDATE_EXPIRED: 'Thời hạn ủy thác của vault đã kết thúc',
    ERR_VAULT_FROZEN: 'Vault hiện đang bị đóng băng',
    ERR_TRADE_SIZE_EXCEEDED: 'Số tiền giao dịch vượt quá hạn mức tối đa mỗi lệnh',
    ERR_DAILY_VOLUME_EXCEEDED: 'Hạn mức khối lượng mua hàng ngày theo giờ UTC đã vượt quá',
    ERR_DAILY_TRADES_EXCEEDED: 'Số lượng giao dịch tối đa trong ngày đã đạt giới hạn',
    ERR_COOLDOWN_ACTIVE: 'Thời gian chờ sau lệnh mua trước đó chưa kết thúc',
    ERR_NOT_EXIT: 'Giao dịch không phải là lệnh thoát rủi ro hợp lệ',
  },
};

/**
 * Builds translated Reason objects for every failing rule bit.
 */
export function explainInputBits(bits: number, lang: 'en' | 'vi' = 'en'): Reason[] {
  const isSane = (bits & (1 << 0)) !== 0;
  const isExit = (bits & (1 << 8)) !== 0;

  const reasons: Reason[] = [];

  function addReason(index: number) {
    const name = MANDATE_V1_INPUTS[index];
    if (name === undefined) return;
    const code = RULE_FAILURE_CODES[name];
    const text = REASON_MESSAGES[lang][code] || REASON_MESSAGES.en[code] || `Rule failure: ${name}`;
    reasons.push({
      code,
      name,
      text,
      bitIndex: index,
    });
  }

  if (!isSane) {
    addReason(0);
  }

  // If exit and sane, allowed: no failure reasons
  if (isExit) {
    return reasons;
  }

  // If buy, examine failing bits 1 through 7
  for (let i = 1; i <= 7; i++) {
    const bitSet = (bits & (1 << i)) !== 0;
    if (!bitSet) {
      addReason(i);
    }
  }

  return reasons;
}
