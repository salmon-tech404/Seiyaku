import { createPublicClient, fallback, http, type PublicClient, type Block } from 'viem';
import { xLayerChain, getActiveRpcUrl } from './config.js';

export function createXLayerPublicClient(customRpc?: string): PublicClient {
  const rpcUrl = customRpc || getActiveRpcUrl();

  // If using default mainnet RPCs, construct fallback transport
  const transports =
    rpcUrl === xLayerChain.rpcUrls.default.http[0]
      ? fallback([
          http(xLayerChain.rpcUrls.default.http[0], { retryCount: 3, timeout: 8000 }),
          http(xLayerChain.rpcUrls.default.http[1], { retryCount: 2, timeout: 8000 }),
        ])
      : http(rpcUrl, { retryCount: 2, timeout: 10000 });

  return createPublicClient({
    chain: xLayerChain,
    transport: transports,
    batch: {
      multicall: true,
    },
  });
}

export const defaultPublicClient = createXLayerPublicClient();

export interface FreshnessMetadata<T> {
  value: T;
  blockNumber: bigint;
  blockTimestamp: bigint;
  readAt: number; // Unix timestamp in seconds
}

/**
 * Executes a read operation and captures the block number and timestamp for freshness reporting.
 */
export async function readAt<T>(
  client: PublicClient,
  fn: (c: PublicClient) => Promise<T>,
): Promise<FreshnessMetadata<T>> {
  const [value, block] = await Promise.all([
    fn(client),
    client.getBlock({ blockTag: 'latest' }) as Promise<Block>,
  ]);

  return {
    value,
    blockNumber: block.number,
    blockTimestamp: block.timestamp,
    readAt: Math.floor(Date.now() / 1000),
  };
}
