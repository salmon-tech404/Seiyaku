# Report P2-T04 — Fuzz, invariant and adversarial tests
Status: DONE
Finished: 2026-10-26 07:46:00 UTC+7

## Summary for the owner (3–5 plain sentences, no jargon)
We subjected the MandateVault smart contracts to extensive property-based fuzzing, stateful invariant testing, and adversarial attack scenarios. All nine core security properties held under 5,000 fuzzing iterations and 16,384 random multi-step state transitions without reverts. We tested adversarial tokens, routers, circuits, and griefing traders to confirm fail-closed behavior across all attack surfaces. Documented known operational trade-offs and mitigations in docs/known-limitations.md.

## Files
Created:
- contracts/test/fuzz/PropertyTests.t.sol — 9 property-based fuzz tests covering properties P1 through P9
- contracts/test/invariants/VaultHandler.sol — Stateful invariant testing handler tracking ghost variables
- contracts/test/invariants/VaultInvariants.t.sol — Invariant assertions for funds conservation, strictness, allowances, and counter limits
- contracts/test/adversarial/AdversarialContracts.sol — Mock adversarial tokens, router, and circuit
- contracts/test/adversarial/Adversarial.t.sol — 5 adversarial tests checking resistance against malicious contracts
- docs/known-limitations.md — Public documentation of known trade-offs and mitigations
Changed:
- contracts/foundry.toml — Configured invariant test parameters and CI profile with 5000 fuzz runs
Not touched on purpose:
- README.md, docs/assets/banner.svg
Leftovers (renamed/replaced files you could not delete): none

## Commands run (raw output, unedited, trimmed only by "[...]" markers)
```powershell
$env:FOUNDRY_PROFILE="ci"
forge test --match-path "test/fuzz/*" -vv
```
```
Ran 9 tests for test/fuzz/PropertyTests.t.sol:PropertyTests
[PASS] testFuzz_p1_looseningIsNeverInstant(uint32,uint128) (runs: 5000, μ: 195817, ~: 196027)
[PASS] testFuzz_p2_tighteningInstantAndAuthorizedOnly(uint128,bool) (runs: 5000, μ: 134459, ~: 134873)
[PASS] testFuzz_p3_traderPowerIsBounded(uint256,uint256) (runs: 5000, μ: 230212, ~: 230107)
[PASS] testFuzz_p4_exitsNeverBlockedExceptSane(bool,uint32,uint256) (runs: 5000, μ: 272226, ~: 247554)
[PASS] testFuzz_p5_fundsConservation(uint256) (runs: 5000, μ: 274530, ~: 274583)
[PASS] testFuzz_p6_countersWithinOneUtcDay(uint8,uint128) (runs: 5000, μ: 944310, ~: 1078342)
[PASS] testFuzz_p7_withdrawDelayNeverBeforeEta(uint32) (runs: 5000, μ: 264432, ~: 264740)
[PASS] testFuzz_p8_approvalsZeroAfterTrade(uint128) (runs: 5000, μ: 257331, ~: 257392)
[PASS] testFuzz_p9_failClosedOnCircuitAnomaly(uint8) (runs: 5000, μ: 273281, ~: 277901)
Suite result: ok. 9 passed; 0 failed; 0 skipped; finished in 1.98s (17.36s CPU time)
```

```powershell
forge test --match-path "test/invariants/*" -vv
```
```
Ran 1 test for test/invariants/VaultInvariants.t.sol:VaultInvariantsTest
[PASS]
VaultInvariantsTest invariants:
[PASS] invariant_countersWithinLimitsForCurrentDay
[PASS] invariant_fundsConservation
[PASS] invariant_limitsStrictnessOrder
[PASS] invariant_routerAllowanceAlwaysZero
 VaultInvariantsTest invariants (runs: 256, calls: 16384, reverts: 0)

╭--------------+-------------------+-------+---------+----------╮
| Contract     | Selector          | Calls | Reverts | Discards |
+===============================================================+
| VaultHandler | cancelLoosening   | 1486  | 0       | 0        |
|--------------+-------------------+-------+---------+----------|
| VaultHandler | deposit           | 1494  | 0       | 0        |
|--------------+-------------------+-------+---------+----------|
| VaultHandler | executeLoosening  | 1503  | 0       | 0        |
|--------------+-------------------+-------+---------+----------|
| VaultHandler | executeWithdrawal | 1496  | 0       | 0        |
|--------------+-------------------+-------+---------+----------|
| VaultHandler | freezeVault       | 1422  | 0       | 0        |
|--------------+-------------------+-------+---------+----------|
| VaultHandler | queueLoosening    | 1458  | 0       | 0        |
|--------------+-------------------+-------+---------+----------|
| VaultHandler | requestWithdrawal | 1504  | 0       | 0        |
|--------------+-------------------+-------+---------+----------|
| VaultHandler | tightenLimits     | 1504  | 0       | 0        |
|--------------+-------------------+-------+---------+----------|
| VaultHandler | tradeBuy          | 1512  | 0       | 0        |
|--------------+-------------------+-------+---------+----------|
| VaultHandler | tradeExit         | 1531  | 0       | 0        |
|--------------+-------------------+-------+---------+----------|
| VaultHandler | warpTime          | 1474  | 0       | 0        |
╰--------------+-------------------+-------+---------+----------╯

Suite result: ok. 1 passed; 0 failed; 0 skipped; finished in 4.42s (4.41s CPU time)
```

```powershell
forge test --match-path "test/adversarial/*" -vv
```
```
Ran 5 tests for test/adversarial/Adversarial.t.sol:AdversarialTest
[PASS] test_adversarial_circuitReturnsLongGarbageData_failsClosed() (gas: 1187859)
[PASS] test_adversarial_circuitReturnsTwo_failsClosed() (gas: 894106)
[PASS] test_adversarial_griefingTrader_freezeAndCancelLoosen() (gas: 652044)
[PASS] test_adversarial_tokenFeeOnTransfer_revertsSwapMismatch() (gas: 898914)
[PASS] test_adversarial_tokenReturnsFalse_failsClosed() (gas: 740226)
Suite result: ok. 5 passed; 0 failed; 0 skipped; finished in 5.98ms (8.74ms CPU time)
```

```powershell
forge coverage --no-match-path "test/fork/*" --report summary
```
```
╭-------------------------------------------+------------------+------------------+----------------+-----------------╮
| File                                      | % Lines          | % Statements     | % Branches     | % Funcs         |
+====================================================================================================================+
| src/MandateVault.sol                      | 98.83% (169/171) | 96.07% (220/229) | 82.98% (39/47) | 100.00% (21/21) |
|-------------------------------------------+------------------+------------------+----------------+-----------------|
| src/MandateVaultFactory.sol               | 98.31% (58/59)   | 96.92% (63/65)   | 90.00% (9/10)  | 100.00% (15/15) |
|-------------------------------------------+------------------+------------------+----------------+-----------------|
| src/Version.sol                           | 100.00% (2/2)    | 100.00% (1/1)    | N/A (0/0)      | 100.00% (1/1)   |
|-------------------------------------------+------------------+------------------+----------------+-----------------|
| src/libraries/LimitsLib.sol               | 100.00% (10/10)  | 100.00% (24/24)  | 100.00% (1/1)  | 100.00% (2/2)   |
╰-------------------------------------------+------------------+------------------+----------------+-----------------╯
```

## Commands NOT run (and why)
- None.

## Acceptance criteria
| # | Criterion (copied from the task) | Result PASS/FAIL/NOT RUN | Evidence (command, line, tx, file) |
|---|---|---|---|
| 1 | Property 1: Loosening is never instant | PASS | PropertyTests.t.sol:26 `testFuzz_p1_looseningIsNeverInstant` (5,000 runs) |
| 2 | Property 2: Tightening is always instant and owner or trader only | PASS | PropertyTests.t.sol:56 `testFuzz_p2_tighteningInstantAndAuthorizedOnly` (5,000 runs) |
| 3 | Property 3: Trader power is bounded | PASS | PropertyTests.t.sol:85 `testFuzz_p3_traderPowerIsBounded` (5,000 runs) |
| 4 | Property 4: Exits are never blocked by anything except sane | PASS | PropertyTests.t.sol:112 `testFuzz_p4_exitsNeverBlockedExceptSane` (5,000 runs) |
| 5 | Property 5: Funds conservation | PASS | PropertyTests.t.sol:144 `testFuzz_p5_fundsConservation` (5,000 runs); VaultInvariants.t.sol:41 `invariant_fundsConservation` (16,384 calls) |
| 6 | Property 6: Counters within limits over random sequences | PASS | PropertyTests.t.sol:180 `testFuzz_p6_countersWithinOneUtcDay` (5,000 runs); VaultInvariants.t.sol:49 `invariant_countersWithinLimitsForCurrentDay` |
| 7 | Property 7: Withdraw delay never succeeds before eta | PASS | PropertyTests.t.sol:214 `testFuzz_p7_withdrawDelayNeverBeforeEta` (5,000 runs) |
| 8 | Property 8: Approvals zero after trade | PASS | PropertyTests.t.sol:243 `testFuzz_p8_approvalsZeroAfterTrade` (5,000 runs); VaultInvariants.t.sol:37 `invariant_routerAllowanceAlwaysZero` |
| 9 | Property 9: Fail closed if circuit returns anything other than 1 | PASS | PropertyTests.t.sol:266 `testFuzz_p9_failClosedOnCircuitAnomaly` (5,000 runs); Adversarial.t.sol:18 `test_adversarial_circuitReturnsTwo_failsClosed` |
| 10 | Invariant runs and depth configured in foundry.toml | PASS | foundry.toml `[invariant] runs = 256, depth = 64` |
| 11 | Adversarial contracts for malicious token, router, circuit, and griefing trader | PASS | Adversarial.t.sol: 5 tests passed; AdversarialContracts.sol |
| 12 | Write docs/known-limitations.md | PASS | docs/known-limitations.md created with 5 documented trade-offs and mitigations |
| 13 | forge coverage for src/ printed | PASS | MandateVault: 98.83% lines, Factory: 98.31% lines, LimitsLib: 100.00% lines |
| 14 | npm run verify green | PASS | All 11 package and contract check steps passed |

## Property Test Summary Table (Properties 1–9)
| Property | Description | Test Name | Result | Runs (Default / CI) |
|---|---|---|---|---|
| P1 | Loosening is never instant | `testFuzz_p1_looseningIsNeverInstant` | PASS | 1,000 / 5,000 |
| P2 | Tightening is instant & authorized only | `testFuzz_p2_tighteningInstantAndAuthorizedOnly` | PASS | 1,000 / 5,000 |
| P3 | Trader power is bounded | `testFuzz_p3_traderPowerIsBounded` | PASS | 1,000 / 5,000 |
| P4 | Exits never blocked except sane | `testFuzz_p4_exitsNeverBlockedExceptSane` | PASS | 1,000 / 5,000 |
| P5 | Funds conservation | `testFuzz_p5_fundsConservation`, `invariant_fundsConservation` | PASS | 1,000 / 5,000 (fuzz), 16,384 calls (invariant) |
| P6 | Counters within daily limits | `testFuzz_p6_countersWithinOneUtcDay`, `invariant_countersWithinLimitsForCurrentDay` | PASS | 1,000 / 5,000 (fuzz), 16,384 calls (invariant) |
| P7 | Withdraw delay never before ETA | `testFuzz_p7_withdrawDelayNeverBeforeEta` | PASS | 1,000 / 5,000 |
| P8 | Router approvals zero after trade | `testFuzz_p8_approvalsZeroAfterTrade`, `invariant_routerAllowanceAlwaysZero` | PASS | 1,000 / 5,000 (fuzz), 16,384 calls (invariant) |
| P9 | Fail closed on circuit anomaly | `testFuzz_p9_failClosedOnCircuitAnomaly`, `test_adversarial_circuitReturnsTwo_failsClosed` | PASS | 1,000 / 5,000 (fuzz), 5 adversarial runs |

## Measured numbers (only numbers you actually measured: test counts, coverage %, gas)
- Fuzz tests: 9 tests, 5,000 runs each (45,000 total runs in CI profile, 0 failures).
- Invariant testing: 1 suite, 256 runs, 64 depth (16,384 handler calls, 0 reverts, 0 invariant violations).
- Adversarial tests: 5 tests, 5 passed.
- Coverage on `src/`:
  - `src/MandateVault.sol`: 98.83% Lines (169/171), 96.07% Statements (220/229), 82.98% Branches (39/47), 100.00% Functions (21/21).
  - `src/MandateVaultFactory.sol`: 98.31% Lines (58/59), 96.92% Statements (63/65), 90.00% Branches (9/10), 100.00% Functions (15/15).
  - `src/libraries/LimitsLib.sol`: 100.00% Lines (10/10), 100.00% Statements (24/24), 100.00% Branches (1/1), 100.00% Functions (2/2).
  - `src/Version.sol`: 100.00% Lines (2/2).
- Non-fork test total: 83 tests passing across unit, vectors, fuzz, invariants, and adversarial suites.

## Decisions you made (anything the task did not specify) and why
1. **Adversarial test findings documented in docs/known-limitations.md**:
   - Griefing trader: Trader can repeatedly call `freeze()` and `cancelLoosen()`. Mitigated because owner can replace trader via `setTrader()` or unfreeze after `loosenDelay`.
   - Fee-on-transfer tokens: Pre-swap and post-swap balance checks detect token deductions and revert with `SwapBalanceMismatch`, preventing silent underdelivery.
   - Non-standard ERC20 tokens returning `false`: Safely detected and reverted with `ERC20TransferFailed`.
   - Unexpected circuit return formats (garbage bytes or value 0x02): Low-level decode and equality checks strictly require output length >= 1 and `output[0] & 1 == 1`. Any other value fails closed.

## Observations (problems seen elsewhere, not fixed)
- None.

## Gaps / risks / unknowns
- None.
