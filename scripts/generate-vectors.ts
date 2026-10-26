import fs from 'node:fs';
import path from 'node:path';
import {
  MANDATE_V1_NETLIST_HASH,
  decide,
  explainBlock,
  computeInputBits,
  type VaultState,
  type Limits,
  type TradeRequest,
} from '../packages/circuit-tools/src/index.js';

interface ScenarioVector {
  id: string;
  description: string;
  state: {
    frozen: boolean;
    dayIndex: string;
    tradesToday: number;
    buyVolumeTodayBase: string;
    lastBuyAt: string;
    allowedTokens: string[];
    balances: Record<string, string>;
    baseToken: string;
    now: string;
  };
  limits: {
    maxTradeBase: string;
    maxDailyBase: string;
    maxTradesPerDay: number;
    cooldownSec: string;
    expiresAt: string;
    withdrawDelaySec: string;
  };
  request: {
    tokenIn: string;
    tokenOut: string;
    feeTier: number;
    amountIn: string;
    amountOutMin: string;
    deadline: string;
  };
  expected: {
    kind: 'buy' | 'exit' | 'invalid';
    bits: number;
    allow: 0 | 1;
    failed: string[];
  };
}

const USDC = '0xb6ceceab302e2e4948951ee7843fc24e92933061';
const WOKB = '0xe538905cf8410324e03a5a23c1c177a474d59b2b';
const UNKNOWN_TOKEN = '0x1111111111111111111111111111111111111111';

export function generateAll512Vectors() {
  const vectors = [];
  for (let i = 0; i < 512; i++) {
    const isAllowed = decide(i);
    const failedCodes = explainBlock(i);
    vectors.push({
      inputBits: i,
      allow: isAllowed ? 1 : 0,
      failed: failedCodes,
    });
  }

  return {
    generator: 'scripts/generate-vectors.ts',
    circuitHash: MANDATE_V1_NETLIST_HASH,
    packingRule: 'two bytes, little-endian bit order',
    totalCombinations: 512,
    vectors,
  };
}

export function buildScenarios(): ScenarioVector[] {
  const scenarios: ScenarioVector[] = [];

  const defaultLimits: Limits = {
    maxTradeBase: 50n * 1_000_000n, // 50 USDC
    maxDailyBase: 200n * 1_000_000n, // 200 USDC
    maxTradesPerDay: 5,
    cooldownSec: 60n,
    expiresAt: 2_000_000_000n,
    withdrawDelaySec: 3600n,
  };

  const defaultBalances = new Map<string, bigint>([
    [USDC, 1000n * 1_000_000n],
    [WOKB, 50n * 1_000_000_000_000_000_000n],
  ]);

  const defaultAllowed = new Set<string>([WOKB]);

  function makeState(overrides: Partial<VaultState> = {}): VaultState {
    return {
      frozen: false,
      dayIndex: 1000n,
      tradesToday: 0,
      buyVolumeTodayBase: 0n,
      lastBuyAt: 0n,
      allowedTokens: defaultAllowed,
      balances: defaultBalances,
      baseToken: USDC as `0x${string}`,
      now: 1000n * 86400n + 3600n, // 1 hour into day 1000
      ...overrides,
    };
  }

  function makeRequest(overrides: Partial<TradeRequest> = {}): TradeRequest {
    return {
      tokenIn: USDC as `0x${string}`,
      tokenOut: WOKB as `0x${string}`,
      feeTier: 500,
      amountIn: 10n * 1_000_000n, // 10 USDC
      amountOutMin: 1n,
      deadline: 1000n * 86400n + 3600n + 300n, // +300s
      ...overrides,
    };
  }

  function addScenario(id: string, desc: string, s: VaultState, l: Limits, r: TradeRequest) {
    const res = computeInputBits(s, l, r);
    const allow = decide(res.bits) ? 1 : 0;
    const failed = explainBlock(res.bits);

    const balancesObj: Record<string, string> = {};
    for (const [k, v] of s.balances.entries()) {
      balancesObj[k] = v.toString();
    }

    scenarios.push({
      id,
      description: desc,
      state: {
        frozen: s.frozen,
        dayIndex: s.dayIndex.toString(),
        tradesToday: s.tradesToday,
        buyVolumeTodayBase: s.buyVolumeTodayBase.toString(),
        lastBuyAt: s.lastBuyAt.toString(),
        allowedTokens: Array.from(s.allowedTokens),
        balances: balancesObj,
        baseToken: s.baseToken,
        now: s.now.toString(),
      },
      limits: {
        maxTradeBase: l.maxTradeBase.toString(),
        maxDailyBase: l.maxDailyBase.toString(),
        maxTradesPerDay: l.maxTradesPerDay,
        cooldownSec: l.cooldownSec.toString(),
        expiresAt: l.expiresAt.toString(),
        withdrawDelaySec: l.withdrawDelaySec.toString(),
      },
      request: {
        tokenIn: r.tokenIn,
        tokenOut: r.tokenOut,
        feeTier: r.feeTier,
        amountIn: r.amountIn.toString(),
        amountOutMin: r.amountOutMin.toString(),
        deadline: r.deadline.toString(),
      },
      expected: {
        kind: res.kind,
        bits: res.bits,
        allow,
        failed,
      },
    });
  }

  // 1. Normal first buy of the day (valid)
  addScenario(
    'SC_01',
    'First buy of the day with clean counters',
    makeState(),
    defaultLimits,
    makeRequest(),
  );

  // 2. Second buy after cooldown elapsed (valid)
  addScenario(
    'SC_02',
    'Second buy of day after cooldown passed',
    makeState({
      tradesToday: 1,
      buyVolumeTodayBase: 10n * 1_000_000n,
      lastBuyAt: 1000n * 86400n + 3600n - 120n,
    }),
    defaultLimits,
    makeRequest(),
  );

  // 3. Second buy hitting active cooldown (blocked)
  addScenario(
    'SC_03',
    'Second buy hitting active cooldown',
    makeState({
      tradesToday: 1,
      buyVolumeTodayBase: 10n * 1_000_000n,
      lastBuyAt: 1000n * 86400n + 3600n - 30n, // 30s ago, cooldown 60s
    }),
    defaultLimits,
    makeRequest(),
  );

  // 4. Daily volume exactly at the limit (valid)
  addScenario(
    'SC_04',
    'Buy bringing daily volume exactly to limit',
    makeState({
      buyVolumeTodayBase: 190n * 1_000_000n, // + 10 = 200 (limit)
      lastBuyAt: 1000n * 86400n + 3600n - 100n,
    }),
    defaultLimits,
    makeRequest({ amountIn: 10n * 1_000_000n }),
  );

  // 5. Daily volume one over the limit (blocked)
  addScenario(
    'SC_05',
    'Buy exceeding daily volume limit by 1 wei',
    makeState({
      buyVolumeTodayBase: 190n * 1_000_000n + 1n,
      lastBuyAt: 1000n * 86400n + 3600n - 100n,
    }),
    defaultLimits,
    makeRequest({ amountIn: 10n * 1_000_000n }),
  );

  // 6. Max trade size exactly at limit (valid)
  addScenario(
    'SC_06',
    'Trade amount exactly equal to maxTradeBase',
    makeState(),
    defaultLimits,
    makeRequest({ amountIn: 50n * 1_000_000n }),
  );

  // 7. Max trade size one over limit (blocked)
  addScenario(
    'SC_07',
    'Trade amount 1 wei over maxTradeBase',
    makeState(),
    defaultLimits,
    makeRequest({ amountIn: 50n * 1_000_000n + 1n }),
  );

  // 8. Daily trades counter at limit (blocked)
  addScenario(
    'SC_08',
    'Daily trades already reached maxTradesPerDay',
    makeState({ tradesToday: 5 }), // limit is 5
    defaultLimits,
    makeRequest(),
  );

  // 9. UTC midnight roll - counters reset automatically (valid)
  addScenario(
    'SC_09',
    'UTC midnight roll resets day counters on read',
    makeState({
      dayIndex: 999n,
      tradesToday: 5,
      buyVolumeTodayBase: 200n * 1_000_000n,
      now: 1000n * 86400n + 100n, // rolled into day 1000
    }),
    defaultLimits,
    makeRequest(),
  );

  // 10. Mandate expired (blocked for buy)
  addScenario(
    'SC_10',
    'Mandate expired blocks buy',
    makeState({ now: 2_000_000_001n }),
    defaultLimits,
    makeRequest({ deadline: 2_000_000_001n + 300n }),
  );

  // 11. Mandate frozen (blocked for buy)
  addScenario(
    'SC_11',
    'Vault frozen blocks buy',
    makeState({ frozen: true }),
    defaultLimits,
    makeRequest(),
  );

  // 12. Token not on allowlist (blocked for buy)
  addScenario(
    'SC_12',
    'Target token not on allowlist',
    makeState({ allowedTokens: new Set() }),
    defaultLimits,
    makeRequest(),
  );

  // 13. Exit trade while frozen (valid)
  addScenario(
    'SC_13',
    'Exit trade allowed even when vault is frozen',
    makeState({ frozen: true }),
    defaultLimits,
    makeRequest({
      tokenIn: WOKB as `0x${string}`,
      tokenOut: USDC as `0x${string}`,
      amountIn: 1n * 1_000_000_000_000_000_000n,
    }),
  );

  // 14. Exit trade while expired (valid)
  addScenario(
    'SC_14',
    'Exit trade allowed even when mandate expired',
    makeState({ now: 2_000_000_001n }),
    defaultLimits,
    makeRequest({
      tokenIn: WOKB as `0x${string}`,
      tokenOut: USDC as `0x${string}`,
      amountIn: 1n * 1_000_000_000_000_000_000n,
      deadline: 2_000_000_001n + 300n,
    }),
  );

  // 15. Exit trade of token not on allowlist (valid de-risking)
  addScenario(
    'SC_15',
    'Exit of unlisted token allowed to recover funds to base',
    makeState({
      allowedTokens: new Set(),
      balances: new Map([
        [UNKNOWN_TOKEN, 100n * 1_000_000n],
        [USDC, 1000n * 1_000_000n],
      ]),
    }),
    defaultLimits,
    makeRequest({
      tokenIn: UNKNOWN_TOKEN as `0x${string}`,
      tokenOut: USDC as `0x${string}`,
      amountIn: 10n * 1_000_000n,
    }),
  );

  // 16. AmountIn exceeds vault balance (insane)
  addScenario(
    'SC_16',
    'Trade amount exceeds tokenIn balance',
    makeState({ balances: new Map([[USDC, 5n * 1_000_000n]]) }),
    defaultLimits,
    makeRequest({ amountIn: 10n * 1_000_000n }),
  );

  // 17. Deadline in the past (insane)
  addScenario(
    'SC_17',
    'Deadline is before current timestamp',
    makeState(),
    defaultLimits,
    makeRequest({ deadline: 1000n * 86400n + 3600n - 1n }),
  );

  // 18. Deadline more than 600s in future (insane)
  addScenario(
    'SC_18',
    'Deadline is more than 600 seconds ahead',
    makeState(),
    defaultLimits,
    makeRequest({ deadline: 1000n * 86400n + 3600n + 601n }),
  );

  // 19. Both tokens are base token (insane)
  addScenario(
    'SC_19',
    'Both tokenIn and tokenOut are baseToken',
    makeState(),
    defaultLimits,
    makeRequest({ tokenIn: USDC as `0x${string}`, tokenOut: USDC as `0x${string}` }),
  );

  // 20. Neither token is base token (insane)
  addScenario(
    'SC_20',
    'Neither token is baseToken',
    makeState({
      balances: new Map([
        [WOKB, 50n * 1_000_000_000_000_000_000n],
        [UNKNOWN_TOKEN, 50n * 1_000_000_000_000_000_000n],
      ]),
    }),
    defaultLimits,
    makeRequest({ tokenIn: WOKB as `0x${string}`, tokenOut: UNKNOWN_TOKEN as `0x${string}` }),
  );

  // 21. Unsupported fee tier (insane)
  addScenario(
    'SC_21',
    'Fee tier is not 500, 3000, or 10000',
    makeState(),
    defaultLimits,
    makeRequest({ feeTier: 100 }),
  );

  // 22. Zero amountIn (insane)
  addScenario(
    'SC_22',
    'amountIn is zero',
    makeState(),
    defaultLimits,
    makeRequest({ amountIn: 0n }),
  );

  // 23. Zero amountOutMin (insane)
  addScenario(
    'SC_23',
    'amountOutMin is zero',
    makeState(),
    defaultLimits,
    makeRequest({ amountOutMin: 0n }),
  );

  // 24. Exit trade with zero amountIn (insane)
  addScenario(
    'SC_24',
    'Exit trade with zero amountIn',
    makeState(),
    defaultLimits,
    makeRequest({ tokenIn: WOKB as `0x${string}`, tokenOut: USDC as `0x${string}`, amountIn: 0n }),
  );

  // Generate scenarios 25..60 systematically covering boundary permutations
  for (let i = 25; i <= 60; i++) {
    const feeChoice = i % 3 === 0 ? 500 : i % 3 === 1 ? 3000 : 10000;
    const isExitVar = i % 2 === 0;
    const cooldownOffset = i % 4 === 0 ? 30n : 70n;
    const now = 1000n * 86400n + BigInt(i * 100);

    const s = makeState({
      now,
      lastBuyAt: now - cooldownOffset,
      frozen: i === 35 || i === 45,
      tradesToday: i % 6,
      buyVolumeTodayBase: BigInt((i % 5) * 40) * 1_000_000n,
    });

    const r = makeRequest({
      tokenIn: isExitVar ? (WOKB as `0x${string}`) : (USDC as `0x${string}`),
      tokenOut: isExitVar ? (USDC as `0x${string}`) : (WOKB as `0x${string}`),
      feeTier: feeChoice,
      amountIn: BigInt(5 + (i % 10)) * 1_000_000n,
      deadline: now + 300n,
    });

    addScenario(
      `SC_${i.toString().padStart(2, '0')}`,
      `Parameterized scenario ${i}: ${isExitVar ? 'exit' : 'buy'}, feeTier ${feeChoice}, cooldown offset ${cooldownOffset}s`,
      s,
      defaultLimits,
      r,
    );
  }

  return scenarios;
}

export function writeVectorFiles() {
  const vectorsDir = path.resolve('contracts/test/vectors');
  fs.mkdirSync(vectorsDir, { recursive: true });

  const all512 = generateAll512Vectors();
  const mandatePath = path.join(vectorsDir, 'mandate-v1.json');
  fs.writeFileSync(mandatePath, JSON.stringify(all512, null, 2) + '\n');
  console.log(`Wrote 512 truth table vectors to ${mandatePath}`);

  const scenarios = buildScenarios();
  const scenariosPath = path.join(vectorsDir, 'scenarios.json');
  fs.writeFileSync(
    scenariosPath,
    JSON.stringify(
      {
        generator: 'scripts/generate-vectors.ts',
        totalScenarios: scenarios.length,
        scenarios,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`Wrote ${scenarios.length} scenarios to ${scenariosPath}`);
}

// Run if called as CLI
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  writeVectorFiles();
}
