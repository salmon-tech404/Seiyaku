import { isAddress, getAddress, parseUnits, type Hash } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { parseCliArgs } from './args.js';
import { createAgentClient, AgentClient } from '../client.js';
import { explainInputBits } from '../messages.js';
import { runMcpServer } from '../mcp/cli.js';

export const CLI_EXIT_CODES = {
  SUCCESS: 0,
  RULE_BLOCKED: 2,
  NETWORK_ERROR: 3,
  INVALID_INPUT: 4,
  SIMULATION_FAILED: 5,
} as const;

export function sanitizeSecret(text: string, secret?: string): string {
  if (!secret || secret.length < 10) return text;
  return text.replaceAll(secret, '[REDACTED_SECRET]');
}

export function formatJsonOutput(data: unknown): string {
  return JSON.stringify(
    data,
    (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
    2,
  );
}

export async function runCli(argv: string[]): Promise<number> {
  const args = parseCliArgs(argv);
  const secretKey = process.env[args.keyEnv]?.trim();

  // Helper for sanitized console output
  function print(msg: string) {
    console.log(sanitizeSecret(msg, secretKey));
  }
  function printError(msg: string) {
    console.error(sanitizeSecret(msg, secretKey));
  }

  if (args.help) {
    print(`seiyaku-agent CLI - Safe trader key agent interface

Usage:
  seiyaku-agent <command> [options]

Commands:
  state       Read full vault limits, counters, balances, and status
  check       Simulate and verify a trade against the on-chain circuit
  trade       Check and execute a trade (--send to broadcast, default preview only)
  freeze      Freeze the vault immediately
  tighten     Tighten limits or remove tokens
  wait        Wait until cooldown or rollover allows trade
  explain     Explain failing rule bits into plain language
  mcp         Start Model Context Protocol (MCP) server

Global options:
  --vault, -v <addr>    Vault contract address
  --rpc, -r <url>       RPC endpoint URL (comma-separated for fallback)
  --key-env <name>      Environment variable holding trader private key (default: SEIYAKU_TRADER_KEY)
  --json                Output structured JSON
  --send                Broadcast transaction on-chain (default: false, simulation only)
  --lang <en|vi>        Language for rule descriptions (default: en)
  --help, -h            Show help
  --version, -V         Show version
`);
    return CLI_EXIT_CODES.SUCCESS;
  }

  if (args.version) {
    print('seiyaku-agent 0.1.0');
    return CLI_EXIT_CODES.SUCCESS;
  }

  if (!args.command) {
    printError('Error: No command specified. Use --help for usage.');
    return CLI_EXIT_CODES.INVALID_INPUT;
  }

  // Handle explain command without requiring vault or rpc
  if (args.command === 'explain') {
    let bits = args.bits;
    if (bits === undefined && args.rawPositionals[0]) {
      bits = parseInt(args.rawPositionals[0], 10);
    }
    if (bits === undefined || isNaN(bits)) {
      printError('Error: Please specify rule bits (e.g. seiyaku-agent explain 511)');
      return CLI_EXIT_CODES.INVALID_INPUT;
    }

    const reasons = explainInputBits(bits, args.lang);
    if (args.json) {
      print(formatJsonOutput({ bits, reasons }));
    } else {
      print(`Rule bits: ${bits} (binary: ${bits.toString(2).padStart(9, '0')})`);
      if (reasons.length === 0) {
        print('All rules satisfied: trade allowed.');
      } else {
        print('Failing rules:');
        for (const r of reasons) {
          print(`  - [Bit ${r.bitIndex} / ${r.code}] ${r.text}`);
        }
      }
    }
    return CLI_EXIT_CODES.SUCCESS;
  }

  // Handle mcp command
  if (args.command === 'mcp') {
    try {
      await runMcpServer(argv);
      return CLI_EXIT_CODES.SUCCESS;
    } catch (err) {
      printError(err instanceof Error ? err.message : String(err));
      return CLI_EXIT_CODES.INVALID_INPUT;
    }
  }

  // All other commands require --vault
  if (!args.vault || !isAddress(args.vault)) {
    printError('Error: Valid --vault address is required.');
    return CLI_EXIT_CODES.INVALID_INPUT;
  }

  // Build account if private key provided in env
  let account;
  if (secretKey) {
    try {
      const formattedKey = secretKey.startsWith('0x') ? secretKey : `0x${secretKey}`;
      account = privateKeyToAccount(formattedKey as Hash);
    } catch {
      printError(`Error: Invalid private key found in environment variable "${args.keyEnv}".`);
      return CLI_EXIT_CODES.INVALID_INPUT;
    }
  }

  let client: AgentClient;
  try {
    client = createAgentClient({
      rpcUrls: args.rpcUrls,
      vault: getAddress(args.vault),
      ...(account ? { account } : {}),
    });
  } catch (err) {
    printError(`Error initializing client: ${err instanceof Error ? err.message : String(err)}`);
    return CLI_EXIT_CODES.NETWORK_ERROR;
  }

  try {
    switch (args.command) {
      case 'state': {
        const state = await client.getState();
        if (args.json) {
          print(formatJsonOutput(state));
        } else {
          print(`Vault: ${state.vault}`);
          print(`Owner: ${state.owner}`);
          print(`Trader: ${state.trader}`);
          print(`Base Token: ${state.baseToken}`);
          print(`Status: ${state.frozen ? 'FROZEN' : 'ACTIVE'}`);
          print(`Limits:`);
          print(`  Max Trade Base: ${state.limits.maxTradeBase.toString()}`);
          print(`  Max Daily Base: ${state.limits.maxDailyBase.toString()}`);
          print(`  Max Trades/Day: ${state.limits.maxTradesPerDay}`);
          print(`  Cooldown: ${state.limits.cooldownSec.toString()}s`);
          print(`  Expires At: ${state.limits.expiresAt.toString()}`);
          print(`  Withdraw Delay: ${state.limits.withdrawDelaySec.toString()}s`);
          print(`Counters (UTC Day ${state.counters.dayIndex.toString()}):`);
          print(`  Trades Today: ${state.counters.tradesToday} / ${state.limits.maxTradesPerDay}`);
          print(
            `  Volume Today: ${state.counters.buyVolumeTodayBase.toString()} / ${state.limits.maxDailyBase.toString()}`,
          );
          print(`  Last Buy Timestamp: ${state.counters.lastBuyAt.toString()}`);
          print(`Allowed Tokens: ${state.allowedTokens.join(', ') || 'None'}`);
          print(`Block: ${state.block.toString()} | Chain Time: ${state.time.toString()}`);
        }
        return CLI_EXIT_CODES.SUCCESS;
      }

      case 'check':
      case 'trade': {
        if (!args.side || !args.token || !args.amount) {
          printError(
            'Error: --side (buy|exit), --token <address>, and --amount <num> are required.',
          );
          return CLI_EXIT_CODES.INVALID_INPUT;
        }

        const request = {
          side: args.side,
          token: getAddress(args.token),
          amountIn: args.amount,
          feeTier: args.feeTier,
          slippageBps: args.slippageBps,
        };

        if (args.command === 'check') {
          const outcome = await client.check(request, args.lang);
          if (args.json) {
            print(formatJsonOutput(outcome));
          } else {
            print(`Trade Check: ${outcome.allowed ? 'ALLOWED' : 'BLOCKED'}`);
            print(
              `Input Bits: ${outcome.inputBits} (${outcome.inputBits.toString(2).padStart(9, '0')})`,
            );
            print(`Local Simulation Agrees: ${outcome.localAgrees ? 'YES' : 'NO'}`);
            if (outcome.quote) {
              print(`Expected Output: ${outcome.quote.expectedOut.toString()}`);
              print(`Min Output: ${outcome.quote.amountOutMin.toString()}`);
            }
            if (!outcome.allowed) {
              print('Failing Rules:');
              for (const r of outcome.reasons) {
                print(`  - [${r.code}] ${r.text}`);
              }
            }
          }
          return outcome.allowed ? CLI_EXIT_CODES.SUCCESS : CLI_EXIT_CODES.RULE_BLOCKED;
        }

        // trade command
        if (args.send && !account) {
          printError(
            `Error: --send requires private key in environment variable "${args.keyEnv}".`,
          );
          return CLI_EXIT_CODES.INVALID_INPUT;
        }

        const tradeRes = await client.trade(request, { send: args.send });
        if (args.json) {
          print(formatJsonOutput(tradeRes));
        } else {
          if (tradeRes.status === 'blocked') {
            print('Trade BLOCKED by mandate circuit:');
            for (const r of tradeRes.reasons) {
              print(`  - [${r.code}] ${r.text}`);
            }
          } else if (tradeRes.status === 'simulated') {
            print('Trade SIMULATION SUCCESS (pass --send to execute):');
            print(`  Token In: ${tradeRes.tradeParams.tokenIn}`);
            print(`  Token Out: ${tradeRes.tradeParams.tokenOut}`);
            print(`  Amount In: ${tradeRes.tradeParams.amountIn.toString()}`);
            print(`  Expected Out: ${tradeRes.expectedOut.toString()}`);
            print(`  Min Out: ${tradeRes.amountOutMin.toString()}`);
          } else if (tradeRes.status === 'slippage_exceeded') {
            print('Trade NOT SENT: the fresh price is below the minimum you allowed.');
            print(`  Fresh quote: ${tradeRes.quotedOut.toString()}`);
            print(`  Minimum out: ${tradeRes.minimumOut.toString()}`);
          } else if (tradeRes.status === 'sent') {
            print('Trade EXECUTED on-chain:');
            print(`  Tx Hash: ${tradeRes.txHash}`);
            print(`  Amount Out: ${tradeRes.amountOut.toString()}`);
            print(`  Gas Used: ${tradeRes.gasUsed.toString()}`);
            print(`  Block: ${tradeRes.blockNumber.toString()}`);
          }
        }

        if (tradeRes.status === 'blocked') return CLI_EXIT_CODES.RULE_BLOCKED;
        if (tradeRes.status === 'slippage_exceeded') return CLI_EXIT_CODES.SIMULATION_FAILED;
        return CLI_EXIT_CODES.SUCCESS;
      }

      case 'freeze': {
        if (args.send && !account) {
          printError(
            `Error: --send requires private key in environment variable "${args.keyEnv}".`,
          );
          return CLI_EXIT_CODES.INVALID_INPUT;
        }

        const freezeRes = await client.freeze({ send: args.send });
        if (args.json) {
          print(formatJsonOutput(freezeRes));
        } else {
          if (freezeRes.status === 'simulated') {
            print('Freeze SIMULATION SUCCESS (pass --send to execute)');
          } else {
            print(`Freeze EXECUTED on-chain: ${freezeRes.txHash}`);
          }
        }
        return CLI_EXIT_CODES.SUCCESS;
      }

      case 'tighten': {
        const nextInput = {
          maxTradeBase: args.maxTrade ? parseUnits(args.maxTrade, 6) : undefined,
          maxDailyBase: args.maxDaily ? parseUnits(args.maxDaily, 6) : undefined,
          maxTradesPerDay: args.maxTrades,
          cooldownSec: args.cooldown ? BigInt(args.cooldown) : undefined,
          expiresAt: args.expires ? BigInt(args.expires) : undefined,
          withdrawDelaySec: args.withdrawDelay ? BigInt(args.withdrawDelay) : undefined,
        };

        const removeTokens = args.removeTokens.map((t) => getAddress(t));

        if (args.send && !account) {
          printError(
            `Error: --send requires private key in environment variable "${args.keyEnv}".`,
          );
          return CLI_EXIT_CODES.INVALID_INPUT;
        }

        const tightenRes = await client.tighten(nextInput, removeTokens, { send: args.send });
        if (args.json) {
          print(formatJsonOutput(tightenRes));
        } else {
          if (tightenRes.status === 'simulated') {
            print('Tighten SIMULATION SUCCESS (pass --send to execute)');
          } else {
            print(`Tighten EXECUTED on-chain: ${tightenRes.txHash}`);
          }
        }
        return CLI_EXIT_CODES.SUCCESS;
      }

      case 'wait': {
        if (!args.side || !args.token || !args.amount) {
          printError(
            'Error: --side (buy|exit), --token <address>, and --amount <num> are required.',
          );
          return CLI_EXIT_CODES.INVALID_INPUT;
        }

        const request = {
          side: args.side,
          token: getAddress(args.token),
          amountIn: args.amount,
          feeTier: args.feeTier,
          slippageBps: args.slippageBps,
        };

        const waitRes = await client.waitUntilAllowed(request, {
          timeoutSec: args.timeoutSec,
          pollSec: args.pollSec,
        });

        if (args.json) {
          print(formatJsonOutput(waitRes));
        } else {
          if (waitRes.status === 'allowed') {
            print('Trade is now ALLOWED by rule circuit.');
          } else {
            print(`Wait finished with status: ${waitRes.status} (${waitRes.reason})`);
          }
        }

        return waitRes.status === 'allowed' ? CLI_EXIT_CODES.SUCCESS : CLI_EXIT_CODES.RULE_BLOCKED;
      }

      default: {
        printError(`Error: Unknown command "${args.command}". Use --help for usage.`);
        return CLI_EXIT_CODES.INVALID_INPUT;
      }
    }
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    const sanitizedMsg = sanitizeSecret(rawMsg, secretKey);

    if (args.json) {
      print(
        formatJsonOutput({
          error: sanitizedMsg,
          code: CLI_EXIT_CODES.SIMULATION_FAILED,
        }),
      );
    } else {
      printError(`Execution error: ${sanitizedMsg}`);
    }

    if (
      sanitizedMsg.includes('fetch failed') ||
      sanitizedMsg.includes('connection refused') ||
      sanitizedMsg.includes('timeout') ||
      sanitizedMsg.includes('network')
    ) {
      return CLI_EXIT_CODES.NETWORK_ERROR;
    }

    return CLI_EXIT_CODES.SIMULATION_FAILED;
  }
}
