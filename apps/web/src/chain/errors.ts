import { decodeErrorResult, type Hex } from 'viem';
import { mandateVaultAbi, mandateVaultFactoryAbi } from './abi/index.js';
import { explainBlock } from '@seiyaku/circuit-tools';

export interface AppError {
  name: string;
  messageKey: string;
  params?: Record<string, string | number>;
  technicalDetails?: string;
}

const combinedAbi = [...mandateVaultAbi, ...mandateVaultFactoryAbi] as const;

export function decodeAppError(err: unknown): AppError {
  if (!err) {
    return {
      name: 'UnknownError',
      messageKey: 'error.unknown',
      params: { reason: 'Unknown error occurred' },
    };
  }

  // 1. Check for wallet user rejection
  const anyErr = err as {
    code?: number | string;
    message?: string;
    data?: unknown;
    cause?: unknown;
  };
  if (
    anyErr.code === 4001 ||
    anyErr.code === 'ACTION_REJECTED' ||
    (typeof anyErr.message === 'string' && anyErr.message.toLowerCase().includes('user rejected'))
  ) {
    return {
      name: 'UserRejected',
      messageKey: 'error.userRejected',
      technicalDetails: anyErr.message,
    };
  }

  // 2. Check if viem already decoded the error
  const checkViemDecoded = (
    obj: unknown,
  ): { errorName: string; args?: readonly unknown[] } | null => {
    if (!obj || typeof obj !== 'object') return null;
    const o = obj as Record<string, unknown>;
    if (typeof o.errorName === 'string') {
      return {
        errorName: o.errorName,
        args: Array.isArray(o.args) ? (o.args as readonly unknown[]) : undefined,
      };
    }
    if (o.data && typeof o.data === 'object') {
      const d = o.data as Record<string, unknown>;
      if (typeof d.errorName === 'string') {
        return {
          errorName: d.errorName,
          args: Array.isArray(d.args) ? (d.args as readonly unknown[]) : undefined,
        };
      }
    }
    if (o.cause) return checkViemDecoded(o.cause);
    return null;
  };

  const viemDecoded = checkViemDecoded(err);
  if (viemDecoded) {
    return formatCustomError(viemDecoded.errorName, viemDecoded.args, anyErr.message);
  }

  // 3. Extract revert data hex from viem error or cause
  const findData = (obj: unknown): Hex | undefined => {
    if (!obj || typeof obj !== 'object') return undefined;
    const o = obj as Record<string, unknown>;
    if (typeof o.data === 'string' && o.data.startsWith('0x')) return o.data as Hex;
    if (o.cause) return findData(o.cause);
    if (o.error) return findData(o.error);
    return undefined;
  };

  const errorDataHex = findData(err);

  // 4. Attempt decoding ABI custom errors from raw hex
  if (errorDataHex) {
    try {
      const decoded = decodeErrorResult({
        abi: combinedAbi,
        data: errorDataHex,
      });

      return formatCustomError(
        decoded.errorName,
        decoded.args,
        `Selector: ${errorDataHex.slice(0, 10)}, data: ${errorDataHex}`,
      );
    } catch {
      // Revert data was not an ABI custom error
    }
  }

  // 5. Check for network / RPC errors
  const msg = anyErr.message ?? String(err);
  if (
    msg.toLowerCase().includes('network') ||
    msg.toLowerCase().includes('timeout') ||
    msg.toLowerCase().includes('failed to fetch') ||
    msg.toLowerCase().includes('connection')
  ) {
    return {
      name: 'RpcFailure',
      messageKey: 'error.rpcFailure',
      technicalDetails: msg,
    };
  }

  return {
    name: 'GenericError',
    messageKey: 'error.unknown',
    params: { reason: msg.length > 120 ? `${msg.slice(0, 120)}...` : msg },
    technicalDetails: msg,
  };
}

function formatCustomError(
  errorName: string,
  args?: readonly unknown[],
  technicalDetails?: string,
): AppError {
  if (errorName === 'RuleBlocked') {
    const bits = Number(args?.[0] ?? 0);
    const explanation = explainBlock(bits);
    return {
      name: 'RuleBlocked',
      messageKey: 'error.RuleBlocked',
      params: {
        bits: `0x${bits.toString(16)}`,
        rules: explanation.join(', '),
      },
      technicalDetails: technicalDetails ?? `inputBits: ${bits}`,
    };
  }

  if (errorName === 'TooEarly') {
    const eta = String(args?.[0] ?? '');
    return {
      name: 'TooEarly',
      messageKey: 'error.TooEarly',
      params: { eta },
      technicalDetails: technicalDetails ?? `ETA: ${eta}`,
    };
  }

  return {
    name: errorName,
    messageKey: `error.${errorName}`,
    technicalDetails: technicalDetails ?? errorName,
  };
}
