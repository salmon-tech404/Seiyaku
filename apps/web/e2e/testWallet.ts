/**
 * apps/web/e2e/testWallet.ts
 * EIP-1193 and EIP-6963 Test Wallet Provider for End-to-End browser tests.
 *
 * Notice: This file exists ONLY in test harnesses.
 * Production static bundle verification checks that this marker never leaks into dist:
 * __SEIYAKU_E2E_TEST_WALLET__
 */

export const TEST_WALLET_MARKER = '__SEIYAKU_E2E_TEST_WALLET__';

export const TEST_ACCOUNTS = {
  deployer: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  owner: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  trader: '0xB869F594F35603f71AA7B9D3689B4ab1DE9cde83',
  stranger: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
} as const;

export interface TestWalletState {
  activeAccount: string;
  chainIdHex: string;
  rejectNext: boolean;
  rpcUrl: string;
}

/**
 * Returns the JavaScript snippet string to be evaluated via page.addInitScript()
 */
export function getTestWalletInitScript(options?: {
  initialAccount?: string;
  initialChainId?: number;
  rpcUrl?: string;
}): string {
  const account = options?.initialAccount || TEST_ACCOUNTS.owner;
  const chainId = options?.initialChainId || 196;
  const chainIdHex = '0x' + chainId.toString(16);
  const rpcUrl = options?.rpcUrl || 'http://127.0.0.1:8545';

  return `
(() => {
  // Spec requirement marker:
  window.__SEIYAKU_E2E_TEST_WALLET__ = true;

  const state = {
    activeAccount: '${account}',
    chainIdHex: '${chainIdHex}',
    rejectNext: false,
    rpcUrl: '${rpcUrl}',
    listeners: new Map(),
  };

  function emit(event, ...args) {
    const handlers = state.listeners.get(event) || [];
    for (const h of handlers) {
      try { h(...args); } catch (e) { console.error('testWallet listener error', e); }
    }
  }

  let reqId = 1;

  async function forwardRpc(method, params = []) {
    const res = await fetch(state.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: ++reqId,
        method,
        params,
      }),
    });
    const json = await res.json();
    if (json.error) {
      const err = new Error(json.error.message || 'RPC Error');
      err.code = json.error.code || -32603;
      err.data = json.error.data;
      throw err;
    }
    return json.result;
  }

  const provider = {
    isMetaMask: true,
    isSeiyakuTestWallet: true,

    async request({ method, params = [] }) {
      if (state.rejectNext) {
        state.rejectNext = false;
        const err = new Error('User rejected the request');
        err.code = 4001;
        throw err;
      }

      switch (method) {
        case 'eth_requestAccounts':
        case 'eth_accounts':
          return state.activeAccount ? [state.activeAccount] : [];

        case 'eth_chainId':
          return state.chainIdHex;

        case 'net_version':
          return parseInt(state.chainIdHex, 16).toString();

        case 'wallet_switchEthereumChain': {
          const target = params[0]?.chainId;
          if (!target) throw new Error('Missing chainId in wallet_switchEthereumChain');
          state.chainIdHex = target.toLowerCase();
          emit('chainChanged', state.chainIdHex);
          return null;
        }

        case 'wallet_addEthereumChain':
          return null;

        case 'eth_sendTransaction': {
          // Send transaction from unlocked account in Anvil
          const txParams = { ...params[0] };
          if (!txParams.from) {
            txParams.from = state.activeAccount;
          }
          return await forwardRpc('eth_sendTransaction', [txParams]);
        }

        default:
          return await forwardRpc(method, params);
      }
    },

    on(event, handler) {
      if (!state.listeners.has(event)) {
        state.listeners.set(event, []);
      }
      state.listeners.get(event).push(handler);
      return provider;
    },

    removeListener(event, handler) {
      const handlers = state.listeners.get(event);
      if (handlers) {
        const idx = handlers.indexOf(handler);
        if (idx !== -1) handlers.splice(idx, 1);
      }
      return provider;
    },
  };

  // EIP-6963 provider announcement
  const info = {
    uuid: 'seiyaku-e2e-test-wallet',
    name: 'Seiyaku Test Wallet',
    icon: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="12" cy="12" r="10" fill="%232563eb"/></svg>',
    rdns: 'io.seiyaku.testwallet',
  };

  function announce() {
    window.dispatchEvent(
      new CustomEvent('eip6963:announceProvider', {
        detail: Object.freeze({ info, provider }),
      })
    );
  }

  window.addEventListener('eip6963:requestProvider', announce);
  announce();
  window.ethereum = provider;

  // Global test harness controller
  window.__testWallet = {
    state,
    setAccount(newAccount) {
      state.activeAccount = newAccount;
      emit('accountsChanged', newAccount ? [newAccount] : []);
    },
    setChainId(newChainId) {
      state.chainIdHex = '0x' + newChainId.toString(16);
      emit('chainChanged', state.chainIdHex);
    },
    setRejectNext(val = true) {
      state.rejectNext = val;
    },
  };
})();
`;
}
