# @seiyaku/agent-sdk

TypeScript library, command line tool and MCP server that let a trader key or an AI agent use a Seiyaku vault safely.

This package is **not published to npm yet**. Use it from a clone of the repository.

## Run it from a clone

```bash
git clone https://github.com/salmon-tech404/Seiyaku.git
cd Seiyaku
npm ci
npm run agent -- --help
```

## What it does

* Reads the state of a vault (limits, counters, balances, pending changes).
* Checks a planned trade against the vault rules before sending anything, with a plain language reason for every blocked rule.
* Trades inside the rules. Every write simulates first and sends only when you pass `--send` (CLI) or `send: true` (library).
* Re quotes the Uniswap V3 price right before sending and stops when the price moved beyond the slippage you allowed.
* Never asks for a private key as a plain argument. The CLI reads the trader key from an environment variable.

## Command line

```bash
npm run agent -- state   --vault 0x... --rpc https://rpc.xlayer.tech
npm run agent -- check   --vault 0x... --side buy --token 0x... --amount 10
npm run agent -- trade   --vault 0x... --side buy --token 0x... --amount 10          # preview only
npm run agent -- trade   --vault 0x... --side buy --token 0x... --amount 10 --send   # sends
npm run agent -- freeze  --vault 0x... --send
npm run agent -- tighten --vault 0x... --max-trade 25 --send
npm run agent -- wait    --vault 0x... --side buy --token 0x... --amount 10
npm run agent -- explain 503 --lang en
```

Global options: `--vault`, `--rpc` (comma separated list for fallback), `--key-env` (name of the environment variable that holds the trader key, default `SEIYAKU_TRADER_KEY`), `--json`, `--send`, `--lang en|vi`.

Set the key for the current terminal window only, never write it into a file in the repository:

```powershell
$env:SEIYAKU_TRADER_KEY = "0x..."
```

### Exit codes

| Code | Name              | Meaning                                       |
| ---- | ----------------- | --------------------------------------------- |
| 0    | SUCCESS           | The operation succeeded or the trade is allowed |
| 2    | RULE_BLOCKED      | The vault rules block the trade               |
| 3    | NETWORK_ERROR     | RPC or network problem                        |
| 4    | INVALID_INPUT     | Missing or invalid arguments                  |
| 5    | SIMULATION_FAILED | The contract call would revert                |

## MCP server

```bash
npm run --silent agent:mcp -- --vault 0x... --rpc https://rpc.xlayer.tech
```

The server exposes four tools (`seiyaku_get_state`, `seiyaku_check_trade`, `seiyaku_trade`, `seiyaku_freeze`). It simulates by default and sends transactions only when started with `--allow-send`. See `docs/MCP.md` for a client configuration. Use `--silent` so that npm does not print anything else on stdout.

## Library

```typescript
import { createAgentClient } from '@seiyaku/agent-sdk';
import { privateKeyToAccount } from 'viem/accounts';

const client = createAgentClient({
  rpcUrls: ['https://rpc.xlayer.tech'],
  vault: '0x...',
  account: privateKeyToAccount(process.env.SEIYAKU_TRADER_KEY as `0x${string}`),
});

const state = await client.getState();
const outcome = await client.trade({ side: 'buy', token: '0x...', amountIn: '10' }, { send: false });
// outcome.status is 'blocked', 'simulated' or 'sent'
```

Amounts are decimal strings in token units. Time based decisions use the latest block timestamp.

## Safety notes

* The vault, not this package, enforces the rules. A buggy or hostile agent still cannot exceed the limits the owner set, but it can trade inside them.
* Contracts are an unaudited prototype with a deposit cap. Do not use real funds you cannot lose.
