# @seiyaku/agent-sdk

A safe, strongly typed TypeScript library and CLI tool for autonomous agents and algorithmic bots trading through Seiyaku mandate vaults on OKX X Layer.

## Features

- **Rule pre-validation**: Local and onchain dual-evaluation (`previewTrade`) before submission.
- **Slippage protection**: Uniswap V3 Quoter integration with mandatory max slippage limit (up to 300 bps, default 50 bps) and atomic re-quote validation right before execution.
- **Decoupled execution**: Supports standalone state inspection, dry-run checking (`check`), trade execution (`trade`), emergency freezing (`freeze`), parameter tightening (`tighten`), and intelligent cooldown wait scheduling (`wait`).
- **Canary key secrecy**: Absolute zero-leak protection for operator private keys across all logs, stdout, stderr, and error stack traces.
- **Dual-language reporting**: Human-friendly reason formatting in English (`en`) and Vietnamese (`vi`).
- **Structured JSON outputs**: Standardized exit codes and JSON schemas for LLM tool calling and Unix pipeline automation.

---

## Installation

```bash
npm install @seiyaku/agent-sdk
```

---

## Quick Start (Library)

```typescript
import { createAgentClient } from '@seiyaku/agent-sdk';
import { privateKeyToAccount } from 'viem/accounts';

const client = createAgentClient({
  vault: '0x1234567890123456789012345678901234567890',
  rpcUrl: 'https://rpc.xlayer.tech',
  account: privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as `0x${string}`),
  defaultSlippageBps: 50,
});

// 1. Check vault state
const state = await client.getState();
console.log('Daily spent:', state.limits.spentTodayUsdc);

// 2. Dry-run a trade check
const check = await client.check({
  tokenIn: '0x1E4a5963aBFD975d8c9021ce480b42188849D41d', // USDC
  tokenOut: '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT
  fee: 500,
  amountIn: 10_000_000n, // 10 USDC (6 decimals)
  slippageBps: 50,
});

if (check.allowed) {
  console.log('Trade is allowed! Expected out:', check.expectedAmountOut);
  // 3. Execute trade
  const result = await client.trade({
    tokenIn: '0x1E4a5963aBFD975d8c9021ce480b42188849D41d',
    tokenOut: '0xdac17f958d2ee523a2206206994597c13d831ec7',
    fee: 500,
    amountIn: 10_000_000n,
    slippageBps: 50,
  });
  console.log('Trade executed tx:', result.txHash);
} else {
  console.log('Trade blocked:', check.reasonsEn.join(', '));
}
```

---

## CLI Usage

Binary name: `seiyaku-agent`

```bash
# State inspection
seiyaku-agent state --vault 0x... --rpc https://rpc.xlayer.tech --json

# Pre-trade check
seiyaku-agent check --vault 0x... --in 0xUSDC --out 0xUSDT --amount 10000000 --json

# Execute trade
seiyaku-agent trade --vault 0x... --in 0xUSDC --out 0xUSDT --amount 10000000 --key-env AGENT_KEY --send

# Emergency freeze
seiyaku-agent freeze --vault 0x... --key-env AGENT_KEY --send

# Wait until cooldown expires or daily limit rolls over
seiyaku-agent wait --vault 0x... --in 0xUSDC --out 0xUSDT --amount 10000000
```

### Options

| Flag | Description | Default |
|---|---|---|
| `--vault <address>` | Target Seiyaku mandate vault contract address | Required |
| `--rpc <urls>` | Comma-separated RPC endpoints with automatic failover | Defaults to X Layer public RPCs |
| `--in <address>` | Input token address | Required for check/trade/wait |
| `--out <address>` | Output token address | Required for check/trade/wait |
| `--fee <number>` | Uniswap pool fee tier (e.g., 500 = 0.05%) | `500` |
| `--amount <uint>` | Raw token input amount (base units) | Required for check/trade/wait |
| `--slippage-bps <n>` | Slippage tolerance in basis points (max 300) | `50` |
| `--key-env <name>` | Environment variable holding private key | `ETH_PRIVATE_KEY` |
| `--send` | Broadcast transaction (without this flag, dry-run is performed) | `false` |
| `--lang <en\|vi>` | Human output language for explanation strings | `en` |
| `--json` | Force structured JSON output to stdout | `false` |

---

## JSON Output Schema

When invoked with `--json`, `seiyaku-agent` emits one structured JSON object:

```typescript
type CliOutput = {
  command: 'state' | 'check' | 'trade' | 'freeze' | 'tighten' | 'wait' | 'explain' | 'mcp';
  success: boolean;
  code: number;
  data?:
    | VaultSnapshot
    | CheckOutcome
    | TradeOutcome
    | FreezeOutcome
    | TightenOutcome
    | WaitOutcome
    | ExplainOutcome;
  error?: string;
};
```

---

## Exit Codes

| Code | Label | Meaning |
|---|---|---|
| `0` | `SUCCESS` | Operation completed successfully |
| `2` | `BLOCKED_RULE` | Trade blocked by immutable circuit rule or sanity check |
| `3` | `BLOCKED_SLIPPAGE` | Quoted output below minimum or slippage exceeded 300 bps |
| `4` | `REVERT_OR_SIM_FAIL` | Onchain simulation or transaction execution reverted |
| `5` | `INVALID_ARGS` | Missing arguments, bad address, or malformed parameter |
| `6` | `RPC_FAILURE` | All provided RPC endpoints failed or unreachable |
| `7` | `FROZEN_OR_EXPIRED` | Vault is permanently frozen or past expiry |

---

## Security Notes

1. **Private Key Isolation**: Private keys are strictly read from environment variables. The SDK actively scrubs any matching secret strings from error stacks and log outputs.
2. **Onchain Sanity Verification**: The SDK never relies solely on offchain checks. Dual checks compare local circuit bits against onchain `previewTrade` logic.
3. **Price Protection**: Slippage is clamped to a strict maximum of 300 basis points (3%). Re-quotes are verified atomically before transaction signing.
