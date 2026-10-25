# Seiyaku

A pledge to yourself, enforced onchain.

Seiyaku is a vault for traders and AI agents on X Layer. You deposit funds, set your own trading rules, and from that moment every trade must pass a rule circuit stored onchain. You can tighten your rules at any time, but loosening them takes 24 hours. The vault never traps you in a position, so selling back to USDC is always allowed.

The name comes from the Japanese word 誓約 (seiyaku), which means a solemn pledge or oath. You make the pledge once, calmly, and the vault holds you to it when you are not calm.

Seiyaku is built for the X Layer Build X: TapeOut Accelerate hackathon. It is an unaudited prototype and it is still in development.

## The problem

Most trading losses come from broken rules, not from bad analysis. A trader decides to risk 2 percent per trade, then doubles the size after a loss. A bot is told to stay within limits, then a bad prompt or a bug pushes it past them.

Existing onchain guards mostly protect a swap from technical risk, such as slippage or a strange token. Very few protect the owner from their own impulses, or from their own agent, while actually holding the funds behind the rules.

## What Seiyaku does

* Holds your trading funds in a vault that only you can withdraw from.
* Lets a trader key swap tokens, but only when the rule circuit says yes.
* Lets you tighten limits instantly, so a calm decision takes effect at once.
* Delays every loosening by 24 hours, so a heated decision cannot take effect.
* Delays withdrawals, so you cannot empty the vault on impulse.
* Always allows exits, so protection never becomes a trap.
* Explains every blocked trade in plain language, with the exact rule that failed.

The trader key can be your own second wallet or an AI agent. It can trade, freeze and tighten, and it can never loosen a rule or withdraw funds.

Seiyaku is not a trading bot. It does not pick trades. It is the supervisor that stands behind whoever does.

## How it works

1. You create a vault and choose a template or edit the numbers. The app shows each rule in plain language.
2. You deposit USDC. A deposit cap applies during the prototype stage.
3. A trader or agent submits a swap request.
4. The vault measures nine facts about the request and sends them as bits to a rule circuit on X Layer.
5. The circuit answers allow or block. If it allows, the vault swaps through Uniswap V3. If it blocks, the transaction reverts and carries the failed bits, so any app can say which rule stopped it.

## The rules

The vault tracks these limits for each owner:

* Maximum spend on a single buy
* Maximum spend per UTC day
* Maximum number of buys per UTC day
* Minimum cooldown between buys
* An allowlist of tokens
* An expiry date after which buys stop
* A freeze switch
* A withdrawal delay

The rule circuit combines nine checks into one decision. In words, a trade is allowed when its parameters are sane, and either it is an exit back to USDC, or it is a buy that passes every limit above.

```
allow = sane AND ( isExit OR ( tokenAllowed AND notExpired AND notFrozen
        AND sizeOk AND dailyOk AND tradesOk AND cooldownOk ) )
```

Tightening means making any limit stricter. It takes effect immediately. Loosening means anything else, including adding a token, raising a limit or unfreezing. It is queued and executes only after the delay. You can cancel a queued change at any time.

## Why a circuit

The decision logic is a small circuit made of NAND gates, published onchain through the TapeOut protocol. This gives Seiyaku a few properties that plain contract code does not give as naturally:

* The rule is a public object. Anyone can call it for free and check what it does, without trusting our vault code.
* A circuit with nine inputs has only 512 possible cases, so we test every one of them against a reference model.
* The circuit cannot call other contracts or loop, so the rule engine behaves in a strictly bounded way.
* One audited circuit can serve every vault. Only the numbers differ per owner.

We are honest about the tradeoff. For a single product, ordinary Solidity would also work. The circuit earns its place through transparency, exhaustive testing and reuse by third parties.

## Who it is for

* Active onchain traders who know they overtrade and want a rule they cannot talk themselves out of.
* Builders running AI trading agents who need to show that the agent is bounded by limits it cannot change.
* Anyone who wants to verify, from the outside, that an account is bound by a specific rule set.

## Architecture

* **Rule circuit.** A fixed circuit on a TapeOut processor on X Layer. The factory pins its address, id and a hash of its netlist.
* **Vault factory.** Deploys one minimal proxy vault per owner. It holds no funds and has no admin.
* **Vault.** Holds funds, keeps counters, builds the nine input bits, asks the circuit, and swaps through Uniswap V3 when allowed.
* **Circuit tools.** TypeScript code that builds the circuit from the rule formula, simulates it, verifies every input, and prepares it for tape out.
* **Agent SDK.** A TypeScript library and command line tool for agents. It checks a trade before sending it and explains any block.
* **Web app.** A static single page app with a vault builder, a dashboard with timers, and a public verify page that shows any vault, its circuit as a gate diagram, and a live evaluation.

## Technology

* Solidity 0.8.23 and Foundry for contracts and tests
* OpenZeppelin Contracts for token handling and reentrancy protection
* TypeScript, viem and zod for tools and the agent SDK
* React, Vite and wagmi for the web app, in English and Vietnamese
* X Layer (chain id 196), TapeOut and Uniswap V3

## Repository layout

```
contracts/                 Foundry project
packages/circuit-tools/    circuit builder, simulator and verifier
packages/agent-sdk/        library and command line tool for agents
apps/web/                  static web app
scripts/                   fork, deploy and publish helpers
docs/                      public documentation
```

## Getting started

You need Node.js 20 or newer, npm, Git and Foundry.

```
npm ci
npm run verify
```

The verify command runs formatting, linting, type checks, unit tests, contract tests and the translation check. To work against a local copy of X Layer, set `XLAYER_RPC_URL` as described in `.env.example` and run `npm run fork`.

Never put a private key in a file in this repository. Tests use throwaway accounts that exist only on a local fork.

## Security and limits

Seiyaku is an unaudited hackathon prototype. Please read this section before depositing anything.

* The contracts have not been audited. A deposit cap limits the possible loss.
* TapeOut contracts are written by a third party, are partly upgradeable and have not been audited. Seiyaku pins the circuit address, id and netlist hash, and a change to the circuit stops trading but cannot take funds. Owner withdrawal keeps working.
* There are no admin keys, no upgrade path and no pause switch controlled by us.
* Version one uses no price oracle. Limits count only the USDC spent on buys.
* Fee on transfer and rebasing tokens are not supported.
* A trader key that is compromised can still trade within the limits you set. That is the reason the limits exist.
* Seiyaku does not give financial advice and does not promise profit.

## Prior art and what was built for the event

The idea of a mandate, meaning a set of limits that an agent cannot change, was first explored by the author in an earlier offchain trading agent project. This repository contains new code written for the hackathon. Other TapeOut projects such as TapeGuard, OpenGate and TapeSafe also use circuits to enforce rules, and they informed our understanding of what works onchain. Seiyaku differs in its focus: it protects the owner and their agent from their own impulses by holding the funds, delaying loosening, and always allowing exits.

## Roadmap

* Prototype on a local fork with the rule circuit, factory and vault
* Web app, verify page and agent SDK
* Mainnet deployment with a small deposit cap and verified source code
* Possible next steps: price based rules such as daily loss limits, support for more assets, an independent audit

## Deployments

Not deployed yet. Addresses, transaction links and the demo video will be listed here after the mainnet release.

## License

MIT. See the LICENSE file.

## Disclaimer

This software is provided as is, without warranty of any kind. Use it at your own risk. Nothing in this repository is investment advice.
