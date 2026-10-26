import { type Address, type Chain, getAddress } from 'viem';

export const xLayerChain: Chain = {
  id: 196,
  name: 'X Layer',
  nativeCurrency: {
    name: 'OKB',
    symbol: 'OKB',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.xlayer.tech', 'https://xlayerrpc.okx.com'],
    },
    public: {
      http: ['https://rpc.xlayer.tech', 'https://xlayerrpc.okx.com'],
    },
  },
  blockExplorers: {
    default: {
      name: 'OKLink',
      url: 'https://www.oklink.com/xlayer',
    },
  },
} as const;

export interface TokenConfig {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
}

export const DEFAULT_TOKENS = {
  usdc: {
    address: getAddress('0xB6CEceAB302E2E4948951eE7843FC24E92933061'),
    symbol: 'USDC',
    name: 'Native USDC',
    decimals: 6,
  },
  wokb: {
    address: getAddress('0xe538905cf8410324e03a5a23c1c177a474d59b2b'),
    symbol: 'WOKB',
    name: 'Wrapped OKB',
    decimals: 18,
  },
} as const satisfies Record<string, TokenConfig>;

/**
 * Protocol limits and constants.
 */
export const PROTOCOL_CONSTANTS = {
  depositCapUsdc: 500,
  minWithdrawDelaySec: 86400, // 24 hours
  minLoosenDelaySec: 86400, // 24 hours
  demoWithdrawDelaySec: 120, // 2 minutes
  demoLoosenDelaySec: 120, // 2 minutes
  maxDeadlineDeltaSec: 600, // 10 minutes
  githubUrl: 'https://github.com/seiyaku-vault/tapeOut',
  docsUrl: 'https://github.com/seiyaku-vault/tapeOut#readme',
} as const;

export interface FactoryRegistry {
  public: Address | null;
  demo: Address | null;
}

export const FACTORY_REGISTRY: FactoryRegistry = {
  public: null, // Placeholder until owner deploys to mainnet
  demo: null,
};

export function getExplorerUrl(
  type: 'address' | 'tx',
  value: string,
  baseUrl: string = 'https://www.oklink.com/xlayer',
): string {
  const cleanVal = value.trim();
  return `${baseUrl}/${type}/${cleanVal}`;
}

/**
 * Resolves the active RPC URL.
 */
export function getActiveRpcUrl(): string {
  if (typeof window !== 'undefined') {
    const q = new URLSearchParams(window.location.hash.split('?')[1] || window.location.search);
    const customRpc = q.get('rpc');
    if (customRpc) {
      return customRpc;
    }
  }
  return xLayerChain.rpcUrls.default.http[0] ?? 'https://rpc.xlayer.tech';
}

/**
 * Resolves the active factory address based on demo mode and dev override.
 */
export function getActiveFactoryAddress(isDemo: boolean = false): Address | null {
  if (typeof window !== 'undefined') {
    const q = new URLSearchParams(window.location.hash.split('?')[1] || window.location.search);
    const customFactory = q.get('factory');
    if (customFactory && customFactory.startsWith('0x') && customFactory.length === 42) {
      try {
        return getAddress(customFactory);
      } catch {
        // Invalid address ignored
      }
    }
  }
  return isDemo ? FACTORY_REGISTRY.demo : FACTORY_REGISTRY.public;
}
