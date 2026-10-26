# Seiyaku Mandate Vault — Deployment Guide

This guide describes how the owner can safely deploy Seiyaku contracts to **X Layer Mainnet** (Chain ID: `196`).

---

## 1. Prerequisites

1. **Foundry**: Ensure `forge` is installed and accessible in PATH.
2. **Node.js**: Version 20+ with npm dependencies installed (`npm install`).
3. **Deployer Account**:
   - An EVM private key funded with native **OKB** on X Layer.
   - Recommended minimum funding: **0.05 OKB** (estimated deployment cost is ~0.0094 OKB; the extra funds provide gas price safety margin).
4. **Environment Variables**:
   - Store your private key in the environment variable `DEPLOYER_PRIVATE_KEY` (never write it to a repo file or commit it):
     ```bash
     export DEPLOYER_PRIVATE_KEY="0x..."
     ```
   - Optional custom RPC: `export XLAYER_RPC_URL="https://rpc.xlayer.tech"`

---

## 2. Dry-Run Simulation (Default Mode)

Before sending any real transactions, run a dry-run simulation:

```bash
npm run deploy:mainnet -- --dry-run
```

This command:

- Connects to the public X Layer RPC (`https://rpc.xlayer.tech`).
- Verifies Chain ID 196 and endpoint allowlist.
- Computes circuit pinning constants and netlist hashes.
- Simulates contract deployments and estimates exact gas.
- Calculates required OKB fees and prints a complete step-by-step plan.
- **Sends zero transactions and requires no private key.**

---

## 3. Live Mainnet Deployment (Owner Only)

> [!CAUTION]
> This command broadcasts transactions on X Layer Mainnet and spends real OKB.

Run the deployment script with explicit confirmation flags:

```bash
npm run deploy:mainnet -- --broadcast --i-understand-this-spends-real-funds
```

### Deployed Contracts

The script deploys:

1. **TapeOut Processor**: Checks out the 17-NAND `MANDATE_V1` circuit and verifies the beacon proxy.
2. **MandateVault**: The immutable master implementation contract.
3. **MandateVaultFactory (Production)**: Public instance configured with a **24-hour loosening delay** (`86400` seconds).
4. **MandateVaultFactory (Demo)**: Demo instance configured with a **2-minute loosening delay** (`120` seconds) for interactive hackathon testing.

All deployment artifacts and contract addresses are automatically saved to:

- `deployments/mainnet/factory-prod.json`
- `deployments/mainnet/factory-demo.json`

---

## 4. Source Code Verification on Sourcify

After mainnet deployment, verify all contracts on Sourcify:

```bash
# Dry run verification check
npm run verify:sourcify

# Submit live verification
npm run verify:sourcify -- --submit
```

---

## 5. Rollback & Immutability Expectations

- **Zero Upgradeability**: Seiyaku smart contracts contain zero upgradeable proxies or admin backdoors. All factory logic and vault implementations are immutable.
- **Rollback Policy**: If a configuration error occurs during deployment, the contract cannot be modified or upgraded. The remedy is simply to redeploy a fresh `MandateVaultFactory` instance. The old factory remains inert and poses no security hazard if left unreferenced.
- **Circuit Pinning**: Once a factory is deployed, its circuit address, circuit ID, netlist hash, beacon implementation, and implementation bytecode hash are permanently fixed. Any future changes to the external TapeOut contract cause trade attempts to fail-closed with `CircuitChanged()`.

---

## 6. Updating Documentation & Web App

After deployment:

1. Copy the deployed addresses from `deployments/mainnet/factory-prod.json` into:
   - `README.md` under the **Deployments** section.
   - `apps/web/src/config/contracts.ts` (or relevant frontend configuration).
2. Run `npm run verify` to confirm project build integrity.
