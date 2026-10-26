# Report P4-T01 — Agent SDK library and CLI

Status: DONE
Finished: 2026-10-26 22:10

## Summary for the owner (3–5 plain sentences, no jargon)

We built and verified the agent SDK library and CLI tool for automated trading and risk verification. The SDK connects to Seiyaku vaults on X Layer, evaluates local circuit logic alongside onchain previews, handles Quoter price quotes with bounded slippage, and supports cold emergency freezes and de-risking exits. Operator private keys are strictly loaded from environment variables and protected against leaking into logs or errors through automated sanitization. All checks, unit tests, and live fork smoke tests completed successfully.

## Files

Created:

- `packages/agent-sdk/src/types.ts` — Zod schemas and TypeScript types for client config, limits, check, and trade outcomes.
- `packages/agent-sdk/src/messages.ts` — English and Vietnamese translation dictionary for mandate rule failure codes.
- `packages/agent-sdk/src/quoter.ts` — Uniswap QuoterV2 integration with slippage bounds check.
- `packages/agent-sdk/src/client.ts` — AgentClient implementation with multi-RPC fallback, preview verification, trade execution, and freeze/tighten methods.
- `packages/agent-sdk/src/cli/args.ts` — Command-line argument parser.
- `packages/agent-sdk/src/cli/run.ts` — CLI command runner with standardized exit codes and secret scrubbing.
- `packages/agent-sdk/src/cli/main.ts` — CLI entrypoint wrapper.
- `packages/agent-sdk/bin/seiyaku-agent.js` — Executable node bin wrapper.
- `packages/agent-sdk/src/client.test.ts` — Vitest unit tests for SDK client and rule bit translations.
- `packages/agent-sdk/src/cli.test.ts` — Vitest tests for CLI commands, exit codes, JSON output, and canary key secrecy.
- `packages/agent-sdk/src/abi/quoterV2Abi.ts` — Generated ABI for Uniswap QuoterV2.
- `packages/agent-sdk/README.md` — Documentation for SDK and CLI usage, JSON schema, and exit codes.
- `scripts/agent-smoke.ts` — End-to-end smoke test executing against local X Layer Anvil fork.
- `apps/web/src/chain/abi/quoterV2Abi.ts` — Generated QuoterV2 ABI for web workspace parity.

Changed:

- `scripts/generate-abi.ts` — Updated to generate ABIs into both web app and agent-sdk packages.
- `scripts/check-abi.ts` — Updated to verify freshness across both web app and agent-sdk packages.
- `package.json` — Added `agent:smoke` script.
- `packages/agent-sdk/package.json` — Updated bin and test script paths.

Not touched on purpose:

- `contracts/src/*` — Preserved untouched per task instructions.
- `README.md` — Preserved untouched per task instructions.

Leftovers (renamed/replaced files you could not delete): none

## Commands run (raw output, unedited, trimmed only by "[...]" markers)

```bash
$ npm run typecheck
> typecheck
> npm --workspace=@seiyaku/circuit-tools run typecheck && npm --workspace=@seiyaku/agent-sdk run typecheck && npm --workspace=@seiyaku/web run typecheck

> @seiyaku/circuit-tools@0.1.0 typecheck
> tsc --noEmit

> @seiyaku/agent-sdk@0.1.0 typecheck
> tsc --noEmit

> @seiyaku/web@0.1.0 typecheck
> tsc -b
```

```bash
$ npx vitest run packages/agent-sdk
 RUN  v2.1.3 D:/18-hackathon/tapeOut

 ✓ packages/agent-sdk/src/client.test.ts  (11 tests) 10ms
 ✓ packages/agent-sdk/src/index.test.ts  (1 test) 2ms
 ✓ packages/agent-sdk/src/cli.test.ts  (8 tests) 1150ms

 Test Files  3 passed (3)
      Tests  20 passed (20)
   Start at  22:02:05
   Duration  1.90s (transform 217ms, setup 0ms, collect 1.33s, tests 1.16s, environment 0ms, prepare 311ms)
```

```bash
$ npm run agent:smoke
=== SEIYAKU AGENT SDK & CLI FORK SMOKE TEST ===

Anvil fork is already running on http://127.0.0.1:8545
[1/7] Deploying factory & circuit on fork...
=== Deploy Fork: connecting to http://127.0.0.1:8545 ===
1. Taping out MANDATE_V1 on fork...
   Processor: 0xdd7F8983f80B77AE3a49FA94f0096B9c6baa6398
   Circuit ID: 1
   Beacon: 0xf70d1ed4f62CF3780157B0b421b7E2F45bD0991C
   Beacon Implementation: 0x977f217887E085D298Cb3819cDAD5A0ee35F29B2
   Codehash: 0x7a15c353205e5245f40f5f5524542a982a4bb3b9a28476e4f10845163f941b30
2. Deploying MandateVault master implementation...
   MandateVault implementation deployed at: 0x5eb3Bc0a489C5A8288765d2336659EbCA68FCd00
3. Deploying MandateVaultFactory...
   MandateVaultFactory deployed at: 0x36C02dA8a0983159322a80FFE9F24b1acfF8B570
   Saved deployment to D:\18-hackathon\tapeOut\deployments\fork\demo-factory.json
   Updated contracts/test/fork/Generated.sol with deployed addresses.
Factory deployed at: 0x36C02dA8a0983159322a80FFE9F24b1acfF8B570

[2/7] Funding owner account with 500 USDC from whale...
Owner funded: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8

[3/7] Creating vault for agent trading...
Vault created at: 0xeaF6B7a8eb2E3ff41E43a0d97cbCd749FA0cE94a

[4/7] Depositing 100 USDC into vault...
Deposited 100 USDC into 0xeaF6B7a8eb2E3ff41E43a0d97cbCd749FA0cE94a

[5/7] Executing CLI command: state
Vault: 0xeaF6B7a8eb2E3ff41E43a0d97cbCd749FA0cE94a
Owner: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
Trader: 0xB869F594F35603f71AA7B9D3689B4ab1DE9cde83
Base Token: 0xB6CEceAB302E2E4948951eE7843FC24E92933061
Status: ACTIVE
Limits:
  Max Trade Base: 50000000
  Max Daily Base: 200000000
  Max Trades/Day: 5
  Cooldown: 10s
  Expires At: 1795619152
  Withdraw Delay: 120s
Counters (UTC Day 0):
  Trades Today: 0 / 5
  Volume Today: 0 / 200000000
  Last Buy Timestamp: 0
Allowed Tokens: 0xe538905cf8410324e03A5A23C1c177a474D59b2b
Block: 74254036 | Chain Time: 1793027162

[6/7] Executing CLI command: check and trade (Allowed 10 USDC buy)
Trade Check: ALLOWED
Input Bits: 255 (011111111)
Local Simulation Agrees: YES
Expected Output: 92304059400809968
Min Output: 91842539103805918
Trade EXECUTED on-chain:
  Tx Hash: 0x818356928c1a8b75dc0d0fec7896c66cc646718cce8e4106164ed160587acef4
  Amount Out: 92304059400809968
  Gas Used: 311001
  Block: 74254037

[7/7] Testing blocked rules and exit while frozen...
--- A. Oversized Buy Attempt (60 USDC > 50 USDC limit) ---
Trade BLOCKED by mandate circuit:
  - [ERR_TRADE_SIZE_EXCEEDED] Trade amount exceeds maximum per-trade limit
  - [ERR_COOLDOWN_ACTIVE] Cooldown period after last buy has not elapsed
Verified: Oversized trade was blocked by circuit as expected.

--- B. Freezing Vault via CLI ---
Freeze EXECUTED on-chain: 0xaff1f778949a35149c4013de13c7637941e12cee4323ed465dab2d0e8b32ce0f
Verified: Vault is now frozen.

--- C. Buy Attempt While Frozen (Must Be Blocked) ---
Trade BLOCKED by mandate circuit:
  - [ERR_VAULT_FROZEN] Vault is currently frozen
  - [ERR_COOLDOWN_ACTIVE] Cooldown period after last buy has not elapsed
Verified: Buy while frozen was blocked by circuit as expected.

--- D. Exit Attempt While Frozen (De-Risking MUST SUCCEED) ---
Vault WOKB balance: 92304059400809968
Trade EXECUTED on-chain:
  Tx Hash: 0xf11f92f14aae6d318cb2e5942e868f0796f467b32439bff21f82a3681445d9f3
  Amount Out: 5411474
  Gas Used: 242076
  Block: 74254039
Verified: Exit trade succeeded while frozen! Risk-reduction is always permitted.

====================================================
  ALL AGENT SDK & CLI FORK SMOKE CHECKS PASSED!
====================================================
```

```bash
$ npm run verify
=== Running Seiyaku Full Verification ===
>>> [STEP] forge fmt --check
PASSED: forge fmt --check
>>> [STEP] forge build
PASSED: forge build
>>> [STEP] forge test
PASSED: forge test
>>> [STEP] ABI check
PASSED: ABI check
>>> [STEP] ESLint
PASSED: ESLint
>>> [STEP] Prettier check
PASSED: Prettier check
>>> [STEP] TypeScript typecheck (circuit-tools)
PASSED: TypeScript typecheck (circuit-tools)
>>> [STEP] TypeScript typecheck (agent-sdk)
PASSED: TypeScript typecheck (agent-sdk)
>>> [STEP] TypeScript typecheck (web)
PASSED: TypeScript typecheck (web)
>>> [STEP] Vitest tests
 Test Files  26 passed (26)
      Tests  152 passed (152)
PASSED: Vitest tests
>>> [STEP] i18n check
PASSED: i18n check
>>> [STEP] Color contrast check
PASSED: Color contrast check
>>> [STEP] Web build
PASSED: Web build
>>> [STEP] Static build budget check
  TOTAL UNCOMPRESSED: 627.67 KB (budget: 800.00 KB)
PASSED: Static build budget check
=== All verification checks passed successfully ===
```

## Commands NOT run (and why)

- Mainnet broadcast commands (prohibited by safety rules).

## Acceptance criteria

| #   | Criterion (copied from the task)                                                                      | Result PASS/FAIL/NOT RUN | Evidence (command, line, tx, file)                                   |
| --- | ----------------------------------------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------- |
| 1   | API with zod validated inputs, typed results, no thrown strings, bigint amounts, chain time decisions | PASS                     | `packages/agent-sdk/src/types.ts`, `client.ts`                       |
| 2   | Uniswap QuoterV2 read, amountOutMin with slippage <= 300 bps, re-quote before send                    | PASS                     | `packages/agent-sdk/src/quoter.ts`, `client.ts:382-410`              |
| 3   | Viem Account, key loaded from `--key-env`, canary secrecy test passes                                 | PASS                     | `packages/agent-sdk/src/cli.test.ts:40-62`                           |
| 4   | `check` runs previewTrade and local computation, reports agreement                                    | PASS                     | `packages/agent-sdk/src/client.ts:250-280`                           |
| 5   | `waitUntilAllowed` computes earliest allowed time and sleeps with abort signal                        | PASS                     | `packages/agent-sdk/src/client.ts:540-610`, `client.test.ts:160-220` |
| 6   | CLI bin `seiyaku-agent`, options, exit codes, JSON schema documented                                  | PASS                     | `packages/agent-sdk/src/cli/run.ts`, `packages/agent-sdk/README.md`  |
| 7   | Vitest tests for all functions and failure modes, `npm run agent:smoke` transcript                    | PASS                     | 20 agent-sdk tests pass, smoke test transcript pasted                |
| 8   | Package README with install, quick start, security notes, schema, exit codes                          | PASS                     | `packages/agent-sdk/README.md`                                       |

## Measured numbers (only numbers you actually measured: test counts, coverage %, gas)

- Unit tests: 20 passing in `@seiyaku/agent-sdk`, 152 passing across entire monorepo.
- Gas measured in smoke test on local fork:
  - Trade buy: 311,001 gas (block 74254037)
  - Freeze vault: block 74254038
  - Exit trade while frozen: 242,076 gas (block 74254039)
- Static web build size: 627.67 KB (budget 800 KB).

## Decisions you made (anything the task did not specify) and why

- Implemented `sanitizeSecret` across all CLI output streams (`stdout` and `stderr`) to prevent private keys from appearing even if unexpected viem or node errors occur.
- Automatically cleaned up `contracts/test/fork/Generated.sol` in smoke test `finally` block to strictly comply with the rule never to leave contract files modified.

## Observations (problems seen elsewhere, not fixed)

- None.

## Gaps / risks / unknowns

- None.
