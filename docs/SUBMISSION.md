# Hackathon Submission Draft & Entry Form Guide

This document contains draft responses for all hackathon submission entry fields, project details, differentiation analysis, and a pre-submission checklist.

---

## 1. Project Information & Form Fields

### Project Name

**Seiyaku (誓約) — On-Chain Mandate Vaults for Autonomous Trading Agents**

### Tagline / Subtitle

Smart-contract mandate vaults with boolean circuit bounds for AI trading agents on X Layer.

### Elevator Pitch (< 80 Words)

> "Seiyaku lets capital owners delegate trading authority to autonomous AI agents without risking rugpulls or runaway losses. By executing boolean circuit logic on-chain through TapeOut processors, Seiyaku enforces per-trade caps, daily volume budgets, allowlisted tokens, and timelocked rule loosening. If market conditions deteriorate or an agent acts erratically, owners can freeze trading instantly while preservation exits back to the base token remain enforced by mathematical circuit invariants."
> _(73 words)_

### Detailed Description & Problem Solved

Autonomous trading agents, LLMs, and automated algorithmic strategies require private key access to interact with decentralized exchanges. In current DeFi architectures, granting an agent an operational wallet exposes the depositor to severe risks:

1. **Total Asset Drain (Rugpull)**: A compromised agent key or prompt injection vulnerability can transfer all vault assets to an attacker-controlled address.
2. **Runaway Volume & Cascading Slippage**: High-frequency algorithmic loops can churn through entire vault balances in illiquid pools, suffering massive slippage before human operators notice.
3. **Privilege Escalation**: Off-chain policy engines can be altered or bypassed by compromising the agent's hosting environment.

Seiyaku solves these failure modes by enforcing strict, on-chain operational boundaries:

- **Separation of Custody and Execution**: Capital owners deposit funds into an ERC-1167 proxy clone. Traders (AI agents) only hold execution rights to invoke Uniswap V3 swaps where the output recipient is immutably pinned to the vault itself.
- **Fail-Closed Circuit Verification**: Before any swap occurs, a 17-NAND binary circuit (`MANDATE_V1`) evaluates 9 operational conditions on-chain. If any limit is violated, the transaction reverts without moving tokens.
- **Asymmetric Governance Timelocks**: Tightening limits or freezing trading is instantaneous. Loosening limits or allowlisting new tokens requires a mandatory timelock delay (24 hours on production, 120 seconds on demo), giving depositors ample time to detect unauthorized adjustments.
- **Always-Open De-Risking Exits (Property 4)**: Liquidation trades that swap secondary volatile tokens back into the base token (USDC) bypass daily volume and trade count limits, ensuring agents can always de-risk portfolios during market crashes.

---

## 2. Honest Differentiation from Existing TapeOut Projects

Most existing TapeOut ecosystem projects utilize the processor contract as an interactive toy, a badge minter, or a puzzle solver. Seiyaku applies TapeOut's compiled on-chain netlists to real DeFi risk management:

| Dimension                   | Typical TapeOut DApps                              | Seiyaku Mandate Vault                                                                                          |
| :-------------------------- | :------------------------------------------------- | :------------------------------------------------------------------------------------------------------------- |
| **Circuit Utility**         | Proof-of-concept puzzles, NFT metadata generation. | Real-world risk gate enforcing multi-variable trading boundaries.                                              |
| **Security Architecture**   | Single contract without proxy patterns.            | ERC-1167 clones with EIP-1967 beacon implementation codehash pinning (Decision D15).                           |
| **Agent Ecosystem**         | Manual UI interactions only.                       | First-class TypeScript SDK (`@seiyaku/agent-sdk`), CLI, and Model Context Protocol (MCP) server for LLMs.      |
| **Formal Verification**     | Ad-hoc testing.                                    | Exhaustive 512-case truth table cross-verification (TypeScript vs EVM vs TapeOut CPU).                         |
| **Production Transparency** | Unverified claims.                                 | Strict honesty guidelines: unaudited status, 500 USDC deposit cap, and measured gas numbers clearly disclosed. |

---

## 3. Future Roadmap

1. **Multi-DEX Aggregator Integration**: Expand beyond Uniswap V3 to support additional liquidity sources on X Layer.
2. **Multi-Agent Sub-Accounts**: Allow vault owners to partition capital among multiple competing agent strategies with individual risk allocations.
3. **Formal Security Audit**: Engage independent third-party auditing firms before increasing deposit caps beyond prototype levels.
4. **ZK-Mandates**: Explore zero-knowledge state transitions to keep proprietary trading thresholds confidential while proving on-chain compliance.

---

## 4. Team Background

- **Lead Developer**: [Owner Name / Handle — Insert Here]
- **Role**: Full-Stack Web3 Engineer & Smart Contract Architect
- **Contact**: [Email / X Handle / Telegram — Insert Here]
- **GitHub**: [GitHub Profile Link — Insert Here]

---

## 5. Pre-Submission Checklist

- [ ] **Repository Status**: Repository visibility set to **Public** on GitHub.
- [ ] **README Renders Cleanly**: All links, badges, diagrams, and formatting verified.
- [ ] **All Links Valid**: No broken relative paths or dead URLs in documentation.
- [ ] **Demo Video Ready**: Video runtime strictly under 3 minutes (180s), clear audio, English narration, 1080p resolution.
- [ ] **Contract Addresses Added**:
  - `MandateVault` Implementation: `0xd6e1afe5cA8D00A2EFC01B89997abE2De47fdfAf`
  - `MandateVaultFactory` (Production): `0x99dBE4AEa58E518C50a1c04aE9b48C9F6354612f`
  - `MandateVaultFactory` (Demo): `0x6F6f570F45833E249e27022648a26F4076F48f78`
  - Upstream TapeOut Processor: `0x39E44DbA62811E87fDe122CA4d6c082568a384D0`
- [ ] **OKLink Explorer Links**: Verified on OKLink X Layer Explorer.
- [ ] **Form Submission**: Submit entry at least 48 hours prior to the hackathon deadline.
