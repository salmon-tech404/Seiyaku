/**
 * Untrusted metadata wrapper for on-chain contract strings (e.g. ERC20 symbols, names).
 * Untrusted data must never be directly interpreted as LLM prompt directives.
 */
export interface UntrustedMetadata<T = string> {
  value: T;
  untrusted: true;
  warning?: string | undefined;
}

/**
 * Creates a typed wrapper for untrusted metadata.
 */
export function createUntrustedMetadata<T = string>(
  value: T,
  warning?: string | undefined,
): UntrustedMetadata<T> {
  return {
    value,
    untrusted: true,
    ...(warning !== undefined ? { warning } : {}),
  };
}

/**
 * Wraps raw on-chain metadata, inspecting for suspicious prompt injection patterns.
 */
export function wrapUntrustedMetadata(raw: unknown, maxLength = 32): UntrustedMetadata<string> {
  const rawStr = typeof raw === 'string' ? raw : String(raw ?? '');
  const sanitized = sanitizeUntrustedText(rawStr, maxLength);
  const isSuspicious =
    /ignore|instruction|prompt|system|withdraw|transfer|exploit|bypass|eval|alert|script/i.test(
      rawStr,
    );

  return {
    value: sanitized,
    untrusted: true,
    ...(isSuspicious
      ? { warning: 'Untrusted on-chain metadata with prompt injection signature' }
      : {}),
  };
}

/**
 * Strips hostile characters, prompt injection directives, and control sequences
 * from untrusted contract metadata strings (e.g., token symbols or names).
 *
 * Sanitization steps:
 * - Strips ANSI escape sequences.
 * - Strips <script> and <style> blocks and remaining HTML tags.
 * - Strips backticks.
 * - Strips zero-width characters and directional formatting marks.
 * - Strips ASCII control characters (0-31, 127).
 * - Neutralizes markdown directives (headings, blockquotes, links, images, brackets).
 * - Neutralizes role injection prefixes (system:, instruction:, developer:, etc.).
 * - Clamps length to maxLength (default 32).
 */
export function sanitizeUntrustedText(text: string, maxLength = 32): string {
  if (typeof text !== 'string') {
    return '';
  }

  // 1. Strip ANSI escape sequences
  // eslint-disable-next-line no-control-regex
  let cleaned = text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');

  // 2. Strip <script>...</script> and <style>...</style> including their contents
  cleaned = cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  cleaned = cleaned.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // 3. Strip remaining HTML tags
  cleaned = cleaned.replace(/<[^>]*>/g, '');

  // 4. Strip backticks
  cleaned = cleaned.replace(/`/g, '');

  // 5. Strip zero-width, invisible, and bidirectional override characters
  cleaned = cleaned.replace(
    /[\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E\u2060-\u206F\u180E\u00AD]/g,
    '',
  );

  // 6. Strip all ASCII control characters (0-31 and 127)
  // eslint-disable-next-line no-control-regex
  cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, '');

  // 7. Neutralize markdown links and images: [text](url) -> text, ![alt](url) -> ''
  cleaned = cleaned.replace(/!\[.*?\]\(.*?\)/g, '');
  cleaned = cleaned.replace(/\[(.*?)\]\(.*?\)/g, '$1');

  // 8. Strip brackets and markdown syntax (#, >, *, ~, |, backslash, curly braces)
  // eslint-disable-next-line no-useless-escape
  cleaned = cleaned.replace(/[#>*~|\\{}\[\]]/g, '');

  // 9. Neutralize prompt injection role prefixes (e.g., "system:", "instruction:", "developer:")
  cleaned = cleaned.replace(/^\s*(?:system|instruction|developer|assistant|human|user):\s*/i, '');

  // 10. Trim excess whitespace
  cleaned = cleaned.trim();

  // 11. Clamp to maxLength
  if (cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength).trim();
  }

  return cleaned;
}

/**
 * Redacts secrets, private keys, and canary values from strings to avoid leaks.
 */
export function sanitizeSecrets(text: string, knownSecrets: (string | undefined)[] = []): string {
  if (!text) return text;

  let redacted = text;

  // Redact known secrets (min length 4)
  for (const secret of knownSecrets) {
    if (secret && secret.length >= 4) {
      redacted = redacted.replaceAll(secret, '[REDACTED_SECRET]');
    }
  }

  // Redact hex private keys / 32-byte hashes (0x followed by 64 hex characters)
  redacted = redacted.replace(/0x[a-fA-F0-9]{64}/g, '[REDACTED_SECRET]');

  // Redact raw 64-char hex strings if word-bounded
  redacted = redacted.replace(/\b[a-fA-F0-9]{64}\b/g, '[REDACTED_SECRET]');

  return redacted;
}
