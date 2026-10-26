import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  computeInputBits,
  decide,
  explainBlock,
  packEvalInput,
  unpackEvalOutput,
  mandateV1Netlist,
  evaluate,
  type Limits,
  type VaultState,
  type TradeRequest,
} from './index.js';

describe('P2-T01 Reference Logic & Vector Tests', () => {
  it('packEvalInput and unpackEvalOutput satisfy roundtrip and fail-closed property', () => {
    // 0 unpacks to false
    const p0 = packEvalInput(0);
    expect(p0.length).toBe(2);
    expect(p0[0]).toBe(0);
    expect(p0[1]).toBe(0);

    // unpack tests
    expect(unpackEvalOutput(null)).toBe(false);
    expect(unpackEvalOutput(undefined)).toBe(false);
    expect(unpackEvalOutput(new Uint8Array([]))).toBe(false);
    expect(unpackEvalOutput(new Uint8Array([0]))).toBe(false);
    expect(unpackEvalOutput(new Uint8Array([1]))).toBe(true);
    expect(unpackEvalOutput(new Uint8Array([2]))).toBe(false);
    expect(unpackEvalOutput(new Uint8Array([3]))).toBe(true); // lowest bit is 1
  });

  it('mandate-v1.json vector file matches simulator for all 512 inputs', () => {
    const vectorPath = path.resolve('contracts/test/vectors/mandate-v1.json');
    expect(fs.existsSync(vectorPath)).toBe(true);

    const data = JSON.parse(fs.readFileSync(vectorPath, 'utf8'));
    expect(data.vectors.length).toBe(512);

    const netlist = mandateV1Netlist();

    for (let i = 0; i < 512; i++) {
      const v = data.vectors[i];
      expect(v.inputBits).toBe(i);

      const simBit = evaluate(netlist, BigInt(i));
      const expectedAllow = simBit === 1n ? 1 : 0;
      expect(v.allow).toBe(expectedAllow);
      expect(decide(i)).toBe(expectedAllow === 1);

      // Verify explanation logic
      const failed = explainBlock(i);
      expect(v.failed).toEqual(failed);
    }
  });

  it('scenarios.json contains exactly 60 scenarios and all match decide & computeInputBits', () => {
    const scenariosPath = path.resolve('contracts/test/vectors/scenarios.json');
    expect(fs.existsSync(scenariosPath)).toBe(true);

    const data = JSON.parse(fs.readFileSync(scenariosPath, 'utf8'));
    expect(data.scenarios.length).toBe(60);

    for (const sc of data.scenarios) {
      const balancesMap = new Map<string, bigint>();
      for (const [k, v] of Object.entries(sc.state.balances)) {
        balancesMap.set(k, BigInt(v as string));
      }

      const state: VaultState = {
        frozen: sc.state.frozen,
        dayIndex: BigInt(sc.state.dayIndex),
        tradesToday: sc.state.tradesToday,
        buyVolumeTodayBase: BigInt(sc.state.buyVolumeTodayBase),
        lastBuyAt: BigInt(sc.state.lastBuyAt),
        allowedTokens: new Set(sc.state.allowedTokens),
        balances: balancesMap,
        baseToken: sc.state.baseToken,
        now: BigInt(sc.state.now),
      };

      const limits: Limits = {
        maxTradeBase: BigInt(sc.limits.maxTradeBase),
        maxDailyBase: BigInt(sc.limits.maxDailyBase),
        maxTradesPerDay: sc.limits.maxTradesPerDay,
        cooldownSec: BigInt(sc.limits.cooldownSec),
        expiresAt: BigInt(sc.limits.expiresAt),
        withdrawDelaySec: BigInt(sc.limits.withdrawDelaySec),
      };

      const request: TradeRequest = {
        tokenIn: sc.request.tokenIn,
        tokenOut: sc.request.tokenOut,
        feeTier: sc.request.feeTier,
        amountIn: BigInt(sc.request.amountIn),
        amountOutMin: BigInt(sc.request.amountOutMin),
        deadline: BigInt(sc.request.deadline),
      };

      const res = computeInputBits(state, limits, request);
      expect(res.kind).toBe(sc.expected.kind);
      expect(res.bits).toBe(sc.expected.bits);

      const isAllowed = decide(res.bits);
      expect(isAllowed ? 1 : 0).toBe(sc.expected.allow);

      const failedCodes = explainBlock(res.bits);
      expect(failedCodes).toEqual(sc.expected.failed);
    }
  });

  it('property test: 1000 seeded random inputs never produce a contradiction with formula', () => {
    // Seeded pseudo-random generator (LCG)
    let seed = 123456789;
    function rand() {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    }

    function randInt(min: number, max: number) {
      return Math.floor(rand() * (max - min + 1)) + min;
    }

    const netlist = mandateV1Netlist();

    for (let testIter = 0; testIter < 1000; testIter++) {
      const bits = randInt(0, 511);

      // 1. Bit breakdown
      const sane = (bits & (1 << 0)) !== 0;
      const tokenAllowed = (bits & (1 << 1)) !== 0;
      const notExpired = (bits & (1 << 2)) !== 0;
      const notFrozen = (bits & (1 << 3)) !== 0;
      const sizeOk = (bits & (1 << 4)) !== 0;
      const dailyOk = (bits & (1 << 5)) !== 0;
      const tradesOk = (bits & (1 << 6)) !== 0;
      const cooldownOk = (bits & (1 << 7)) !== 0;
      const isExit = (bits & (1 << 8)) !== 0;

      // Spec formula:
      // allow = sane AND ( isExit OR ( tokenAllowed AND notExpired AND notFrozen AND sizeOk AND dailyOk AND tradesOk AND cooldownOk ) )
      const buyAllowed =
        tokenAllowed && notExpired && notFrozen && sizeOk && dailyOk && tradesOk && cooldownOk;
      const expectedFormulaAllow = sane && (isExit || buyAllowed);

      // Simulator evaluation
      const simOut = evaluate(netlist, BigInt(bits)) === 1n;
      const decideOut = decide(bits);

      expect(simOut).toBe(expectedFormulaAllow);
      expect(decideOut).toBe(expectedFormulaAllow);

      // Explain consistency
      const failed = explainBlock(bits);
      if (expectedFormulaAllow) {
        expect(failed.length).toBe(0);
      } else {
        expect(failed.length).toBeGreaterThan(0);
      }
    }
  });
});
