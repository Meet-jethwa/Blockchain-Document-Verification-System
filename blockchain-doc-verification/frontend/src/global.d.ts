declare global {
  interface Window {
    // Injected by MetaMask / other EIP-1193 providers
    ethereum?: any
  }
}

export {}

