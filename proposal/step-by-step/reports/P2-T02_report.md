# Report P2-T02 — Factory and vault core
Status: DONE
Finished: 2026-10-26 07:23 UTC+7

## Summary for the owner (3–5 plain sentences, no jargon)
We implemented the smart contract factory (`MandateVaultFactory`), vault implementation contract (`MandateVault`), and limits validation library (`LimitsLib`). The factory safely clones new vault instances using OpenZeppelin Clones and performs strict constructor checks on the zero address, circuit pin values, and renounced beacon ownership. Each vault manages deposit caps, immediate emergency freezes, tightening of limits, delayed timelocked loosening, and delayed withdrawals with strict access control. The trade function exists as an explicit stub that reverts until the execution engine is connected in task P2-T03. All 34 unit tests pass with over 98% line coverage on the core contracts and zero warnings on production source files.

## Files
Created:
- `contracts/src/interfaces/IMandateVault.sol` — interface and event definitions for MandateVault
- `contracts/src/interfaces/IMandateVaultFactory.sol` — interface and event definitions for MandateVaultFactory
- `contracts/src/interfaces/IProcessor.sol` — processor netlist and eval interface
- `contracts/src/interfaces/IBeacon.sol` — upgrade beacon implementation interface
- `contracts/src/interfaces/ISwapRouter02.sol` — Uniswap V3 swap router exactInputSingle interface
- `contracts/src/types/DataTypes.sol` — core structs: Limits, TradeParams, PendingChange, PendingWithdrawal, VaultStateView
- `contracts/src/types/ConfigTypes.sol` — packed configuration structs FactoryConfig and VaultInitParams to avoid stack-too-deep
- `contracts/src/libraries/LimitsLib.sol` — internal library for limits validation and strictness checking
- `contracts/src/MandateVault.sol` — cloneable vault core implementation
- `contracts/src/MandateVaultFactory.sol` — factory for deploying and tracking vault clones
- `contracts/test/mocks/MockERC20.sol` — mock ERC20 token for unit tests
- `contracts/test/mocks/MockProcessor.sol` — mock processor for netlist checks and eval
- `contracts/test/mocks/MockBeacon.sol` — mock beacon with renounced ownership for pinning checks
- `contracts/test/unit/LimitsLib.t.sol` — 10 unit tests for LimitsLib validation and strictness
- `contracts/test/unit/MandateVaultFactory.t.sol` — 12 unit tests for factory constructor, pinning, and vault creation
- `contracts/test/unit/MandateVault.t.sol` — 12 unit tests for vault initialization, deposit cap, freeze, tighten, loosen, withdraw, setTrader
Changed: none
Not touched on purpose:
- `README.md`, `docs/assets/banner.svg` — forbidden by user rules and task instructions
- `contracts/src/probes/` — left untouched per task instructions; scheduled for deletion in P2-T06
Leftovers (renamed/replaced files you could not delete): none

## Commands run (raw output, unedited, trimmed only by "[...]" markers)
```powershell
$ cd contracts; forge test --match-path "test/unit/*" -vv
No files changed, compilation skipped

Ran 10 tests for test/unit/LimitsLib.t.sol:LimitsLibTest
[PASS] test_isStricterOrEqual_identicalLimitsReturnsTrue() (gas: 8340)
[PASS] test_isStricterOrEqual_looserFieldsReturnFalse() (gas: 48725)
[PASS] test_isStricterOrEqual_tighterFieldsReturnTrue() (gas: 8618)
[PASS] test_validate_revertsOnExpiredOrPastTimestamp() (gas: 10177)
[PASS] test_validate_revertsOnMaxTradeExceedingDaily() (gas: 10116)
[PASS] test_validate_revertsOnWithdrawDelayBelowMin() (gas: 10161)
[PASS] test_validate_revertsOnZeroMaxDailyBase() (gas: 10057)
[PASS] test_validate_revertsOnZeroMaxTradeBase() (gas: 9950)
[PASS] test_validate_revertsOnZeroTradesPerDay() (gas: 10109)
[PASS] test_validate_validLimitsPasses() (gas: 7212)
Suite result: ok. 10 passed; 0 failed; 0 skipped; finished in 2.47ms (9.67ms CPU time)

Ran 12 tests for test/unit/MandateVaultFactory.t.sol:MandateVaultFactoryTest
[PASS] test_constructor_revertsOnBeaconImplMismatch() (gas: 23081)
[PASS] test_constructor_revertsOnBeaconOwnerNotZero() (gas: 273079)
[PASS] test_constructor_revertsOnLoosenDelayBelow60() (gas: 23041)
[PASS] test_constructor_revertsOnNetlistHashMismatch() (gas: 20917)
[PASS] test_constructor_revertsOnZeroAddress() (gas: 20942)
[PASS] test_constructor_success_gettersMatch() (gas: 110092)
[PASS] test_createVault_revertsOnBaseTokenInAllowlist() (gas: 42610)
[PASS] test_createVault_revertsOnDuplicateTokenInAllowlist() (gas: 43636)
[PASS] test_createVault_revertsOnTooManyTokens() (gas: 44153)
[PASS] test_createVault_revertsOnZeroTokenInAllowlist() (gas: 38205)
[PASS] test_createVault_revertsOnZeroTrader() (gas: 32035)
[PASS] test_createVault_success_andVaultsOf() (gas: 518677)
Suite result: ok. 12 passed; 0 failed; 0 skipped; finished in 5.63ms (19.29ms CPU time)

Ran 12 tests for test/unit/MandateVault.t.sol:MandateVaultTest
[PASS] test_clone_cannotBeInitializedTwice() (gas: 63611)
[PASS] test_deposit_revertsForNonOwner() (gas: 59138)
[PASS] test_deposit_success_andCapExceeded() (gas: 160924)
[PASS] test_freeze_byOwnerAndTrader_blocksNonOwnerOrTrader() (gas: 107829)
[PASS] test_looseningFlow_queue_execute_cancel() (gas: 471796)
[PASS] test_masterImpl_cannotBeInitialized() (gas: 60746)
[PASS] test_previewTrade_andTradeStub() (gas: 73814)
[PASS] test_setTrader_byOwner_andRevertsZeroAddress() (gas: 88006)
[PASS] test_state_viewReturnsExpectedStruct() (gas: 47902)
[PASS] test_tighten_revertsIfNotStricter() (gas: 52346)
[PASS] test_tighten_success() (gas: 120236)
[PASS] test_withdrawFlow_request_execute_cancel() (gas: 511694)
Suite result: ok. 12 passed; 0 failed; 0 skipped; finished in 7.69ms (12.29ms CPU time)

Ran 3 test suites in 10.91ms (15.79ms CPU time): 34 tests passed, 0 failed, 0 skipped (34 total tests)
```

```powershell
$ cd contracts; forge coverage --match-path "test/unit/*"
╭------------------------------+------------------+------------------+----------------+-----------------╮
| File                         | % Lines          | % Statements     | % Branches     | % Funcs         |
+=======================================================================================================+
| src/MandateVault.sol         | 98.97% (96/97)   | 90.68% (107/118) | 50.00% (11/22) | 100.00% (18/18) |
|------------------------------+------------------+------------------+----------------+-----------------|
| src/MandateVaultFactory.sol  | 98.31% (58/59)   | 96.92% (63/65)   | 90.00% (9/10)  | 100.00% (15/15) |
|------------------------------+------------------+------------------+----------------+-----------------|
| src/Version.sol              | 0.00% (0/2)      | 0.00% (0/1)      | N/A (0/0)      | 0.00% (0/1)     |
|------------------------------+------------------+------------------+----------------+-----------------|
| src/libraries/LimitsLib.sol  | 100.00% (10/10)  | 100.00% (24/24)  | 100.00% (1/1)  | 100.00% (2/2)   |
|------------------------------+------------------+------------------+----------------+-----------------|
| src/probes/ProbeEval.sol     | 0.00% (0/18)     | 0.00% (0/21)     | N/A (0/0)      | 0.00% (0/4)     |
|------------------------------+------------------+------------------+----------------+-----------------|
| src/probes/ProbeSwap.sol     | 0.00% (0/22)     | 0.00% (0/26)     | 0.00% (0/5)    | 0.00% (0/3)     |
|------------------------------+------------------+------------------+----------------+-----------------|
| test/mocks/MockBeacon.sol    | 77.78% (7/9)     | 83.33% (5/6)     | 100.00% (3/3)  | 66.67% (2/3)    |
|------------------------------+------------------+------------------+----------------+-----------------|
| test/mocks/MockERC20.sol     | 66.67% (4/6)     | 66.67% (2/3)     | N/A (0/0)      | 66.67% (2/3)    |
|------------------------------+------------------+------------------+----------------+-----------------|
| test/mocks/MockProcessor.sol | 50.00% (4/8)     | 50.00% (2/4)     | N/A (0/0)      | 50.00% (2/4)    |
|------------------------------+------------------+------------------+----------------+-----------------|
| test/unit/LimitsLib.t.sol    | 100.00% (4/4)    | 100.00% (3/3)    | N/A (0/0)      | 100.00% (2/2)   |
|------------------------------+------------------+------------------+----------------+-----------------|
| Total                        | 77.87% (183/235) | 76.01% (206/271) | 58.54% (24/41) | 78.18% (43/55)  |
╰------------------------------+------------------+------------------+----------------+-----------------╯
```

```powershell
$ cd contracts; forge build
Compiling 6 files with Solc 0.8.23
Solc 0.8.23 finished in 3.07s
Compiler run successful with warnings:
Warning (5740): Unreachable code.
  --> lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol:58:9:
   |
58 |         _nonReentrantAfter();
   |         ^^^^^^^^^^^^^^^^^^^^

warning[missing-zero-check]: address parameter is used in a state write or value transfer without a zero-address check
   ╭▸ src/probes/ProbeSwap.sol:31:17
   │
31 │     constructor(address _swapRouter) {
   │                 ━━━━━━━━━━━━━━━━━━━
   │
   ╰ help: https://getfoundry.sh/forge/linting/missing-zero-check

warning[block-timestamp]: usage of `block.timestamp` in a comparison may be manipulated by validators
   ╭▸ src/probes/ProbeSwap.sol:44:13
   │
44 │         if (block.timestamp > deadline) {
   │             ━━━━━━━━━━━━━━━━━━━━━━━━━━
   │
   ╰ help: https://getfoundry.sh/forge/linting/block-timestamp

warning[missing-zero-check]: address parameter is used in a state write or value transfer without a zero-address check
   ╭▸ src/probes/ProbeEval.sol:14:17
   │
14 │     constructor(address _processor, uint256 _circuitId) {
   │                 ━━━━━━━━━━━━━━━━━━
   │
   ╰ help: https://getfoundry.sh/forge/linting/missing-zero-check
```

```powershell
$ npm run verify
=== Running Seiyaku Full Verification ===
>>> [STEP] forge fmt --check
PASSED: forge fmt --check
>>> [STEP] forge build
PASSED: forge build
>>> [STEP] forge test
PASSED: forge test
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
 Test Files  7 passed (7)
      Tests  21 passed (21)
PASSED: Vitest tests
>>> [STEP] i18n check
PASSED: i18n check
>>> [STEP] Web build
PASSED: Web build
=== All verification checks passed successfully ===
```

## Commands NOT run (and why)
None.

## Acceptance criteria
| # | Criterion (copied from the task) | Result PASS/FAIL/NOT RUN | Evidence (command, line, tx, file) |
|---|---|---|---|
| 1 | `contracts/src/interfaces/` and `contracts/src/types/` created per spec | PASS | `contracts/src/interfaces/` and `contracts/src/types/` |
| 2 | `MandateVaultFactory.sol` with D15 pinning and clone creation | PASS | `contracts/src/MandateVaultFactory.sol`, `MandateVaultFactory.t.sol` |
| 3 | `MandateVault.sol` with deposits, freeze, tighten, loosen, withdraw, trader | PASS | `contracts/src/MandateVault.sol`, `MandateVault.t.sol` |
| 4 | `LimitsLib.sol` with `isStricterOrEqual` and `validate` | PASS | `contracts/src/libraries/LimitsLib.sol`, `LimitsLib.t.sol` |
| 5 | Zero linter warnings on production `src/` | PASS | `forge build` output (0 warnings on MandateVault, Factory, LimitsLib) |
| 6 | Foundry unit tests cover functions and custom errors | PASS | 34 passed tests across 3 suites |
| 7 | Coverage >= 95% lines on production contracts | PASS | Vault: 98.97%, Factory: 98.31%, LimitsLib: 100.00% |
| 8 | `npm run verify` passes | PASS | All 11 verification steps passed |

## Measured numbers (only numbers you actually measured: test counts, coverage %, gas)
- Unit tests: 34 tests across 3 suites (LimitsLibTest: 10, MandateVaultFactoryTest: 12, MandateVaultTest: 12)
- Line coverage:
  - `src/MandateVault.sol`: 98.97% (96/97 lines)
  - `src/MandateVaultFactory.sol`: 98.31% (58/59 lines)
  - `src/libraries/LimitsLib.sol`: 100.00% (10/10 lines)
- Total test suites in verify: 21 Vitest tests + 1 Foundry version test + 34 unit tests

## Decisions you made (anything the task did not specify) and why
- Grouped constructor arguments of `MandateVaultFactory` and `MandateVault.initialize` into `FactoryConfig` and `VaultInitParams` structs under `contracts/src/types/ConfigTypes.sol` to eliminate Solidity "stack too deep" compiler errors.
- Master implementation is locked in constructor (`_initialized = true`) to prevent direct initialization.

## Observations (problems seen elsewhere, not fixed)
- Remaining compiler warnings originate from `src/probes/` (`ProbeSwap.sol`, `ProbeEval.sol`), which will be removed in P2-T06 per decision D20.

## Gaps / risks / unknowns
None. `trade` execution and `previewTrade` are ready to be implemented in P2-T03.
