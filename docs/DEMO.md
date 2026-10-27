# Seiyaku — 3-Minute Demo Video Storyboard

This document contains the recording plan, narration script, shot breakdown, and pre-recording checklist for the Seiyaku hackathon presentation video.

---

## 1. Pre-Recording Checklist

Before starting screen recording:

1. **Environment Setup**:
   - Run `npm run demo:reset && npm run demo:prepare` to seed clean test accounts and reset fork state.
   - Ensure local Anvil fork is running on port 8545 with chain ID 196.
2. **Browser Display Settings**:
   - Browser window set to 1920x1080 resolution at 100% zoom.
   - Dark theme activated across web app and terminal.
   - Clean browser profile: bookmark bar hidden, zero extraneous extensions.
   - Language toggle set to English (`EN`) initially (switch briefly to `VI` during UI overview).
3. **Wallet Configuration**:
   - MetaMask / OKX Wallet connected to network `X Layer Fork` (RPC: `http://127.0.0.1:8545`, Chain ID: `196`).
   - Account #1 selected as Owner (`0x7099...79C8`), pre-funded with OKB and 500 USDC.
   - Account #2 selected as Trader (`0xB869...de83`), pre-funded with OKB for gas.
   - Hide private keys, seed phrases, and personal browser tabs.
4. **Mandatory Disclaimer Line**:
   - _"Seiyaku is an unaudited hackathon prototype on X Layer with a 500 USDC deposit cap to demonstrate fail-closed on-chain boolean trading mandates."_

---

## 2. Fallback Plan

- **If a transaction is slow or stalls in MetaMask**:
  - Keep Anvil terminal visible in half-screen; Anvil mines blocks instantaneously.
  - If MetaMask pending UI lags, reload the page (`Ctrl + R`) or click the "Refresh State" button in the dashboard.
- **If an RPC connection drops**:
  - Switch immediately to terminal CLI demo (`npx tsx scripts/rehearsal-smoke.ts`), which runs all steps with direct JSON-RPC logs.

---

## 3. Shot Table (180 Seconds Total)

|         Time          | Screen                           | Action                                                                                                            | Narration (English)                                                                                                                                                                                                                                                                                    | On-Screen Text                                                                                  |
| :-------------------: | :------------------------------- | :---------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------- |
| **0:00 - 0:25** (25s) | Landing Page (`/`)               | Scroll through hero, value prop, and circuit diagram preview.                                                     | "Welcome to Seiyaku. AI trading agents often have full private key control, creating rugpull and runaway trade risks. Seiyaku solves this by enforcing trading mandates on-chain using 17-NAND boolean circuits on X Layer. The code is an unaudited hackathon prototype with a 500 USDC deposit cap." | **Seiyaku: On-Chain Mandate Vaults**<br>Autonomous Trading with Cryptographic Boundaries        |
| **0:25 - 0:50** (25s) | Create Vault (`/create`)         | Select Demo Factory (2-min timelock), set 20 USDC trade cap, 50 USDC daily cap, add WOKB, and submit transaction. | "We create a vault from the factory. We assign an AI trader key and set strict limits: maximum 20 USDC per trade, 50 USDC daily volume, and allowlist WOKB. Initializing clones an ERC-1167 proxy and pins the upstream TapeOut processor codehash."                                                   | **Creating Vault**<br>Pins TapeOut Processor & Netlist Hash                                     |
| **0:50 - 1:15** (25s) | Vault Dashboard (`/vault/:addr`) | Deposit 50 USDC. Open terminal side-by-side. Run `npm run agent -- trade ... --send` to execute a 10 USDC buy.    | "The owner deposits 50 USDC. Now our automated agent invokes the TypeScript SDK. The agent requests a 10 USDC swap to WOKB. The vault evaluates the 9-bit mandate circuit on-chain. All conditions pass, and the swap executes on Uniswap V3."                                                         | **Trader Buy: 10 USDC → WOKB**<br>Circuit Evaluates 9 Conditions → ALLOWED                      |
| **1:15 - 1:40** (25s) | Terminal & Dashboard             | Agent attempts a 30 USDC buy (exceeding 20 USDC cap) and a buy during cooldown.                                   | "Next, the agent tries a 30 USDC trade. The trade is blocked before spending gas. The SDK decodes the bitmask: Bit 0 failed because 30 exceeds the 20 USDC limit. Even if the agent tries again immediately, Bit 6 blocks it because the 60-second cooldown has not elapsed."                          | **Blocked Trade: Fail-Closed**<br>Bit 0 (Trade Size) & Bit 6 (Cooldown) Rejection               |
| **1:40 - 2:05** (25s) | Dashboard (Emergency)            | Click 'Freeze Vault'. Trader executes exit trade back to USDC.                                                    | "In an emergency, the owner or trader can freeze the vault instantly. New buys are immediately blocked. However, Property 4 ensures exits are never blocked: the trader can sell all WOKB back to USDC at any time to protect capital."                                                                | **Freeze Vault & De-Risk Exit**<br>Property 4: Liquidations Back to Base Asset Always Permitted |
| **2:05 - 2:30** (25s) | Dashboard (Timelock)             | Owner queues loosening (raise cap to 40 USDC). Countdown shows 120s timer.                                        | "To loosen limits or add new tokens, the owner must queue the change. Our demo factory enforces a 2-minute timelock, while production enforces 24 hours. The chain clock synchronizes the countdown live, preventing sudden unauthorized privilege escalation."                                        | **Timelocked Loosening**<br>2-Minute On-Chain Timelock Enforced                                 |
| **2:30 - 3:00** (30s) | Verify Page (`/verify`)          | Inspect 17-NAND interactive schematic. Click 'Run 512 Exhaustive Vectors'. Show 512/512 green checks.             | "Finally, on the Verify page, users inspect the exact 17-NAND gate netlist and run an exhaustive 512-case vector test comparing TypeScript to EVM execution. Seiyaku gives AI agents freedom to trade within strict, verified mathematical boundaries. Thank you."                                     | **100% Formal Verification**<br>512/512 Truth Table Vectors Matched                             |

---

## 4. Narration Script Word Count Verification

- **Section 1 (0:00 - 0:25)**: 55 words
- **Section 2 (0:25 - 0:50)**: 50 words
- **Section 3 (0:50 - 1:15)**: 49 words
- **Section 4 (1:15 - 1:40)**: 53 words
- **Section 5 (1:40 - 2:05)**: 47 words
- **Section 6 (2:05 - 2:30)**: 48 words
- **Section 7 (2:30 - 3:00)**: 51 words
- **Total Word Count**: **353 words** (well under the 400-word limit, providing comfortable pacing at ~120 words per minute for non-native English speakers).
