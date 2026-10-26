import { describe, it, expect } from 'vitest';
import { encodeErrorResult } from 'viem';
import { decodeAppError } from './errors.js';
import { mandateVaultAbi } from './abi/index.js';

describe('decodeAppError', () => {
  it('decodes RuleBlocked with input bits and explained reasons', () => {
    // 0b000000001 = only bit 0 set (notAllowed, expired, frozen, sizeBad...)
    const errorHex = encodeErrorResult({
      abi: mandateVaultAbi,
      errorName: 'RuleBlocked',
      args: [1],
    });

    const appError = decodeAppError({ data: errorHex });
    expect(appError.name).toBe('RuleBlocked');
    expect(appError.messageKey).toBe('error.RuleBlocked');
    expect(appError.params?.bits).toBe('0x1');
    expect(appError.params?.rules).toBeDefined();
  });

  it('decodes TooEarly with eta parameter', () => {
    const errorHex = encodeErrorResult({
      abi: mandateVaultAbi,
      errorName: 'TooEarly',
      args: [1700000000n],
    });

    const appError = decodeAppError({ data: errorHex });
    expect(appError.name).toBe('TooEarly');
    expect(appError.messageKey).toBe('error.TooEarly');
    expect(appError.params?.eta).toBe('1700000000');
  });

  it('decodes all custom errors from the vault ABI', () => {
    const errorNames = [
      'NotOwner',
      'NotTrader',
      'NotOwnerOrTrader',
      'ZeroAddress',
      'InvalidLimits',
      'NotStricter',
      'NothingPending',
      'DepositCapExceeded',
      'CircuitChanged',
      'SwapMismatch',
      'TransferFailed',
      'AlreadyInitialized',
    ] as const;

    for (const errorName of errorNames) {
      const errorHex = encodeErrorResult({
        abi: mandateVaultAbi,
        errorName,
        args: [],
      });

      const appError = decodeAppError({ data: errorHex });
      expect(appError.name).toBe(errorName);
      expect(appError.messageKey).toBe(`error.${errorName}`);
    }
  });

  it('decodes wallet user rejection code 4001', () => {
    const userErr = { code: 4001, message: 'User rejected the transaction' };
    const appError = decodeAppError(userErr);
    expect(appError.name).toBe('UserRejected');
    expect(appError.messageKey).toBe('error.userRejected');
  });

  it('decodes wallet user rejection with string code', () => {
    const userErr = { code: 'ACTION_REJECTED', message: 'User cancelled request' };
    const appError = decodeAppError(userErr);
    expect(appError.name).toBe('UserRejected');
    expect(appError.messageKey).toBe('error.userRejected');
  });

  it('decodes RPC timeout and network failure errors', () => {
    const rpcErr = new Error(
      'HTTP request failed with status 504 Gateway Timeout: connection error',
    );
    const appError = decodeAppError(rpcErr);
    expect(appError.name).toBe('RpcFailure');
    expect(appError.messageKey).toBe('error.rpcFailure');
  });

  it('handles nested cause and unknown errors safely', () => {
    const nested = {
      cause: {
        error: {
          data: encodeErrorResult({
            abi: mandateVaultAbi,
            errorName: 'NotOwner',
            args: [],
          }),
        },
      },
    };

    const appError = decodeAppError(nested);
    expect(appError.name).toBe('NotOwner');
  });
});
