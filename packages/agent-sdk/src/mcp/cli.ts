/**
 * packages/agent-sdk/src/mcp/cli.ts
 * Stdio command-line runner for the Seiyaku MCP server.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { isAddress, getAddress, type Hash } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createAgentClient } from '../client.js';
import { SeiyakuMcpServer } from './server.js';
import { sanitizeSecret } from '../cli/run.js';

export interface McpCliArgs {
  vault?: string | undefined;
  rpcUrls: string[];
  keyEnv: string;
  allowSend: boolean;
  rateLimitSec: number;
  lang: 'en' | 'vi';
  help?: boolean | undefined;
}

export function parseMcpArgs(argv: string[]): McpCliArgs {
  const rawArgs = argv.slice(2);
  // If invoked as `seiyaku-agent mcp ...`, strip leading 'mcp'
  const args = rawArgs[0] === 'mcp' ? rawArgs.slice(1) : rawArgs;

  const result: McpCliArgs = {
    rpcUrls: [],
    keyEnv: 'SEIYAKU_TRADER_KEY',
    allowSend: false,
    rateLimitSec: 5,
    lang: 'en',
    help: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i]!;

    if (arg === '--help' || arg === '-h') {
      result.help = true;
      i++;
      continue;
    }

    if (arg === '--vault' || arg === '-v') {
      result.vault = args[i + 1];
      i += 2;
      continue;
    }

    if (arg === '--rpc' || arg === '-r') {
      const rpcVal = args[i + 1];
      if (rpcVal) {
        result.rpcUrls.push(...rpcVal.split(',').map((u) => u.trim()));
      }
      i += 2;
      continue;
    }

    if (arg === '--key-env') {
      result.keyEnv = args[i + 1] || result.keyEnv;
      i += 2;
      continue;
    }

    if (arg === '--allow-send') {
      result.allowSend = true;
      i++;
      continue;
    }

    if (arg === '--rate-limit-sec') {
      const rl = parseInt(args[i + 1] || '5', 10);
      result.rateLimitSec = isNaN(rl) ? 5 : rl;
      i += 2;
      continue;
    }

    if (arg === '--lang') {
      const l = args[i + 1]?.toLowerCase();
      if (l === 'en' || l === 'vi') {
        result.lang = l;
      }
      i += 2;
      continue;
    }

    i++;
  }

  if (result.rpcUrls.length === 0) {
    const envRpc = process.env.SEIYAKU_RPC_URL || process.env.RPC_URL;
    if (envRpc) {
      result.rpcUrls = envRpc.split(',').map((u) => u.trim());
    } else {
      result.rpcUrls = ['https://rpc.xlayer.tech'];
    }
  }

  return result;
}

export async function runMcpServer(argv: string[] = process.argv): Promise<void> {
  const args = parseMcpArgs(argv);
  const secretKey = process.env[args.keyEnv]?.trim();

  // Secret scrubbing: wrap stderr so private keys never leak
  if (secretKey && secretKey.length >= 10) {
    const rawSecret = secretKey.replace(/^0x/i, '');
    const origStderrWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = function (
      chunk: Uint8Array | string,
      encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
      callback?: (error?: Error | null) => void,
    ): boolean {
      if (typeof chunk === 'string') {
        let scrubbed = sanitizeSecret(chunk, secretKey);
        if (rawSecret.length >= 10) {
          scrubbed = sanitizeSecret(scrubbed, rawSecret);
        }
        return origStderrWrite(scrubbed, encodingOrCallback as BufferEncoding, callback);
      }
      if (Buffer.isBuffer(chunk)) {
        const enc = (
          typeof encodingOrCallback === 'string' ? encodingOrCallback : 'utf8'
        ) as BufferEncoding;
        let text = chunk.toString(enc);
        text = sanitizeSecret(text, secretKey);
        if (rawSecret.length >= 10) {
          text = sanitizeSecret(text, rawSecret);
        }
        return origStderrWrite(text, enc, callback);
      }
      return origStderrWrite(chunk, encodingOrCallback as BufferEncoding, callback);
    } as typeof process.stderr.write;
  }

  // Guard stdout: stdio MCP reserves stdout strictly for JSON-RPC packets.
  // Redirect any unexpected console.log/info calls to stderr.
  console.log = (...data: unknown[]) => {
    console.error(...data);
  };
  console.info = (...data: unknown[]) => {
    console.error(...data);
  };
  console.debug = (...data: unknown[]) => {
    console.error(...data);
  };

  function logErr(msg: string) {
    process.stderr.write(`${sanitizeSecret(msg, secretKey)}\n`);
  }

  if (args.help) {
    logErr(`seiyaku-mcp - Model Context Protocol stdio server for Seiyaku vaults

Usage:
  seiyaku-mcp --vault <address> [options]

Options:
  --vault, -v <address>     MandateVault contract address (required)
  --rpc, -r <urls>          RPC endpoint URL (comma-separated for fallback)
  --key-env <name>          Environment variable holding trader private key (default: SEIYAKU_TRADER_KEY)
  --allow-send              Enable on-chain trade execution (default: false, preview only)
  --rate-limit-sec <n>      Minimum seconds between broadcast transactions (default: 5)
  --lang <en|vi>            Language for mandate rule error descriptions (default: en)
  --help, -h                Show help`);
    return;
  }

  if (!args.vault || !isAddress(args.vault)) {
    logErr('Error: --vault <address> is required and must be a valid Ethereum address');
    throw new Error('Error: Valid --vault address is required');
  }

  let account;
  if (secretKey) {
    try {
      const formattedKey = secretKey.startsWith('0x') ? secretKey : `0x${secretKey}`;
      account = privateKeyToAccount(formattedKey as Hash);
      logErr(`Signer loaded from ${args.keyEnv} (${account.address})`);
    } catch {
      logErr(`Error: Invalid private key format in ${args.keyEnv}`);
      throw new Error(`Error: Invalid private key format in ${args.keyEnv}`);
    }
  }

  if (args.allowSend && !account) {
    logErr(`Warning: --allow-send enabled but no key in ${args.keyEnv}; writes will fail`);
  }

  logErr(
    `Starting Seiyaku MCP Server (vault: ${args.vault}, allowSend: ${args.allowSend}, rateLimit: ${args.rateLimitSec}s)`,
  );

  const client = createAgentClient({
    vault: getAddress(args.vault),
    rpcUrls: args.rpcUrls,
    ...(account ? { account } : {}),
  });

  const mcpServer = new SeiyakuMcpServer({
    vault: getAddress(args.vault),
    rpcUrls: args.rpcUrls,
    account,
    client,
    allowSend: args.allowSend,
    rateLimitSec: args.rateLimitSec,
    keyEnv: args.keyEnv,
    lang: args.lang,
  });

  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);

  logErr('Seiyaku MCP Server connected via stdio transport. Listening for agent requests...');
}
