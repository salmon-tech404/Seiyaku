# Seiyaku Demo Agent

A minimal, deterministic rule-based demonstration agent designed for video recording and integration testing.

> **Notice:** This software is a demonstration prop. It contains no trading strategy, no market alpha, and no predictive algorithms. It exists solely to illustrate how the Seiyaku vault's onchain circuit enforces mandate invariants against automated callers.

## Prerequisites

- Local Anvil fork running on port 8545:
  ```bash
  npm run fork
  npm run demo:prepare
  ```

## Usage

### 1. Careful Mode (Default)
Executes scheduled buys, validates the 9 circuit gates before each trade, waits out cooldowns, and exits back to USDC:
```bash
npm run demo:agent -- --mode careful
```

### 2. Reckless Mode
Executes a scripted sequence of 7 deliberate mandate rule violations (oversize trade, cooldown violation, daily excess, unlisted token, trade while frozen, loosen attempt, unauthorized withdraw) and proves the de-risking exit invariant:
```bash
npm run demo:agent -- --mode reckless
```
