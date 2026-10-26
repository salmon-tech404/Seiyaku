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
- **Description**: Each vault enforces a strict deposit cap (`maxDepositBase`) on `deposit()`. An owner cannot deposit more base tokens than the cap permits.
- **Mitigation**: Designed to limit financial exposure on unaudited hackathon contracts.
