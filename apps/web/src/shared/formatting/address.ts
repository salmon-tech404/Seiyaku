/**
 * Shortens an Ethereum address to 0x1234...5678 format.
 */
export function formatShortAddress(address: string, leadingChars = 6, trailingChars = 4): string {
  if (!address || address.length <= leadingChars + trailingChars) {
    return address;
  }
  return `${address.slice(0, leadingChars)}...${address.slice(-trailingChars)}`;
}
