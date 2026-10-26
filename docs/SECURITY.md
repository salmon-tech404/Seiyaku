# Seiyaku Mandate Vault — Security & Threat Model

> [!WARNING] > **UNAUDITED CODE**: The contracts and circuits in this repository have been developed for a hackathon prototype and autonomous verification suite. They have **NOT** undergone a professional third-party security audit. Do not deposit funds you cannot afford to lose.

---

## 1. Overview & Trust Model

Seiyaku is a non-custodial smart-contract mandate vault deployed on **X Layer** (Chain ID: `196`). It separates asset custody from delegated trading permissions by enforcing automated trading rules on-chain via compiled boolean netlist logic (TapeOut processor circuits).

### Roles & Responsibilities

| Role                | Definition                                                                         | Scope of Power                                                                                                                                                                                                                               |
| ------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Owner**           | The EOA or multisig that creates the vault and deposits capital.                   | Can deposit, request withdrawals (timelocked), replace the trader, queue limit loosening (timelocked), tighten limits immediately, freeze the vault, and cancel pending actions. Cannot modify the owner address or bypass withdraw delays.  |
| **Trader**          | An authorized automated trading bot or secondary agent key.                        | Can execute swaps (`trade`) within circuit rules, freeze the vault, tighten limits immediately, cancel pending loosening, and cancel pending withdrawals. **Cannot** withdraw funds, loosen rules, or move assets to arbitrary destinations. |
| **TapeOut Circuit** | An on-chain 17-NAND binary netlist (`MANDATE_V1`) evaluating 9 trading conditions. | Evaluates truth conditions on each swap. Returns boolean allow/block decision via a staticcall to the pinned processor.                                                                                                                      |
| **Stranger**        | Any unauthorized external address.                                                 | Has zero control over the vault. Cannot deposit, trade, freeze, tighten, or withdraw.                                                                                                                                                        |

---

## 2. What Seiyaku Protects Against vs. Does Not Protect Against

### Protections Enforced by Contract Logic:

- **Trader Rugpulls & Arbitrary Transfers**: The trader cannot transfer assets to any account except the hardcoded Uniswap V3 SwapRouter02, and all swap proceeds must return directly to `address(this)`.
- **Instant Rule Weakening**: Any loosening of trading parameters (increasing maximum trade size, increasing daily volume, adding allowed tokens, unfreezing, decreasing withdraw delay) requires a mandatory timelock delay (`loosenDelaySec`).
- **Emergency Circuit Tampering**: The vault verifies the processor's netlist hash, beacon implementation, and implementation bytecode hash on every trade. Any external tampering reverts transactions with `CircuitChanged()`.
- **Reentrancy**: State-mutating functions are protected with OpenZeppelin's `ReentrancyGuard`.
- **Dangling Approvals**: Vault approves only the exact swap `amountIn` to SwapRouter02 and explicitly resets allowance to zero after every trade.

### Known Trade-offs & What Seiyaku Does NOT Protect Against:

- **Trading Losses / Slippage**: While maximum trade size, daily volume, and slippage tolerances (`amountOutMin`) are enforced, valid swaps executed at market rates are subject to pool price dynamics.
- **Off-chain Key Compromise of Owner**: An attacker obtaining the Owner's private key can queue withdrawals. The timelock delay (`withdrawDelaySec >= 24h`) gives the owner time to observe the pending withdrawal and take action if multisig/monitoring is configured.
- **Trader Griefing (`freeze` / `cancelLoosen`)**: A rogue trader can spam `freeze()` or cancel a pending loosening. The owner can mitigate this immediately by calling `setTrader()` to replace the rogue trader.
- **Untracked Direct ERC20 Transfers**: If tokens are transferred directly to the vault without invoking `deposit()`, the vault holds the balance. The deposit cap is checked against the vault's real base token balance at the time of `deposit()`, so direct transfers are not blocked by it (see known limitations).

---

## 3. Threat Model Matrix

| Threat / Actor                     | Attacker Capability                                                                   | Potential Impact                                          | Built-in Mitigation & Defense                                                                                                                                                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Compromised Trader Key**         | Rogue trader attempts to drain vault funds or send tokens to attacker address.        | Total fund theft if unprotected.                          | **Blocked**: Trader has zero withdrawal permissions. Can only call `trade()`. Swaps must be routed through SwapRouter02 with recipient fixed to `address(vault)`. Swaps are strictly constrained by `maxTradeBase`, `maxDailyBase`, and `maxTradesPerDay`.              |
| **Compromised Trader (Griefing)**  | Rogue trader calls `freeze()` or repeatedly calls `cancelLoosen()`.                   | Vault trading frozen or rule loosening delayed.           | **Accepted Trade-off**: Owner can immediately replace the trader via `setTrader(newTrader)`. Owner can unfreeze the vault via timelocked `queueLoosen(..., unfreeze=true)`.                                                                                             |
| **Compromised Owner Key**          | Attacker with owner key attempts instant fund drain.                                  | Fund loss.                                                | **Mitigated**: Withdrawals require `requestWithdraw()` followed by `withdrawDelaySec` delay (minimum 24 hours on production). The owner cannot bypass the timelock.                                                                                                     |
| **Malicious ERC20 Token**          | Token implements transfer reentrancy, fee-on-transfer deductions, or returns `false`. | Balance drainage or underdelivery.                        | **Blocked**: Pre- and post-swap balance checks verify that the vault spent exactly `amountIn` and received >= `amountOutMin`. Transfers returning `false` revert with `ERC20TransferFailed`. Non-reentrant modifier blocks reentrancy.                                  |
| **Malicious / Compromised Router** | SwapRouter attempts to steal tokens or return fewer tokens than `amountOutMin`.       | Capital loss during swap.                                 | **Blocked**: Vault sets exact approval for `amountIn` and resets to 0. Direct balance delta assertions (`postBalance - preBalance >= amountOutMin`) guarantee swap execution or revert.                                                                                 |
| **TapeOut Circuit Replacement**    | Upstream TapeOut processor modifies netlist or changes beacon implementation.         | Invalidation of trading rules.                            | **Blocked (D15 Circuit Pinning)**: The factory verifies netlist hash, beacon implementation address, implementation bytecode hash, and zero beacon owner. Every `trade()` verifies beacon implementation and codehash. Any discrepancy reverts with `CircuitChanged()`. |
| **MIM / Sandwich / Front-Running** | MEV searchers sandwich trader swaps in mempool.                                       | Value extraction via slippage.                            | **Mitigated**: Swaps mandate `amountOutMin > 0` and `deadline <= block.timestamp + 600`. Trades exceeding slippage tolerance revert via Uniswap V3 router.                                                                                                              |
| **Stuck Funds / Emergency Exits**  | Vault is frozen, expired, or limits reached while holding volatile assets.            | Trader unable to protect vault value from market crashes. | **Protected (Property 4 Exits Never Blocked)**: Exit swaps (`tokenOut == baseToken`) bypass expiry, freeze, trade count, daily volume, and size limits, permitting full liquidation back into base asset (USDC) at any time.                                            |

---

## 4. Circuit Pinning Recipe & Fail-Closed Logic

1. **Storage Immutability**: During clone creation, `MandateVault` stores the processor address, circuit ID, expected netlist hash, beacon address, beacon implementation address, and beacon implementation codehash.
2. **Runtime Verification**:
   ```solidity
   if (IBeacon(beacon).implementation() != beaconImplementation) revert CircuitChanged();
   if (beaconImplementation.codehash != beaconImplementationCodehash) revert CircuitChanged();
   ```
3. **Fail-Closed Execution**: Low-level `staticcall` to `processor.eval()` treats any failure, revert, malformed return data, or non-one output bit as blocked:
   ```solidity
   (bool ok, bytes memory data) = processor.staticcall(payload);
   if (!ok || data.length < 64) return false;
   bytes memory out = abi.decode(data, (bytes));
   if (out.length == 0 || (uint8(out[0]) & 1) != 1) return false;
   ```

---

## 5. Agent SDK & MCP Safety Defaults

The `@seiyaku/agent-sdk` library and Model Context Protocol (MCP) server implement layered defensive defaults:

1. **Pre-flight Simulation Before Broadcast**:
   - `AgentClient.trade()` runs `AgentClient.check()` prior to sending any transaction. If the circuit evaluation or on-chain `previewTrade` rejects the parameters, the SDK returns a structured explanation and refuses to spend gas.
   - Dual validation: The SDK checks both the local circuit model and the on-chain preview contract. If the two disagree, the trade is fail-closed and treated as blocked.
2. **Explicit Confirmation on Mutating Actions**:
   - In the MCP server, read-only tools (`seiyaku_get_state`, `seiyaku_check_trade`, `seiyaku_explain_rule`) operate without private keys or gas expenditures.
   - Mutating tools (`seiyaku_execute_trade`, `seiyaku_freeze_vault`, `seiyaku_tighten_limits`) require explicit `confirm: true` parameter flags to prevent accidental broadcasts by LLM planning loops.
3. **No Private Key Ingestion via Prompts**:
   - The MCP server loads keys exclusively from local environment variables (`TRADER_PRIVATE_KEY`), never via chat tool input arguments or LLM completions.
4. **Gas Budgets & Re-Quoting**:
   - All swaps re-fetch an on-chain quote immediately before broadcasting to guard against mempool price movement or stale quotes exceeding slippage limits.
   - First buy of the day consumes ~310,927 gas, exits consume ~237,298 gas, comfortably below the 400,000 gas execution limit on X Layer.

---

## 6. Prototype Status

This software is an experimental prototype prepared for a hackathon. It is **unaudited**. Independent third-party review has not been performed. Deployers and testers must only risk capital they are willing to lose completely.
