export interface ParsedArgs {
  command?: string | undefined;
  vault?: string | undefined;
  rpcUrls: string[];
  keyEnv: string;
  json: boolean;
  send: boolean;
  lang: 'en' | 'vi';
  side?: 'buy' | 'exit' | undefined;
  token?: string | undefined;
  amount?: string | undefined;
  feeTier: number;
  slippageBps: number;
  bits?: number | undefined;
  timeoutSec: number;
  pollSec: number;
  maxTrade?: string | undefined;
  maxDaily?: string | undefined;
  maxTrades?: number | undefined;
  cooldown?: number | undefined;
  expires?: number | undefined;
  withdrawDelay?: number | undefined;
  removeTokens: string[];
  help: boolean;
  version: boolean;
  rawPositionals: string[];
}

export function parseCliArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  const result: ParsedArgs = {
    rpcUrls: [],
    keyEnv: 'SEIYAKU_TRADER_KEY',
    json: false,
    send: false,
    lang: 'en',
    feeTier: 500,
    slippageBps: 50,
    timeoutSec: 600,
    pollSec: 3,
    removeTokens: [],
    help: false,
    version: false,
    rawPositionals: [],
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i]!;

    if (!result.command && !arg.startsWith('-')) {
      result.command = arg.toLowerCase();
      i++;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      result.help = true;
      i++;
      continue;
    }

    if (arg === '--version' || arg === '-V') {
      result.version = true;
      i++;
      continue;
    }

    if (arg === '--json') {
      result.json = true;
      i++;
      continue;
    }

    if (arg === '--send') {
      result.send = true;
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

    if (arg === '--lang') {
      const l = args[i + 1]?.toLowerCase();
      if (l === 'en' || l === 'vi') {
        result.lang = l;
      }
      i += 2;
      continue;
    }

    if (arg === '--side') {
      const s = args[i + 1]?.toLowerCase();
      if (s === 'buy' || s === 'exit') {
        result.side = s;
      }
      i += 2;
      continue;
    }

    if (arg === '--token' || arg === '-t') {
      result.token = args[i + 1];
      i += 2;
      continue;
    }

    if (arg === '--amount' || arg === '-a') {
      result.amount = args[i + 1];
      i += 2;
      continue;
    }

    if (arg === '--fee') {
      const fee = parseInt(args[i + 1] || '500', 10);
      result.feeTier = isNaN(fee) ? 500 : fee;
      i += 2;
      continue;
    }

    if (arg === '--slippage') {
      const slp = parseInt(args[i + 1] || '50', 10);
      result.slippageBps = isNaN(slp) ? 50 : slp;
      i += 2;
      continue;
    }

    if (arg === '--bits') {
      const b = parseInt(args[i + 1] || '0', 10);
      result.bits = isNaN(b) ? 0 : b;
      i += 2;
      continue;
    }

    if (arg === '--timeout') {
      const t = parseInt(args[i + 1] || '600', 10);
      result.timeoutSec = isNaN(t) ? 600 : t;
      i += 2;
      continue;
    }

    if (arg === '--poll') {
      const p = parseInt(args[i + 1] || '3', 10);
      result.pollSec = isNaN(p) ? 3 : p;
      i += 2;
      continue;
    }

    if (arg === '--max-trade') {
      result.maxTrade = args[i + 1];
      i += 2;
      continue;
    }

    if (arg === '--max-daily') {
      result.maxDaily = args[i + 1];
      i += 2;
      continue;
    }

    if (arg === '--max-trades') {
      result.maxTrades = parseInt(args[i + 1] || '0', 10);
      i += 2;
      continue;
    }

    if (arg === '--cooldown') {
      result.cooldown = parseInt(args[i + 1] || '0', 10);
      i += 2;
      continue;
    }

    if (arg === '--expires') {
      result.expires = parseInt(args[i + 1] || '0', 10);
      i += 2;
      continue;
    }

    if (arg === '--withdraw-delay') {
      result.withdrawDelay = parseInt(args[i + 1] || '0', 10);
      i += 2;
      continue;
    }

    if (arg === '--remove-tokens') {
      const tokVal = args[i + 1];
      if (tokVal) {
        result.removeTokens = tokVal.split(',').map((t) => t.trim());
      }
      i += 2;
      continue;
    }

    if (!arg.startsWith('-')) {
      result.rawPositionals.push(arg);
      i++;
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
