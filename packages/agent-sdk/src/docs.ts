/**
 * packages/agent-sdk/src/docs.ts
 * Single typed source of truth for CLI commands, options, exit codes, and MCP tool documentation.
 * Shared directly with Web documentation (AgentsPage) to ensure documentation never drifts.
 */

export interface CliOptionDoc {
  flag: string;
  description: string;
}

export interface CliCommandDoc {
  name: string;
  usage: string;
  summaryKey: string;
  example: string;
  options: CliOptionDoc[];
}

export interface ExitCodeDoc {
  code: number;
  name: string;
  meaningKey: string;
}

export interface McpToolDoc {
  name: string;
  summaryKey: string;
  readOnly: boolean;
  exampleInput: string;
}

export const CLI_COMMAND_DOCS: readonly CliCommandDoc[] = [
  {
    name: 'state',
    usage: 'seiyaku-agent state --vault <address> [--rpc <url>] [--json]',
    summaryKey: 'agents.cli.stateSummary',
    example: 'npx @seiyaku/agent-sdk state --vault 0x0165878A594ca255338adfa4d48449f69242Eb8F',
    options: [
      { flag: '--vault, -v', description: 'Target vault address' },
      { flag: '--rpc, -r', description: 'RPC endpoint URL' },
      { flag: '--json', description: 'Output machine-readable JSON' },
    ],
  },
  {
    name: 'check',
    usage:
      'seiyaku-agent check --vault <address> --side buy|exit --token <addr> --amount <n> [--json]',
    summaryKey: 'agents.cli.checkSummary',
    example:
      'npx @seiyaku/agent-sdk check --vault 0x0165... --side buy --token 0xe538... --amount 10',
    options: [
      { flag: '--side', description: 'Trade side: buy or exit' },
      { flag: '--token', description: 'Target ERC-20 token address' },
      { flag: '--amount', description: 'Trade amount in token decimal units' },
      { flag: '--slippage', description: 'Max slippage in basis points (default: 50)' },
    ],
  },
  {
    name: 'trade',
    usage:
      'seiyaku-agent trade --vault <address> --side buy|exit --token <addr> --amount <n> [--send]',
    summaryKey: 'agents.cli.tradeSummary',
    example:
      'npx @seiyaku/agent-sdk trade --vault 0x0165... --side buy --token 0xe538... --amount 10 --send',
    options: [
      {
        flag: '--send',
        description: 'Explicit flag required to broadcast onchain (default is simulation only)',
      },
      {
        flag: '--key-env',
        description: 'Env var containing trader private key (default: SEIYAKU_TRADER_KEY)',
      },
      { flag: '--lang', description: 'Language for block reason output (en | vi)' },
    ],
  },
  {
    name: 'freeze',
    usage: 'seiyaku-agent freeze --vault <address> [--send]',
    summaryKey: 'agents.cli.freezeSummary',
    example:
      'npx @seiyaku/agent-sdk freeze --vault 0x0165878A594ca255338adfa4d48449f69242Eb8F --send',
    options: [
      { flag: '--send', description: 'Broadcast freeze transaction immediately' },
      { flag: '--key-env', description: 'Env var containing private key' },
    ],
  },
  {
    name: 'tighten',
    usage: 'seiyaku-agent tighten --vault <address> [--max-trade <n>] [--cooldown <sec>] [--send]',
    summaryKey: 'agents.cli.tightenSummary',
    example: 'npx @seiyaku/agent-sdk tighten --vault 0x0165... --max-trade 25 --send',
    options: [
      { flag: '--max-trade', description: 'Lower max base amount per trade' },
      { flag: '--max-daily', description: 'Lower daily cumulative volume limit' },
      { flag: '--cooldown', description: 'Increase required cooldown seconds' },
      {
        flag: '--remove-tokens',
        description: 'Comma-separated token addresses to remove from allowlist',
      },
    ],
  },
  {
    name: 'wait',
    usage:
      'seiyaku-agent wait --vault <address> --side buy --token <addr> --amount <n> [--timeout <sec>]',
    summaryKey: 'agents.cli.waitSummary',
    example:
      'npx @seiyaku/agent-sdk wait --vault 0x0165... --side buy --token 0xe538... --amount 10',
    options: [
      { flag: '--timeout', description: 'Maximum seconds to wait (default: 600)' },
      { flag: '--poll', description: 'Polling interval in seconds (default: 3)' },
    ],
  },
  {
    name: 'explain',
    usage: 'seiyaku-agent explain <inputBits> [--lang en|vi]',
    summaryKey: 'agents.cli.explainSummary',
    example: 'npx @seiyaku/agent-sdk explain 503 --lang en',
    options: [{ flag: '--lang', description: 'Language code: en or vi' }],
  },
  {
    name: 'mcp',
    usage: 'seiyaku-agent mcp --vault <address> [--allow-send] [--rate-limit-sec <n>]',
    summaryKey: 'agents.cli.mcpSummary',
    example: 'npx @seiyaku/agent-sdk mcp --vault 0x0165878A594ca255338adfa4d48449f69242Eb8F',
    options: [
      {
        flag: '--allow-send',
        description: 'Permit onchain trade broadcast (default: false, simulation only)',
      },
      {
        flag: '--rate-limit-sec',
        description: 'Enforce interval between trade sends (default: 5s)',
      },
    ],
  },
];

export const CLI_EXIT_CODES_DOCS: readonly ExitCodeDoc[] = [
  { code: 0, name: 'SUCCESS', meaningKey: 'agents.exitCodes.success' },
  { code: 2, name: 'RULE_BLOCKED', meaningKey: 'agents.exitCodes.ruleBlocked' },
  { code: 3, name: 'NETWORK_ERROR', meaningKey: 'agents.exitCodes.networkError' },
  { code: 4, name: 'INVALID_INPUT', meaningKey: 'agents.exitCodes.invalidInput' },
  { code: 5, name: 'SIMULATION_FAILED', meaningKey: 'agents.exitCodes.simFailed' },
];

export const MCP_TOOLS_DOCS: readonly McpToolDoc[] = [
  {
    name: 'seiyaku_get_state',
    summaryKey: 'agents.mcp.getStateSummary',
    readOnly: true,
    exampleInput: '{\n  "vault": "0x0165878A594ca255338adfa4d48449f69242Eb8F"\n}',
  },
  {
    name: 'seiyaku_check_trade',
    summaryKey: 'agents.mcp.checkTradeSummary',
    readOnly: true,
    exampleInput:
      '{\n  "vault": "0x0165878A594ca255338adfa4d48449f69242Eb8F",\n  "side": "buy",\n  "token": "0xe538905cf8410324e03a5a23c1c177a474d59b2b",\n  "amountIn": "10"\n}',
  },
  {
    name: 'seiyaku_trade',
    summaryKey: 'agents.mcp.tradeSummary',
    readOnly: false,
    exampleInput:
      '{\n  "vault": "0x0165878A594ca255338adfa4d48449f69242Eb8F",\n  "side": "buy",\n  "token": "0xe538905cf8410324e03a5a23c1c177a474d59b2b",\n  "amountIn": "10"\n}',
  },
  {
    name: 'seiyaku_freeze',
    summaryKey: 'agents.mcp.freezeSummary',
    readOnly: false,
    exampleInput: '{\n  "vault": "0x0165878A594ca255338adfa4d48449f69242Eb8F"\n}',
  },
];
