import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import {
  type Address,
  type WalletClient,
  type EIP1193Provider,
  createWalletClient,
  custom,
  getAddress,
} from 'viem';
import { xLayerChain } from './config.js';

export type WalletStatus = 'no_wallet' | 'disconnected' | 'locked' | 'wrong_network' | 'connected';

export interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

export interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: EIP1193Provider;
}

type AsyncVoid = Promise<void>;

interface WalletContextValue {
  status: WalletStatus;
  account: Address | null;
  chainId: number | null;
  walletClient: WalletClient | null;
  providers: EIP6963ProviderDetail[];
  selectedProvider: EIP6963ProviderDetail | null;
  connect: (uuid?: string) => AsyncVoid;
  disconnect: () => void;
  switchToXLayer: () => AsyncVoid;
}

const WalletContext = createContext<WalletContextValue | null>(null);

const STORAGE_KEY_WALLET_UUID = 'seiyaku_wallet_uuid';

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [providers, setProviders] = useState<EIP6963ProviderDetail[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<EIP6963ProviderDetail | null>(null);
  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [status, setStatus] = useState<WalletStatus>('no_wallet');

  // 1. EIP-6963 discovery
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleAnnounce = (event: Event) => {
      const customEvent = event as CustomEvent<EIP6963ProviderDetail>;
      if (!customEvent.detail || !customEvent.detail.info) return;

      setProviders((prev) => {
        if (prev.some((p) => p.info.uuid === customEvent.detail.info.uuid)) {
          return prev;
        }
        return [...prev, customEvent.detail];
      });
    };

    window.addEventListener('eip6963:announceProvider', handleAnnounce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    // Fallback: check window.ethereum
    const winEth = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
    if (winEth) {
      const fallbackDetail: EIP6963ProviderDetail = {
        info: {
          uuid: 'injected',
          name: 'Browser Wallet',
          icon: '',
          rdns: 'injected',
        },
        provider: winEth,
      };
      setProviders((prev) => (prev.length === 0 ? [fallbackDetail] : prev));
    }

    return () => window.removeEventListener('eip6963:announceProvider', handleAnnounce);
  }, []);

  // 2. Auto-select provider from storage or fallback
  useEffect(() => {
    if (selectedProvider || providers.length === 0) return;

    let rememberedUuid: string | null = null;
    try {
      rememberedUuid = window.localStorage.getItem(STORAGE_KEY_WALLET_UUID);
    } catch {
      // Ignored
    }

    const matched = rememberedUuid ? providers.find((p) => p.info.uuid === rememberedUuid) : null;

    setSelectedProvider(matched || providers[0] || null);
  }, [providers, selectedProvider]);

  // 3. Listen to chain and account change events on selected provider
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.hash.split('?')[1] || window.location.search);
      const mockAddr = q.get('mockAccount');
      if (mockAddr && mockAddr.startsWith('0x') && mockAddr.length === 42) {
        try {
          const validated = getAddress(mockAddr);
          setAccount(validated);
          setStatus('connected');
          setChainId(xLayerChain.id);
          return;
        } catch {
          // Ignored
        }
      }
    }

    if (!selectedProvider) {
      setStatus('no_wallet');
      setAccount(null);
      setChainId(null);
      return;
    }

    const provider = selectedProvider.provider;

    const syncState = async () => {
      try {
        const accountsRaw = (await provider.request({ method: 'eth_accounts' })) as string[];
        const currentChainHex = (await provider.request({ method: 'eth_chainId' })) as string;
        const currentChain = parseInt(currentChainHex, 16);
        setChainId(currentChain);

        if (!accountsRaw || accountsRaw.length === 0) {
          setStatus('disconnected');
          setAccount(null);
          return;
        }

        const validAddr = getAddress(accountsRaw[0] as string);
        setAccount(validAddr);

        if (currentChain !== xLayerChain.id) {
          setStatus('wrong_network');
        } else {
          setStatus('connected');
        }
      } catch {
        setStatus('locked');
      }
    };

    void syncState();

    const handleAccountsChanged = (accounts: unknown) => {
      const arr = accounts as string[];
      if (!arr || arr.length === 0) {
        setStatus('disconnected');
        setAccount(null);
      } else {
        setAccount(getAddress(arr[0] as string));
        setStatus(chainId === xLayerChain.id ? 'connected' : 'wrong_network');
      }
    };

    const handleChainChanged = (newChainHex: unknown) => {
      const newChain = parseInt(String(newChainHex), 16);
      setChainId(newChain);
      if (account) {
        setStatus(newChain === xLayerChain.id ? 'connected' : 'wrong_network');
      }
    };

    if ('on' in provider && typeof provider.on === 'function') {
      provider.on('accountsChanged', handleAccountsChanged);
      provider.on('chainChanged', handleChainChanged);
    }

    return () => {
      if ('removeListener' in provider && typeof provider.removeListener === 'function') {
        provider.removeListener('accountsChanged', handleAccountsChanged);
        provider.removeListener('chainChanged', handleChainChanged);
      }
    };
  }, [selectedProvider, chainId, account]);

  const connect = useCallback(
    async (targetUuid?: string) => {
      const targetProvider = targetUuid
        ? providers.find((p) => p.info.uuid === targetUuid) || selectedProvider
        : selectedProvider || providers[0];

      if (!targetProvider) {
        setStatus('no_wallet');
        return;
      }

      setSelectedProvider(targetProvider);
      try {
        window.localStorage.setItem(STORAGE_KEY_WALLET_UUID, targetProvider.info.uuid);
      } catch {
        // Ignored
      }

      try {
        const accounts = (await targetProvider.provider.request({
          method: 'eth_requestAccounts',
        })) as string[];

        const currentChainHex = (await targetProvider.provider.request({
          method: 'eth_chainId',
        })) as string;

        const currentChain = parseInt(currentChainHex, 16);
        setChainId(currentChain);

        if (accounts && accounts.length > 0) {
          setAccount(getAddress(accounts[0] as string));
          setStatus(currentChain === xLayerChain.id ? 'connected' : 'wrong_network');
        }
      } catch (err) {
        setStatus('locked');
        throw err;
      }
    },
    [providers, selectedProvider],
  );

  const disconnect = useCallback(() => {
    setAccount(null);
    setStatus('disconnected');
    try {
      window.localStorage.removeItem(STORAGE_KEY_WALLET_UUID);
    } catch {
      // Ignored
    }
  }, []);

  const switchToXLayer = useCallback(async () => {
    if (!selectedProvider) return;
    const provider = selectedProvider.provider;
    const chainIdHex = '0xc4'; // 196

    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainIdHex }],
      });
      setChainId(196);
      if (account) setStatus('connected');
    } catch (switchError: unknown) {
      const err = switchError as { code?: number };
      if (err.code === 4902) {
        // Chain not added
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: chainIdHex,
              chainName: 'X Layer',
              nativeCurrency: {
                name: 'OKB',
                symbol: 'OKB',
                decimals: 18,
              },
              rpcUrls: [xLayerChain.rpcUrls.default.http[0] ?? 'https://rpc.xlayer.tech'],
              blockExplorerUrls: ['https://www.oklink.com/xlayer'],
            },
          ],
        });
        setChainId(196);
        if (account) setStatus('connected');
      } else {
        throw switchError;
      }
    }
  }, [selectedProvider, account]);

  const walletClient = useMemo<WalletClient | null>(() => {
    if (!selectedProvider || !account || status !== 'connected') {
      return null;
    }
    return createWalletClient({
      account,
      chain: xLayerChain,
      transport: custom(selectedProvider.provider),
    });
  }, [selectedProvider, account, status]);

  const value = useMemo(
    () => ({
      status,
      account,
      chainId,
      walletClient,
      providers,
      selectedProvider,
      connect,
      disconnect,
      switchToXLayer,
    }),
    [
      status,
      account,
      chainId,
      walletClient,
      providers,
      selectedProvider,
      connect,
      disconnect,
      switchToXLayer,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
