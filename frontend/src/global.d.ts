declare global {
  interface EthereumProviderEvents {
    on(event: 'accountsChanged', listener: (accounts: string[]) => void): void
    on(event: 'chainChanged', listener: (chainIdHex: string) => void): void
    on(event: string, listener: (...args: unknown[]) => void): void

    removeListener(event: 'accountsChanged', listener: (accounts: string[]) => void): void
    removeListener(event: 'chainChanged', listener: (chainIdHex: string) => void): void
    removeListener(event: string, listener: (...args: unknown[]) => void): void
  }

  type EthereumProviderWithEvents = import('ethers').Eip1193Provider & {
    on?: EthereumProviderEvents['on']
    removeListener?: EthereumProviderEvents['removeListener']
  }

  interface Window {
    // Injected by MetaMask / other EIP-1193 providers
    ethereum?: EthereumProviderWithEvents
  }
}

export {}

