# Seiyaku Architecture Specification

This document details the architectural design, on-chain components, data flow, truth tables, and trust model of Seiyaku Mandate Vaults.

---

## 1. System Overview

Seiyaku is an on-chain mandate vault system deployed on **X Layer** (Chain ID: `196`). It delegates autonomous trading authority to secondary agent keys while restricting trade sizes, daily cumulative volumes, trade counts, cooldowns, allowlisted assets, and operational status through on-chain boolean circuit evaluation (`TapeOut` processor circuits).

```mermaid
flowchart TD
    Owner["Owner (EOA / Safe)"]
    Agent["Trader / AI Agent"]
    Factory["MandateVaultFactory"]
    Vault["MandateVault Clone (ERC-1167)"]
    Processor["TapeOut Circuits Processor"]
    Router["Uniswap V3 SwapRouter02"]
    DEX["Uniswap V3 Pools"]

    Owner -- "createVault(trader, limits, tokens)" --> Factory
    Factory -- "clones" --> Vault
    Owner -- "deposit / queueLoosen / withdraw" --> Vault
    Agent -- "trade(params) [Buy or Exit]" --> Vault
    Vault -- "staticcall eval(circuitId, packedInputs)" --> Processor
    Processor -- "returns boolean (allow / block)" --> Vault
    Vault -- "exact approve & exactInputSingle" --> Router
    Router -- "swaps tokens" --> DEX
    DEX -- "returns proceeds" --> Vault
```

---

## 2. Core Components

### 2.1 MandateVaultFactory (`src/MandateVaultFactory.sol`)

- Deploys minimal proxy clones (`Clones.clone`) of the `MandateVault` implementation.
- Verifies processor circuit integrity at creation time:
  - Validates `processor.netlist(circuitId)` matches `netlistHash` (`0xbe106fa891c4f0b430afdcf245df6a3df86508351ef76af2e1508b064dff24f5`).
  - Validates beacon implementation address and bytecode codehash.
  - Enforces `beacon.owner() == address(0)`.
- Validates initial limits via `LimitsLib.validate`:
  - `maxTradeBase > 0`
  - `maxDailyBase >= maxTradeBase`
  - `maxTradesPerDay > 0`
  - `expiresAt > block.timestamp`
  - `withdrawDelaySec >= minWithdrawDelaySec` (3,600s on production, 120s on demo).
- Maintains enumerable index of vaults per owner (`vaultsOf(owner)`).

### 2.2 MandateVault (`src/MandateVault.sol`)

- Lightweight ERC-1167 clone containing state variables:
  - `limits`: `maxTradeBase`, `maxDailyBase`, `maxTradesPerDay`, `cooldownSec`, `expiresAt`, `withdrawDelaySec`.
  - `dailyState`: `dayIndex`, `tradesToday`, `buyVolumeTodayBase`, `lastBuyAt`.
  - `pinned`: `processor`, `circuitId`, `beacon`, `beaconImplementation`, `beaconImplementationCodehash`.
  - `frozen`: boolean killswitch flag.
- Enforces access control:
  - `onlyOwner`: `deposit`, `queueLoosen`, `executeLoosen`, `requestWithdraw`, `executeWithdraw`, `setTrader`.
  - `onlyTrader`: `trade`.
  - `onlyOwnerOrTrader`: `freeze`, `tighten`, `cancelLoosen`, `cancelWithdraw`.
- Manages Uniswap V3 swap interaction with zero lingering allowance and exact balance delta checks.

### 2.3 Circuit Tools & TapeOut Processor (`@seiyaku/circuit-tools`)

- Evaluates a 17-NAND gate binary netlist (`MANDATE_V1`).
- Operates on a 9-bit input vector (packed as little-endian 2-byte array):
  - 8 condition bits (`tradeSizeOk`, `dailyVolOk`, `tradeCountOk`, `notFrozen`, `tokenAllowed`, `notExpired`, `cooldownOk`, `saneParams`).
  - 1 mode bit (`isExit`).
- Pinned on X Layer at processor address with immutable beacon implementation codehash.

### 2.4 Agent SDK & MCP Server (`@seiyaku/agent-sdk`)

- High-level TypeScript client (`AgentClient`) providing pre-flight evaluation (`check()`), trade execution (`trade()`), and rule bit explanations.
- Model Context Protocol (MCP) server providing structured tools for autonomous LLM agents with read-only defaults and pre-flight simulation.

---

## 3. Trade Data Flow

Every trade follows a strict, fail-closed verification pipeline before any tokens touch the decentralized exchange router:

```mermaid
sequenceDiagram
    autonumber
    actor Trader as Agent / Trader
    participant Vault as MandateVault
    participant Circuit as TapeOut Processor
    participant TokenIn as Input ERC-20
    participant Router as Uniswap V3 SwapRouter02
    participant TokenOut as Output ERC-20

    Trader->>Vault: trade(TradeParams)
    Note over Vault: 1. Verify caller == trader
    Note over Vault: 2. Check circuit pin (beacon & codehash)
    Note over Vault: 3. Assemble 9-bit input condition vector
    Vault->>Circuit: staticcall eval(circuitId, packedInputs)
    alt Circuit Evaluation Reverts or Returns 0
        Circuit-->>Vault: return 0 (or revert)
        Vault-->>Trader: revert RuleBlocked(inputBits)
    else Circuit Returns 1
        Circuit-->>Vault: return 1 (Trade Allowed)
    end
    Note over Vault: 4. Effects first: for a buy, update the day counters and lastBuyAt
    Note over Vault: 5. Record balanceInBefore & balanceOutBefore
    Vault->>TokenIn: approve(Router, amountIn)
    Vault->>Router: exactInputSingle(params)
    Router->>Vault: transfer tokens
    Vault->>TokenIn: approve(Router, 0) [Reset allowance]
    Note over Vault: 6. Verify deltaIn == amountIn && deltaOut >= amountOutMin (else revert, which also rolls back the counters)
    Vault-->>Trader: return amountOut
```

---

## 4. The 9-Bit Circuit Truth Table

The `MANDATE_V1` circuit computes whether a trade is permitted. It accepts 9 boolean inputs and computes:
$$\text{Allow} = \text{saneParams} \land (\text{isExit} \lor (\text{tradeSizeOk} \land \text{dailyVolOk} \land \text{tradeCountOk} \land \text{notFrozen} \land \text{tokenAllowed} \land \text{notExpired} \land \text{cooldownOk}))$$

| Bit | Name           | Evaluated in `MandateVault.sol` as                                                                                                            | Meaning                                        |
| :-: | :------------- | :-------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------- |
|  0  | `sane`         | amount and minimum out above zero, deadline within 10 minutes, a valid buy or exit, fee tier 500, 3000 or 10000, amount not above the balance | The request is well formed                     |
|  1  | `tokenAllowed` | `allowedTokens[token]`                                                                                                                        | The non base token is on the allowlist         |
|  2  | `notExpired`   | `block.timestamp <= limits.expiresAt`                                                                                                         | The mandate has not expired                    |
|  3  | `notFrozen`    | `!frozen`                                                                                                                                     | The vault is not frozen                        |
|  4  | `sizeOk`       | buy: `amountIn <= limits.maxTradeBase` (exit: 1)                                                                                              | The buy is within the per trade limit          |
|  5  | `dailyOk`      | buy: used volume today plus `amountIn` within `limits.maxDailyBase` (exit: 1)                                                                 | The buy is within the daily volume limit       |
|  6  | `tradesOk`     | buy: `tradesToday < limits.maxTradesPerDay` (exit: 1)                                                                                         | The daily number of buys is not used up        |
|  7  | `cooldownOk`   | buy: `lastBuyAt == 0` or `block.timestamp >= lastBuyAt + limits.cooldownSec` (exit: 1)                                                        | The cooldown after the last buy has passed     |
|  8  | `isExit`       | `tokenOut == baseToken` and `tokenIn != baseToken`                                                                                            | The trade sells a token back to the base token |

Bit `i` of `inputBits` has weight 2^i. The circuit output is 1 when `sane AND (isExit OR (tokenAllowed AND notExpired AND notFrozen AND sizeOk AND dailyOk AND tradesOk AND cooldownOk))`.

### Netlist Structure

- **Gate Count**: 17 NAND gates.
- **Input Bits**: 9 inputs ($I_0 \dots I_8$).
- **Output Bits**: 1 output bit ($O_0$).
- **Exits rule**: when `isExit` (bit 8) is 1 and `sane` (bit 0) is 1, the circuit output is 1 whatever the other bits are. Selling a token back to the base token is never blocked by cooldown, volume, trade count, expiry, freeze or the allowlist.

---

## 5. Trust Model & Security Invariants

### 5.1 Role Boundaries

1. **Capital Safety**: The Trader role has zero withdrawal authorization. Capital can only exit the vault to the Owner's address via `executeWithdraw` or via authorized Uniswap V3 swaps where the recipient is strictly fixed to `address(this)`.
2. **Asymmetric Parameter Adjustments**:
   - **Tightening**: Any party (Owner or Trader) can immediately tighten limits (`tighten()`) without delay.
   - **Loosening**: Increasing limits or allowlisting new tokens requires a two-step timelock (`queueLoosen()` followed by `executeLoosen()`). The timelock delay (`loosenDelaySec`) is enforced on-chain (24 hours on production, 120 seconds on demo).
3. **Emergency Recourse**:
   - `freeze()` can be invoked immediately by either Owner or Trader to stop all buys.
   - Owner can replace a compromised or griefing Trader at any time without delay via `setTrader(newTrader)`.
   - `requestWithdraw(token, amount)` allows the Owner to withdraw funds after `withdrawDelaySec` (minimum 3,600s on production).

### 5.2 Circuit Pinning (Decision D15)

The vault clones pin their upstream TapeOut evaluation target immutably:

- `beacon`: Address of the processor's EIP-1967 upgrade beacon.
- `beaconImplementation`: Address of the logic contract referenced by the beacon at creation time.
- `beaconImplementationCodehash`: SHA-256/Keccak codehash of the implementation runtime bytecode.
- `netlistHash`: Keccak-256 hash of the 17-NAND binary netlist.

On every trade:

```solidity
if (IBeacon(beacon).implementation() != beaconImplementation) revert CircuitChanged();
if (beaconImplementation.codehash != beaconImplementationCodehash) revert CircuitChanged();
```

If an upstream beacon owner attempts an upgrade, all trades fail-closed with `CircuitChanged()`.

---

## 6. Gas & Resource Profile (Empirically Measured)

All figures measured on X Layer local fork (Block 74,254,206):

| Action                           | Measured Gas    | Target Budget | Safety Margin      |
| :------------------------------- | :-------------- | :------------ | :----------------- |
| First Buy of Day (`cold` write)  | **310,927 gas** | < 400,000 gas | 22.3% under budget |
| Subsequent Buy (`warm` write)    | **284,115 gas** | < 350,000 gas | 18.8% under budget |
| Exit Trade (`sell` to base)      | **237,298 gas** | < 300,000 gas | 20.9% under budget |
| Vault Deployment (`createVault`) | **184,520 gas** | < 250,000 gas | 26.2% under budget |
| Static Bundle Output             | **650.51 KB**   | < 800.00 KB   | 18.7% under budget |
