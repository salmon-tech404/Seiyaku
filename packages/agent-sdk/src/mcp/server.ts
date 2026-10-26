import { getAddress, type Address, type Account } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AgentClient } from '../client.js';
import { erc20Abi } from '../abi/index.js';
import {
  TOOL_NAMES,
  SEIYAKU_TOOLS,
  parseGetStateInput,
  parseCheckTradeInput,
  parseTradeInput,
  parseFreezeInput,
} from './tools.js';
import {
  sanitizeUntrustedText,
  sanitizeSecrets,
  createUntrustedMetadata,
  type UntrustedMetadata,
} from './sanitize.js';

export interface SeiyakuMcpServerOptions {
  vault: Address;
  rpcUrls: string | string[];
  account?: Account | undefined;
  allowSend?: boolean | undefined;
  rateLimitSec?: number | undefined;
  keyEnv?: string | undefined;
  lang?: 'en' | 'vi' | undefined;
  client?: AgentClient | undefined;
}

export interface McpToolCallResponse {
  content: Array<{ type: 'text'; text: string }>;
  structuredData?: unknown;
  isError?: boolean | undefined;
  [key: string]: unknown;
}

export class SeiyakuMcpServer {
  public readonly server: Server;
  public readonly client: AgentClient;
  public readonly vault: Address;
  public readonly allowSend: boolean;
  public readonly rateLimitSec: number;
  public readonly lang: 'en' | 'vi';
  public readonly keyEnv: string;
  public readonly account?: Account | undefined;

  public lastSendTimestamp = 0;
  private readonly secrets: string[] = [];

  constructor(options: SeiyakuMcpServerOptions) {
    this.vault = getAddress(options.vault);
    this.allowSend = options.allowSend ?? false;
    this.rateLimitSec = options.rateLimitSec ?? 5;
    this.lang = options.lang ?? 'en';
    this.keyEnv = options.keyEnv ?? 'SEIYAKU_TRADER_KEY';

    let resolvedAccount = options.account;
    if (!resolvedAccount && typeof process !== 'undefined' && process.env) {
      const secretKey = process.env[this.keyEnv]?.trim();
      if (secretKey) {
        const formattedKey = (
          secretKey.startsWith('0x') ? secretKey : `0x${secretKey}`
        ) as `0x${string}`;
        try {
          resolvedAccount = privateKeyToAccount(formattedKey);
          this.secrets.push(secretKey, formattedKey);
        } catch {
          // Ignore invalid key format in env; will fail when sending if required
        }
      }
    }
    this.account = resolvedAccount;

    if (options.client) {
      this.client = options.client;
    } else {
      this.client = new AgentClient({
        vault: this.vault,
        rpcUrls: options.rpcUrls,
        account: this.account,
      });
    }

    this.server = new Server(
      {
        name: 'seiyaku-mcp-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.setupHandlers();
  }

  /**
   * Registers a canary string or secret to ensure it is redacted from all responses.
   */
  public registerSecret(secret: string): void {
    if (secret && secret.length >= 4) {
      this.secrets.push(secret);
    }
  }

  /**
   * Connects the MCP server to a transport (defaults to StdioServerTransport).
   */
  public async connect(transport?: Transport): Promise<void> {
    const activeTransport = transport ?? new StdioServerTransport();
    await this.server.connect(activeTransport);
  }

  /**
   * Closes the MCP server connection.
   */
  public async close(): Promise<void> {
    await this.server.close();
  }

  /**
   * Sets up the MCP request handlers for listing and calling tools.
   */
  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [...SEIYAKU_TOOLS],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return this.executeTool(name, args);
    });
  }

  /**
   * Checks rate limiting for transaction broadcasting operations.
   */
  public checkRateLimit(): { allowed: true } | { allowed: false; error: string } {
    const now = Date.now();
    const elapsedSec = (now - this.lastSendTimestamp) / 1000;
    if (this.lastSendTimestamp > 0 && elapsedSec < this.rateLimitSec) {
      const remaining = (this.rateLimitSec - elapsedSec).toFixed(1);
      return {
        allowed: false,
        error: `Rate limit exceeded: only 1 on-chain broadcast per ${this.rateLimitSec}s allowed. Please wait ${remaining}s before retrying.`,
      };
    }
    return { allowed: true };
  }

  /**
   * Executes a tool by name with strict validation, rate limiting, and output formatting.
   */
  public async executeTool(name: string, args: unknown): Promise<McpToolCallResponse> {
    try {
      switch (name) {
        case TOOL_NAMES.GET_STATE: {
          parseGetStateInput(args);
          const state = await this.client.getState();

          // Query and sanitize token symbols for all relevant tokens
          const tokenSymbols: Record<Address, UntrustedMetadata<string>> = {};
          const allTokens = Array.from(new Set([state.baseToken, ...state.allowedTokens]));

          await Promise.all(
            allTokens.map(async (tokenAddr) => {
              try {
                const rawSymbol = await this.client.publicClient.readContract({
                  address: tokenAddr,
                  abi: erc20Abi,
                  functionName: 'symbol',
                });
                const sanitized = sanitizeUntrustedText(String(rawSymbol));
                tokenSymbols[tokenAddr] = createUntrustedMetadata(
                  sanitized,
                  'Token symbol is untrusted on-chain contract data and sanitized against prompt injection.',
                );
              } catch {
                tokenSymbols[tokenAddr] = createUntrustedMetadata(
                  'UNKNOWN',
                  'Failed to query token symbol from contract.',
                );
              }
            }),
          );

          const baseTokenSymbol =
            tokenSymbols[state.baseToken] ?? createUntrustedMetadata('UNKNOWN');

          const allowedTokens = state.allowedTokens.map((addr) => {
            const meta = tokenSymbols[addr] ?? createUntrustedMetadata('UNKNOWN');
            return {
              address: addr,
              untrusted_metadata: {
                symbol: meta.value,
                untrusted: true,
                ...(meta.warning !== undefined ? { warning: meta.warning } : {}),
              },
            };
          });

          const result = {
            ...state,
            allowedTokens,
            tokenSymbols,
            baseTokenSymbol,
          };

          return this.formatSuccess(result);
        }

        case TOOL_NAMES.CHECK_TRADE: {
          const validated = parseCheckTradeInput(args);
          const outcome = await this.client.check(validated, this.lang);
          return this.formatSuccess(outcome);
        }

        case TOOL_NAMES.TRADE: {
          const validated = parseTradeInput(args);

          if (!this.allowSend) {
            const simulation = await this.client.trade(validated, {
              send: false,
              lang: this.lang,
            });

            if (simulation.status === 'blocked') {
              return this.formatSuccess({
                status: 'blocked',
                sent: false,
                inputBits: simulation.inputBits,
                reasons: simulation.reasons,
                block: simulation.block,
                simulation,
              });
            }

            return this.formatSuccess({
              status: 'simulated',
              sent: false,
              simulation,
            });
          }

          const rl = this.checkRateLimit();
          if (!rl.allowed) {
            return this.formatError(rl.error);
          }

          this.lastSendTimestamp = Date.now();
          const outcome = await this.client.trade(validated, {
            send: true,
            lang: this.lang,
          });

          if (outcome.status === 'sent') {
            return this.formatSuccess({
              status: 'sent',
              sent: true,
              txHash: outcome.txHash,
              amountOut: outcome.amountOut,
              gasUsed: outcome.gasUsed,
              blockNumber: outcome.blockNumber,
            });
          }

          if (outcome.status === 'blocked') {
            return this.formatSuccess({
              status: 'blocked',
              sent: false,
              inputBits: outcome.inputBits,
              reasons: outcome.reasons,
              block: outcome.block,
            });
          }

          return this.formatSuccess({
            status: 'simulated',
            sent: false,
            simulation: outcome,
          });
        }

        case TOOL_NAMES.FREEZE: {
          parseFreezeInput(args);

          if (!this.allowSend) {
            const simulation = await this.client.freeze({ send: false });
            return this.formatSuccess({
              status: 'simulated',
              sent: false,
              simulation,
            });
          }

          const rl = this.checkRateLimit();
          if (!rl.allowed) {
            return this.formatError(rl.error);
          }

          this.lastSendTimestamp = Date.now();
          const outcome = await this.client.freeze({ send: true });

          if (outcome.status === 'sent') {
            return this.formatSuccess({
              status: 'sent',
              sent: true,
              txHash: outcome.txHash,
              blockNumber: outcome.blockNumber,
            });
          }

          return this.formatSuccess({
            status: 'simulated',
            sent: false,
            simulation: outcome,
          });
        }

        default: {
          return this.formatError(
            `Unknown tool: "${name}". Available tools: ${Object.values(TOOL_NAMES).join(', ')}`,
          );
        }
      }
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      return this.formatError(rawMsg);
    }
  }

  /**
   * Formats a successful tool result, serializing bigints to strings and redacting secrets.
   */
  private formatSuccess(result: unknown): McpToolCallResponse {
    const jsonText = JSON.stringify(
      result,
      (_, v) => (typeof v === 'bigint' ? v.toString() : v),
      2,
    );
    const sanitizedText = sanitizeSecrets(jsonText, this.secrets);

    return {
      content: [
        {
          type: 'text',
          text: sanitizedText,
        },
      ],
      structuredData: result,
    };
  }

  /**
   * Formats an error response, redacting secrets and returning structured error data.
   */
  private formatError(message: string): McpToolCallResponse {
    const sanitizedMsg = sanitizeSecrets(message, this.secrets);
    const errorObj = { error: sanitizedMsg };
    const jsonText = JSON.stringify(errorObj, null, 2);

    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: jsonText,
        },
      ],
      structuredData: errorObj,
    };
  }
}
