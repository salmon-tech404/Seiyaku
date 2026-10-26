# Known Limitations & Trade-Offs

This document records the design limitations and trade-offs discovered during development, security analysis, and adversarial testing of the Mandate Vault protocol.

---

### 1. Trader Griefing via `cancelLoosen` and `freeze`

- **Severity**: Low / Operational
- **Status**: Accepted trade-off by design
- **Description**: A malicious or compromised trader key can call `freeze()` to stop all buys, and can call `cancelLoosen()` to cancel any pending limit loosening proposal queued by the owner.
- **Mitigation / Owner Recourse**: The trader key has strictly zero capability to loosen limits, move funds, or execute unauthorized withdrawals. If a trader key goes rogue or begins griefing, the owner can immediately call `setTrader(address newTrader)` in the same block without timelock delay to replace the griefing key.

---

### 2. Fee-on-Transfer and Rebasing Tokens Unsupported

- **Severity**: Medium / Informational
- **Status**: Accepted trade-off by design
- **Description**: The vault performs strict balance delta checks before and after every Uniswap V3 swap (`balanceInBefore - balanceInAfter == amountIn` and `balanceOutAfter - balanceOutBefore >= amountOutMin`). Any token that takes a transfer tax, burns on transfer, or rebases dynamically will cause the delta check to revert with `SwapMismatch()`.
- **Mitigation**: The factory and vault allowlists should only be configured with standard non-fee ERC20 tokens (e.g. USDC, WOKB).

---

### 3. Price-Independent Daily Volume & Size Accounting

- **Severity**: Low / Informational
- **Status**: Accepted in v1 scope
- **Description**: Trade size (`maxTradeBase`) and daily volume (`maxDailyBase`) are measured strictly in units of the base token (e.g., USDC). In v1, there is no on-chain oracle reading off-chain asset prices for secondary tokens.
- **Mitigation**: Mandates are structured around base-token denomination, and de-risking exit trades back to the base token are always permitted.

---

### 4. Direct Untracked ERC20 Transfers

- **Severity**: Low / Informational
- **Status**: Accepted
- **Description**: If a third party transfers ERC20 tokens directly to the vault contract address without calling `deposit()`, those tokens sit in the vault's balance. They do not trigger `Deposited` events or increase internal deposit accounting.
- **Mitigation**: The owner can recover any token held by the vault at any time via the standard delayed withdrawal flow (`requestWithdraw` and `executeWithdraw`).

---

### 5. Deposit Cap per Vault

- **Severity**: Low / Guardrail
- **Status**: Accepted by design
- **Description**: Each vault checks, on `deposit()`, that the vault's current base token balance plus the new amount does not exceed the cap (`maxDepositBase`). The check reads the real balance. It is not a lifetime limit: after the trader buys other tokens the base balance falls, and the owner can deposit again. Tokens sent directly to the vault bypass the check as well. The cap therefore limits how much base token sits in the vault at one moment, not the total value at risk.
- **Mitigation**: Designed to limit exposure on an unaudited prototype. The public deployment uses a cap of 500 USDC. Do not describe the cap as a total loss limit.

---

### 6. A compromised trader key can disable buying

- **Severity**: Medium (availability, not funds)
- **Status**: Accepted
- **Description**: The trader key may call `tighten` and `freeze`. A malicious or compromised trader key can therefore make the rules so strict, or freeze the vault, that buying stops. Loosening again needs the owner and the loosening delay (24 hours on the public factory). Exits and withdrawals are not affected.
- **Mitigation**: Use a trader key you can replace (`setTrader`). Owner can always exit and withdraw.

---

### 7. A queued loosening is applied as written

- **Severity**: Low
- **Status**: Accepted, documented
- **Description**: `queueLoosen` stores a complete proposed limit set. If the owner or the trader tightens the limits after that, `executeLoosen` still applies the older proposal as written, which can undo the tightening. Only the owner can execute and either party can cancel. The proposal is validated when queued, so an expiry date that has already passed by the time of execution is possible and only hurts the owner (buying stops).
- **Mitigation**: Cancel and re queue after tightening.

---

### 8. Exits are not blocked by the daily limits, but need a readable balance

- **Severity**: Low
- **Status**: Accepted
- **Description**: An exit needs sane parameters and a token whose balance can be read. A token that reverts on `balanceOf` cannot be exited through the vault and can only be withdrawn with the delayed owner withdrawal.
- **Mitigation**: Allowlist only standard ERC20 tokens.

---

### 9. Gas cost of a trade

- **Severity**: Informational
- **Status**: Measured
- **Description**: On a fork of X Layer the first buy of a day costs about 353,000 gas (cold storage writes and external reads), an exit about 284,000 gas. The target was below 400,000. Margins are not large, so avoid adding more checks to the trade path.
