/**
 * Evaluates binary input packing for MANDATE_V1 and other 9-bit circuits.
 * Packing rule (Candidate 1 / Little-Endian bit order):
 * Byte 0 holds bits 0..7
 * Byte 1 holds bit 8 (lowest bit)
 */

export function packEvalInput(bits: number): Uint8Array {
  const p = new Uint8Array(2);
  p[0] = bits & 0xff;
  p[1] = (bits >> 8) & 0xff;
  return p;
}

/**
 * Unpacks the processor eval return bytes.
 * Lowest bit of the first byte must be exactly 1 to allow.
 * Fails closed (returns false) if output is empty or malformed.
 */
export function unpackEvalOutput(output: Uint8Array | null | undefined): boolean {
  if (!output || output.length === 0) {
    return false;
  }
  const firstByte = output[0];
  if (firstByte === undefined) {
    return false;
  }
  return (firstByte & 1) === 1;
}
