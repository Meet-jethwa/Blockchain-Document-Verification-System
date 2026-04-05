import './App.css'
import { useEffect, useMemo, useState } from 'react'
import type { RegisterResponse } from './api'
import { apiUrl, postFile } from './api'
import { ethers } from 'ethers'

function withHttps(url: string) {
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  return `https://${url}`
}

function shortHash(value: string, keep = 10) {
  if (!value) return ''
  if (value.length <= keep * 2 + 3) return value
  return `${value.slice(0, keep)}…${value.slice(-keep)}`
}

function shortAddr(addr: string) {
  return shortHash(addr, 6)
}

const DOCUMENT_REGISTRY_ABI = [
  'function registerDocument(bytes32 hash) external',
  'function addDocumentVersion(bytes32 rootHash, bytes32 hash) external',
  'function verifyDocument(bytes32 hash) external view returns (bool)',
  'function verifyMyDocument(bytes32 hash) external view returns (bool)',
  'function revokeDocument(bytes32 hash) external',
  'function revokeDocumentRoot(bytes32 rootHash) external',
  'function isDocumentRevoked(bytes32 hash) external view returns (bool)',
  'function getDocumentVersion(bytes32 hash) external view returns (bytes32 rootHash, uint256 version)',
  'function getDocumentVersions(bytes32 rootHash) external view returns (bytes32[] memory)',
  'function getDocumentMeta(bytes32 hash) external view returns (address owner, uint256 createdAt)',
  'function getMyDocuments() external view returns (bytes32[] memory)',

  'function grantRootViewer(bytes32 rootHash, address viewer) external',
  'function revokeRootViewer(bytes32 rootHash, address viewer) external',
  'function grantViewer(bytes32 hash, address viewer) external',
  'function revokeViewer(bytes32 hash, address viewer) external',
  'function canViewDocument(bytes32 hash, address user) external view returns (bool)',

  'event DocumentRegistered(bytes32 indexed hash, address indexed owner)',
  'event ViewerAccessGranted(bytes32 indexed hash, address indexed owner, address indexed viewer)',
  'event ViewerAccessRevoked(bytes32 indexed hash, address indexed owner, address indexed viewer)',
  'event RootViewerAccessGranted(bytes32 indexed rootHash, address indexed owner, address indexed viewer)',
  'event RootViewerAccessRevoked(bytes32 indexed rootHash, address indexed owner, address indexed viewer)',
]

async function hashFileKeccak256(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  return ethers.keccak256(new Uint8Array(buf))
}

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(u8.byteLength)
  copy.set(u8)
  return copy.buffer
}

function extractFilename(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null
  const m = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(contentDisposition)
  const raw = (m?.[1] || m?.[2])?.trim()
  if (!raw) return null
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

async function downloadDecryptedFromBackend(hash: string, walletAddress: string) {
  const res = await fetch(apiUrl(`/api/documents/${hash}/download`), {
    method: 'GET',
    headers: {
      'x-wallet-address': walletAddress,
    },
  })
  if (!res.ok) {
    let msg = `Download failed (${res.status})`
    try {
      const data = (await res.json()) as { error?: string }
      if (data?.error) msg = String(data.error)
    } catch {
      // ignore
    }
    throw new Error(msg)
  }

  const bytes = new Uint8Array(await res.arrayBuffer())
  const filename = extractFilename(res.headers.get('content-disposition')) || 'document'
  const mimetype = res.headers.get('content-type') || 'application/octet-stream'
  downloadBytes(bytes, filename, mimetype)
  return filename
}

function downloadBytes(bytes: Uint8Array, filename: string, mimetype: string) {
  const blob = new Blob([toArrayBuffer(bytes)], { type: mimetype || 'application/octet-stream' })
  const blobUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = filename || 'download'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(blobUrl), 2000)
}

function App() {
  const [registerFile, setRegisterFile] = useState<File | null>(null)

  const [registerLoading, setRegisterLoading] = useState(false)

  const [registerError, setRegisterError] = useState<string | null>(null)

  const [registerResult, setRegisterResult] = useState<RegisterResponse | null>(null)

  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [walletChainId, setWalletChainId] = useState<number | null>(null)
  const [walletError, setWalletError] = useState<string | null>(null)

  const [contractAddress, setContractAddress] = useState<string | null>(null)
  const [backendChainId, setBackendChainId] = useState<number | null>(null)

  const [myDocs, setMyDocs] = useState<
    Array<{ hash: string; rootHash: string; version: number; cid: string | null; createdAt: number; url: string | null; revoked: boolean }>
  >([])
  const [myDocsLoading, setMyDocsLoading] = useState(false)
  const [myDocsError, setMyDocsError] = useState<string | null>(null)
  const [myDownloadLoadingByHash, setMyDownloadLoadingByHash] = useState<Record<string, boolean>>({})
  const [myDownloadStatusByHash, setMyDownloadStatusByHash] = useState<Record<string, string | null>>({})

  const [shareAddressByHash, setShareAddressByHash] = useState<Record<string, string>>({})
  const [shareStatusByHash, setShareStatusByHash] = useState<Record<string, string | null>>({})
  const [shareLoadingByHash, setShareLoadingByHash] = useState<Record<string, boolean>>({})

  const [sharedHashes, setSharedHashes] = useState<string[]>([])
  const [sharedDocs, setSharedDocs] = useState<
    Array<{
      hash: string
      owner: string | null
      rootHash: string | null
      version: number | null
      cid: string | null
      createdAt: number | null
      url: string | null
      access: boolean
      revoked: boolean
      status: string | null
    }>
  >([])
  const [sharedDocsLoading, setSharedDocsLoading] = useState(false)
  const [sharedDocsError, setSharedDocsError] = useState<string | null>(null)
  const [sharedDownloadLoadingByHash, setSharedDownloadLoadingByHash] = useState<Record<string, boolean>>({})
  const [sharedDownloadStatusByHash, setSharedDownloadStatusByHash] = useState<Record<string, string | null>>({})

  const [revokeLoadingByHash, setRevokeLoadingByHash] = useState<Record<string, boolean>>({})
  const [revokeStatusByHash, setRevokeStatusByHash] = useState<Record<string, string | null>>({})
  const [revokeRootLoadingByRoot, setRevokeRootLoadingByRoot] = useState<Record<string, boolean>>({})
  const [revokeRootStatusByRoot, setRevokeRootStatusByRoot] = useState<Record<string, string | null>>({})

  const [newVersionFileByRoot, setNewVersionFileByRoot] = useState<Record<string, File | null>>({})
  const [newVersionLoadingByRoot, setNewVersionLoadingByRoot] = useState<Record<string, boolean>>({})
  const [newVersionStatusByRoot, setNewVersionStatusByRoot] = useState<Record<string, string | null>>({})

  const [versionsByRootHash, setVersionsByRootHash] = useState<Record<string, string[] | null>>({})
  const [versionsLoadingByRoot, setVersionsLoadingByRoot] = useState<Record<string, boolean>>({})
  const [versionsErrorByRoot, setVersionsErrorByRoot] = useState<Record<string, string | null>>({})

  const [verifyFile, setVerifyFile] = useState<File | null>(null)
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [verifyResult, setVerifyResult] = useState<{ hash: string; verified: boolean; owner?: string | null } | null>(null)

  const canRegister = useMemo(
    () => !!registerFile && !registerLoading,
    [registerFile, registerLoading],
  )
  const canVerify = useMemo(() => !!verifyFile && !verifyLoading, [verifyFile, verifyLoading])

  const walletConnected = !!walletAddress
  const chainMismatch =
    walletChainId != null && backendChainId != null ? walletChainId !== backendChainId : false

  useEffect(() => {
    let cancelled = false
    async function loadHealth() {
      try {
        const res = await fetch(apiUrl('/api/health'))
        const data = await res.json()
        if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`)
        if (cancelled) return
        setContractAddress(String(data.contractAddress))
        setBackendChainId(typeof data.chainId === 'number' ? data.chainId : Number(data.chainId))
        // ipfsGatewayBaseUrl is no longer needed on the frontend (CID not stored on-chain)
      } catch {
        // Non-fatal; UI can still render.
      }
    }
    loadHealth()
    return () => {
      cancelled = true
    }
  }, [])

  async function promptWalletAccountSelection() {
    setWalletError(null)
    const eth = window.ethereum
    if (!eth) {
      setWalletError('No wallet detected. Install MetaMask (or another EVM wallet).')
      return
    }

    try {
      // Some wallets (e.g., MetaMask) support prompting the account picker via permissions.
      // Fallback to eth_requestAccounts which will prompt if needed.
      try {
        await eth.request({
          method: 'wallet_requestPermissions',
          params: [{ eth_accounts: {} }],
        })
      } catch {
        // Ignore if unsupported.
      }

      const accounts = (await eth.request({ method: 'eth_requestAccounts' })) as string[]
      const chainIdHex = (await eth.request({ method: 'eth_chainId' })) as string
      setWalletAddress(accounts?.[0] ?? null)
      setWalletChainId(Number(BigInt(chainIdHex)))
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : String(err))
    }
  }

  function disconnectWalletUiOnly() {
    // Wallet extensions don't support programmatic disconnect reliably.
    // This clears app state so the user can reconnect/select another account.
    setWalletError(null)
    setWalletAddress(null)
    setWalletChainId(null)
  }

  useEffect(() => {
    const eth = window.ethereum
    if (!eth) return

    const onAccountsChanged = (accounts: string[]) => {
      setWalletAddress(accounts?.[0] ?? null)
    }
    const onChainChanged = (chainIdHex: string) => {
      try {
        setWalletChainId(Number(BigInt(chainIdHex)))
      } catch {
        setWalletChainId(null)
      }
    }

    eth.on?.('accountsChanged', onAccountsChanged)
    eth.on?.('chainChanged', onChainChanged)
    return () => {
      eth.removeListener?.('accountsChanged', onAccountsChanged)
      eth.removeListener?.('chainChanged', onChainChanged)
    }
  }, [])

  async function connectWallet() {
    await promptWalletAccountSelection()
  }

  async function getSignerAndContract() {
    if (!contractAddress) throw new Error('Contract address not loaded. Is the backend running?')
    const eth = window.ethereum
    if (!eth) throw new Error('No wallet detected.')
    const provider = new ethers.BrowserProvider(eth)
    const signer = await provider.getSigner()
    const contract = new ethers.Contract(contractAddress, DOCUMENT_REGISTRY_ABI, signer)
    return { provider, signer, contract }
  }

  async function refreshMyDocuments() {
    setMyDocsError(null)
    setMyDocsLoading(true)
    try {
      const { contract } = await getSignerAndContract()
      const hashes = (await contract.getMyDocuments()) as string[]
      const docs = await Promise.all(
        hashes.map(async (hash) => {
          const [, createdAt] = (await contract.getDocumentMeta(hash)) as [string, bigint]
          const [rootHash, versionBig] = (await contract.getDocumentVersion(hash)) as [string, bigint]
          const revoked = (await contract.isDocumentRevoked(hash)) as boolean

          return {
            hash,
            rootHash,
            version: Number(versionBig),
            cid: null,
            createdAt: Number(createdAt),
            url: null,
            revoked,
          }
        }),
      )
      setMyDocs(docs.slice().reverse())
    } catch (err) {
      setMyDocsError(err instanceof Error ? err.message : String(err))
    } finally {
      setMyDocsLoading(false)
    }
  }

  async function grantViewerAccess(hash: string, viewer: string) {
    setShareStatusByHash((prev) => ({ ...prev, [hash]: null }))
    setShareLoadingByHash((prev) => ({ ...prev, [hash]: true }))
    try {
      if (!walletConnected) {
        await connectWallet()
      }
      const { contract } = await getSignerAndContract()
      const normalized = ethers.getAddress(viewer)
      const [rootHash] = (await contract.getDocumentVersion(hash)) as [string, bigint]
      const tx = await contract.grantRootViewer(rootHash, normalized)
      await tx.wait()
      setShareStatusByHash((prev) => ({ ...prev, [hash]: `Granted viewer access to ${shortAddr(normalized)}.` }))
    } catch (err) {
      setShareStatusByHash((prev) => ({ ...prev, [hash]: err instanceof Error ? err.message : String(err) }))
    } finally {
      setShareLoadingByHash((prev) => ({ ...prev, [hash]: false }))
    }
  }

  async function revokeViewerAccess(hash: string, viewer: string) {
    setShareStatusByHash((prev) => ({ ...prev, [hash]: null }))
    setShareLoadingByHash((prev) => ({ ...prev, [hash]: true }))
    try {
      if (!walletConnected) {
        await connectWallet()
      }
      const { contract } = await getSignerAndContract()
      const normalized = ethers.getAddress(viewer)
      const [rootHash] = (await contract.getDocumentVersion(hash)) as [string, bigint]
      const tx = await contract.revokeRootViewer(rootHash, normalized)
      await tx.wait()
      setShareStatusByHash((prev) => ({ ...prev, [hash]: `Revoked viewer access from ${shortAddr(normalized)}.` }))
    } catch (err) {
      setShareStatusByHash((prev) => ({ ...prev, [hash]: err instanceof Error ? err.message : String(err) }))
    } finally {
      setShareLoadingByHash((prev) => ({ ...prev, [hash]: false }))
    }
  }

  async function refreshSharedDocuments(hashesOverride?: string[]) {
    setSharedDocsError(null)
    setSharedDocsLoading(true)
    try {
      const hashesToLoad = hashesOverride ?? sharedHashes
      if (hashesToLoad.length === 0) {
        setSharedDocs([])
        return
      }

      if (!walletConnected) {
        await connectWallet()
      }

      const { contract, signer } = await getSignerAndContract()
      const viewer = await signer.getAddress()

      const docs = await Promise.all(
        hashesToLoad.map(async (hash) => {
          if (!hash.startsWith('0x') || hash.length !== 66) {
            return {
              hash,
              owner: null,
              rootHash: null,
              version: null,
              cid: null,
              createdAt: null,
              url: null,
              access: false,
              revoked: false,
              status: 'Invalid hash format',
            }
          }

          let access = false
          try {
            access = (await contract.canViewDocument(hash, viewer)) as boolean
          } catch (err) {
            return {
              hash,
              owner: null,
              rootHash: null,
              version: null,
              cid: null,
              createdAt: null,
              url: null,
              access: false,
              revoked: false,
              status: err instanceof Error ? err.message : String(err),
            }
          }

          if (!access) {
            return {
              hash,
              owner: null,
              rootHash: null,
              version: null,
              cid: null,
              createdAt: null,
              url: null,
              access: false,
              revoked: false,
              status: 'No viewer access (or revoked)',
            }
          }

          let rootHash: string | null = null
          let version: number | null = null
          try {
            const [rh, vb] = (await contract.getDocumentVersion(hash)) as [string, bigint]
            rootHash = rh
            version = Number(vb)
          } catch {
            // optional
          }

          const revoked = (await contract.isDocumentRevoked(hash)) as boolean

          let owner: string | null = null
          let createdAtNum: number | null = null
          try {
            const [docOwner, docCreatedAt] = (await contract.getDocumentMeta(hash)) as [string, bigint]
            owner = docOwner
            createdAtNum = Number(docCreatedAt)
          } catch {
            // non-fatal
          }

          return {
            hash,
            owner,
            rootHash,
            version,
            cid: null,
            createdAt: createdAtNum,
            url: null,
            access: true,
            revoked,
            status: revoked ? 'Revoked' : null,
          }
        }),
      )

      setSharedDocs(docs)
    } catch (err) {
      setSharedDocsError(err instanceof Error ? err.message : String(err))
    } finally {
      setSharedDocsLoading(false)
    }
  }

  async function loadSharedDocumentsFromBlockchain() {
    setSharedDocsError(null)
    setSharedDocsLoading(true)
    try {
      if (!walletConnected) {
        await connectWallet()
      }

      const { contract, signer } = await getSignerAndContract()
      const viewer = await signer.getAddress()

      // Pull viewer access changes from logs and replay them to compute current grants.
      // This avoids storing per-viewer arrays on-chain (better privacy + cheaper).
      const [rootGranted, rootRevoked, hashGranted, hashRevoked] = await Promise.all([
        contract.queryFilter(contract.filters.RootViewerAccessGranted(null, null, viewer), 0, 'latest'),
        contract.queryFilter(contract.filters.RootViewerAccessRevoked(null, null, viewer), 0, 'latest'),
        contract.queryFilter(contract.filters.ViewerAccessGranted(null, null, viewer), 0, 'latest'),
        contract.queryFilter(contract.filters.ViewerAccessRevoked(null, null, viewer), 0, 'latest'),
      ])

      const timeline: Array<
        | { kind: 'rootGrant' | 'rootRevoke'; blockNumber: number; logIndex: number; rootHash: string }
        | { kind: 'hashGrant' | 'hashRevoke'; blockNumber: number; logIndex: number; hash: string }
      > = []

      for (const ev of rootGranted) {
        if (!('args' in ev)) continue
        timeline.push({
          kind: 'rootGrant',
          blockNumber: ev.blockNumber ?? 0,
          logIndex: ev.index ?? 0,
          rootHash: String(ev.args?.[0] ?? ''),
        })
      }
      for (const ev of rootRevoked) {
        if (!('args' in ev)) continue
        timeline.push({
          kind: 'rootRevoke',
          blockNumber: ev.blockNumber ?? 0,
          logIndex: ev.index ?? 0,
          rootHash: String(ev.args?.[0] ?? ''),
        })
      }
      for (const ev of hashGranted) {
        if (!('args' in ev)) continue
        timeline.push({
          kind: 'hashGrant',
          blockNumber: ev.blockNumber ?? 0,
          logIndex: ev.index ?? 0,
          hash: String(ev.args?.[0] ?? ''),
        })
      }
      for (const ev of hashRevoked) {
        if (!('args' in ev)) continue
        timeline.push({
          kind: 'hashRevoke',
          blockNumber: ev.blockNumber ?? 0,
          logIndex: ev.index ?? 0,
          hash: String(ev.args?.[0] ?? ''),
        })
      }

      timeline.sort((a, b) => (a.blockNumber - b.blockNumber) || (a.logIndex - b.logIndex))

      const grantedRoots = new Map<string, boolean>()
      const grantedHashes = new Map<string, boolean>()
      for (const item of timeline) {
        if (item.kind === 'rootGrant') grantedRoots.set(item.rootHash, true)
        if (item.kind === 'rootRevoke') grantedRoots.set(item.rootHash, false)
        if (item.kind === 'hashGrant') grantedHashes.set(item.hash, true)
        if (item.kind === 'hashRevoke') grantedHashes.set(item.hash, false)
      }

      const activeRoots = Array.from(grantedRoots.entries())
        .filter(([, isGranted]) => isGranted)
        .map(([root]) => root)
        .filter((x) => typeof x === 'string' && x.startsWith('0x') && x.length === 66)

      const activeHashes = Array.from(grantedHashes.entries())
        .filter(([, isGranted]) => isGranted)
        .map(([hash]) => hash)
        .filter((x) => typeof x === 'string' && x.startsWith('0x') && x.length === 66)

      // Expand roots into version hashes, then merge with single-hash grants.
      const hashesFromRoots = (
        await Promise.all(
          activeRoots.map(async (rootHash) => {
            try {
              const versions = (await contract.getDocumentVersions(rootHash)) as string[]
              return versions.map(String)
            } catch {
              return [] as string[]
            }
          }),
        )
      ).flat()

      const allHashes = Array.from(new Set([...hashesFromRoots, ...activeHashes]))

      // Cache in-state (not persisted) so Remove works and refresh can re-use.
      setSharedHashes(allHashes)

      await refreshSharedDocuments(allHashes)

      // If nothing found, show a clear message.
      if (allHashes.length === 0) {
        setSharedDocsError('No shared documents found for your wallet.')
      }
    } catch (err) {
      setSharedDocsError(err instanceof Error ? err.message : String(err))
      setSharedDocs([])
    } finally {
      setSharedDocsLoading(false)
    }
  }

  function removeSharedHash(hash: string) {
    setSharedHashes((prev) => prev.filter((h) => h !== hash))
    setSharedDocs((prev) => prev.filter((d) => d.hash !== hash))
    setSharedDownloadStatusByHash((prev) => {
      const next = { ...prev }
      delete next[hash]
      return next
    })
  }

  async function downloadMyHash(hash: string) {
    setMyDownloadStatusByHash((prev) => ({ ...prev, [hash]: null }))
    setMyDownloadLoadingByHash((prev) => ({ ...prev, [hash]: true }))
    try {
      if (!walletConnected) {
        await connectWallet()
      }
      if (!walletAddress) throw new Error('Connect wallet first.')
      const filename = await downloadDecryptedFromBackend(hash, walletAddress)
      setMyDownloadStatusByHash((prev) => ({ ...prev, [hash]: `Downloaded: ${filename}` }))
    } catch (err) {
      setMyDownloadStatusByHash((prev) => ({ ...prev, [hash]: err instanceof Error ? err.message : String(err) }))
    } finally {
      setMyDownloadLoadingByHash((prev) => ({ ...prev, [hash]: false }))
    }
  }

  async function downloadOrDecryptSharedHash(hash: string) {
    setSharedDownloadStatusByHash((prev) => ({ ...prev, [hash]: null }))
    setSharedDownloadLoadingByHash((prev) => ({ ...prev, [hash]: true }))
    try {
      if (!walletConnected) {
        await connectWallet()
      }
      if (!walletAddress) throw new Error('Connect wallet first.')
      const filename = await downloadDecryptedFromBackend(hash, walletAddress)
      setSharedDownloadStatusByHash((prev) => ({ ...prev, [hash]: `Downloaded: ${filename}` }))
    } catch (err) {
      setSharedDownloadStatusByHash((prev) => ({ ...prev, [hash]: err instanceof Error ? err.message : String(err) }))
    } finally {
      setSharedDownloadLoadingByHash((prev) => ({ ...prev, [hash]: false }))
    }
  }

  async function onVerifySubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!verifyFile) return

    setVerifyError(null)
    setVerifyResult(null)
    setVerifyLoading(true)
    try {
      if (!walletConnected) {
        await connectWallet()
      }
      const { contract } = await getSignerAndContract()
      const hash = await hashFileKeccak256(verifyFile)

      const verified = (await contract.verifyMyDocument(hash)) as boolean

      let owner: string | null = null
      if (verified) {
        try {
          const [docOwner] = (await contract.getDocumentMeta(hash)) as [string, bigint]
          owner = docOwner
        } catch {
          // non-fatal
        }
      }

      setVerifyResult({ hash, verified, owner })
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : String(err))
    } finally {
      setVerifyLoading(false)
    }
  }

  async function onRegisterSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!registerFile) return

    setRegisterError(null)
    setRegisterResult(null)
    setRegisterLoading(true)
    try {
      // Step 0: Ensure wallet is connected (backend links encryption material to owner)
      if (!walletConnected) {
        await connectWallet()
      }
      if (!walletAddress) throw new Error('Connect wallet first.')

      // Step 1: Upload to backend (backend encrypts + uploads to IPFS; CID + key stay server-side)
      const upload = await postFile<RegisterResponse>(apiUrl('/api/upload'), registerFile, {
        headers: { 'x-wallet-address': walletAddress },
      })
      setRegisterResult({
        ...upload,
        message: 'Accept the transaction in MetaMask.',
      })

      if (upload.alreadyRegistered) {
        return
      }

      // Step 2: Register the document hash on-chain (CID stays off-chain)
      const { contract } = await getSignerAndContract()

      const tx = await contract.registerDocument(upload.hash)
      const receipt = await tx.wait()
      setRegisterResult({
        ...upload,
        message: 'Registered successfully. Document hash recorded on-chain.',
        chain: {
          ...upload.chain,
          txHash: tx.hash,
          blockNumber: receipt?.blockNumber ?? null,
        },
      })

      // Update "My documents"
      await refreshMyDocuments()
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : String(err))
    } finally {
      setRegisterLoading(false)
    }
  }

  async function revokeThisVersion(hash: string) {
    setRevokeStatusByHash((prev) => ({ ...prev, [hash]: null }))
    setRevokeLoadingByHash((prev) => ({ ...prev, [hash]: true }))
    try {
      if (!walletConnected) {
        await connectWallet()
      }
      const { contract } = await getSignerAndContract()
      const tx = await contract.revokeDocument(hash)
      await tx.wait()
      setRevokeStatusByHash((prev) => ({ ...prev, [hash]: 'Revoked this version.' }))
      await refreshMyDocuments()
    } catch (err) {
      setRevokeStatusByHash((prev) => ({ ...prev, [hash]: err instanceof Error ? err.message : String(err) }))
    } finally {
      setRevokeLoadingByHash((prev) => ({ ...prev, [hash]: false }))
    }
  }

  async function revokeAllVersions(rootHash: string) {
    setRevokeRootStatusByRoot((prev) => ({ ...prev, [rootHash]: null }))
    setRevokeRootLoadingByRoot((prev) => ({ ...prev, [rootHash]: true }))
    try {
      if (!walletConnected) {
        await connectWallet()
      }
      const { contract } = await getSignerAndContract()
      const tx = await contract.revokeDocumentRoot(rootHash)
      await tx.wait()
      setRevokeRootStatusByRoot((prev) => ({ ...prev, [rootHash]: 'Revoked the entire document root.' }))
      await refreshMyDocuments()
    } catch (err) {
      setRevokeRootStatusByRoot((prev) => ({ ...prev, [rootHash]: err instanceof Error ? err.message : String(err) }))
    } finally {
      setRevokeRootLoadingByRoot((prev) => ({ ...prev, [rootHash]: false }))
    }
  }

  async function addNewVersion(rootHash: string) {
    setNewVersionStatusByRoot((prev) => ({ ...prev, [rootHash]: null }))
    setNewVersionLoadingByRoot((prev) => ({ ...prev, [rootHash]: true }))
    try {
      const file = newVersionFileByRoot[rootHash]
      if (!file) throw new Error('Choose a file for the new version first.')

      if (!walletConnected) {
        await connectWallet()
      }
      if (!walletAddress) throw new Error('Connect wallet first.')

      const upload = await postFile<RegisterResponse>(apiUrl('/api/upload'), file, {
        headers: { 'x-wallet-address': walletAddress },
      })

      if (upload.alreadyRegistered) {
        throw new Error('This file hash is already registered; choose a different file/version.')
      }

      const { contract } = await getSignerAndContract()
      const tx = await contract.addDocumentVersion(rootHash, upload.hash)
      await tx.wait()

      setNewVersionStatusByRoot((prev) => ({ ...prev, [rootHash]: `Added new version (tx: ${shortHash(tx.hash, 10)}).` }))
      setNewVersionFileByRoot((prev) => ({ ...prev, [rootHash]: null }))
      await refreshMyDocuments()
    } catch (err) {
      setNewVersionStatusByRoot((prev) => ({ ...prev, [rootHash]: err instanceof Error ? err.message : String(err) }))
    } finally {
      setNewVersionLoadingByRoot((prev) => ({ ...prev, [rootHash]: false }))
    }
  }

  async function loadVersionsForRoot(rootHash: string) {
    setVersionsErrorByRoot((prev) => ({ ...prev, [rootHash]: null }))
    setVersionsLoadingByRoot((prev) => ({ ...prev, [rootHash]: true }))
    try {
      const { contract } = await getSignerAndContract()
      const versions = (await contract.getDocumentVersions(rootHash)) as string[]
      setVersionsByRootHash((prev) => ({ ...prev, [rootHash]: versions }))
    } catch (err) {
      setVersionsErrorByRoot((prev) => ({ ...prev, [rootHash]: err instanceof Error ? err.message : String(err) }))
    } finally {
      setVersionsLoadingByRoot((prev) => ({ ...prev, [rootHash]: false }))
    }
  }

  const registerIpfsUrl = registerResult?.ipfs?.url ? withHttps(registerResult.ipfs.url) : null

  return (
    <div className="site">
      <nav className="nav">
        <div className="navInner">
          <a className="brand" href="#home" aria-label="Home">
            <span className="brandMark" aria-hidden="true" />
            <span className="brandText">DocuChain</span>
          </a>
          <div className="navLinks">
            <a href="#home">Home</a>
            <a href="#upload">Upload</a>
            <a href="#verify">Verify</a>
            <a href="#mydocs">My Docs</a>
            <a href="#sharedDocs">Shared Docs</a>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {walletConnected ? (
              <>
                <span className="muted" title={walletAddress ?? ''}>
                  {shortAddr(walletAddress ?? '')}
                </span>
                <button className="btnGhost" type="button" onClick={promptWalletAccountSelection}>
                  Change account
                </button>
                <button className="btnGhost" type="button" onClick={disconnectWalletUiOnly}>
                  Disconnect
                </button>
              </>
            ) : (
              <button className="btnGhost" type="button" onClick={connectWallet}>
                Connect Wallet
              </button>
            )}
            <a className="navCta" href={apiUrl('/api/health')} target="_blank" rel="noreferrer">
              API Health
            </a>
          </div>
        </div>
      </nav>

      <header id="home" className="hero">
        <div className="container">
          <h1 className="heroTitle">
            Build <span className="accent">trust</span> into your documents
          </h1>
          <p className="heroSub">
            Upload a document to store its hash on-chain and its content on IPFS. Share access by wallet address and
            manage versions and revocations.
          </p>
          <div className="heroActions">
            <a className="btnPrimary" href="#upload">
              Upload Document
            </a>
            <a className="btnGhost" href="#mydocs">
              My Docs
            </a>
          </div>

          <div className="featureRow">
            <div className="featureCard">
              <div className="featureIcon">LC</div>
              <div>
                <div className="featureTitle">Lower cost</div>
                <div className="featureText">Only the document hash is stored on-chain.</div>
              </div>
            </div>
            <div className="featureCard">
              <div className="featureIcon">FP</div>
              <div>
                <div className="featureTitle">Fast Process</div>
                <div className="featureText">Verification is a quick on-chain check.</div>
              </div>
            </div>
            <div className="featureCard">
              <div className="featureIcon">SC</div>
              <div>
                <div className="featureTitle">Secure</div>
                <div className="featureText">Tamper-evident: content changes ⇒ hash changes.</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container">
        {(walletError || chainMismatch) && (
          <div className="alert bad" style={{ marginTop: 18 }}>
            {walletError ? walletError : null}
            {walletError && chainMismatch ? ' ' : null}
            {chainMismatch ? `Wrong network: wallet chainId=${walletChainId} but backend is on chainId=${backendChainId}.` : null}
          </div>
        )}

        <section id="upload" className="section">
          <div className="sectionHead">
            <h2>Upload Document</h2>
            <p className="muted">
              Upload a file to IPFS, then register its hash on-chain using your connected wallet (prevents relay/replay).
            </p>
          </div>

          <div className="panel">
            <form className="formRow" onSubmit={onRegisterSubmit}>
              <label className="fileInput">
                <span className="label">Choose file</span>
                <input type="file" onChange={(e) => setRegisterFile(e.target.files?.[0] ?? null)} required />
              </label>
              <button className="btnPrimary" type="submit" disabled={!canRegister}>
                {registerLoading ? 'Uploading…' : 'Upload'}
              </button>
            </form>

            {registerError && <div className="alert bad">{registerError}</div>}

            {registerResult && (
              <div className="resultBox">
                <div className={`status ${registerResult.message?.toLowerCase().includes('registered') ? 'ok' : 'ok'}`}>
                  {registerResult.message ?? 'Registered successfully'}
                </div>

                <div className="kvGrid">
                  <div className="kvItem">
                    <div className="k">Hash</div>
                    <div className="v mono">{registerResult.hash}</div>
                  </div>

                  <div className="kvItem">
                    <div className="k">IPFS</div>
                    <div className="v">
                      {registerIpfsUrl ? (
                        <a className="link" href={registerIpfsUrl} target="_blank" rel="noreferrer">
                          {shortHash(registerIpfsUrl, 22)}
                        </a>
                      ) : (
                        <span className="muted">{registerResult.ipfs.provider ?? 'not available'}</span>
                      )}
                    </div>
                  </div>

                  <div className="kvItem">
                    <div className="k">Tx</div>
                    <div className="v mono">{registerResult.chain.txHash ?? '—'}</div>
                  </div>

                  <div className="kvItem">
                    <div className="k">Block</div>
                    <div className="v">{registerResult.chain.blockNumber ?? '—'}</div>
                  </div>

                  <div className="kvItem">
                    <div className="k">Encryption</div>
                    <div className="v">
                      {registerResult.encryption?.enabled ? (
                        <span className="mono">
                          {'format' in registerResult.encryption
                            ? `${registerResult.encryption.format} (${registerResult.encryption.cipher})`
                            : registerResult.encryption.cipher}
                        </span>
                      ) : (
                        <span className="muted">off</span>
                      )}
                    </div>
                  </div>
                </div>

                {registerIpfsUrl && (
                  <div className="resultActions">
                    <a className="btnGhost" href={registerIpfsUrl} target="_blank" rel="noreferrer">
                      View on IPFS
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <section id="verify" className="section">
          <div className="sectionHead">
            <h2>Verify Document</h2>
            <p className="muted">
              Upload a file to hash it and check if that hash is registered on-chain by your connected wallet.
              This reads directly from the blockchain -- not from any JSON file or database.
            </p>
          </div>

          <div className="panel">
            <form className="formRow" onSubmit={onVerifySubmit}>
              <label className="fileInput">
                <span className="label">Choose file</span>
                <input type="file" onChange={(e) => setVerifyFile(e.target.files?.[0] ?? null)} required />
              </label>
              <button className="btnPrimary" type="submit" disabled={!canVerify}>
                {verifyLoading ? 'Verifying…' : 'Verify'}
              </button>
            </form>

            {verifyError && <div className="alert bad">{verifyError}</div>}

            {verifyResult && (
              <div className="resultBox">
                <div className={`status ${verifyResult.verified ? 'ok' : 'bad'}`}>
                  {verifyResult.verified ? 'Document Verified (on-chain, wallet-bound)' : 'Not Verified'}
                </div>
                <div className="kvGrid">
                  <div className="kvItem">
                    <div className="k">Hash</div>
                    <div className="v mono">{verifyResult.hash}</div>
                  </div>
                  {verifyResult.owner && (
                    <div className="kvItem">
                      <div className="k">Owner</div>
                      <div className="v mono">{shortAddr(verifyResult.owner)}</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        <section id="mydocs" className="section">
          <div className="sectionHead">
            <h2>My Documents</h2>
            <p className="muted">Documents registered by your connected wallet. You can also share viewer access by wallet address.</p>
          </div>

          <div className="panel">
            <div className="formRow" style={{ justifyContent: 'space-between' }}>
              <button
                className="btnPrimary"
                type="button"
                onClick={refreshMyDocuments}
                disabled={!walletConnected || myDocsLoading}
              >
                {myDocsLoading ? 'Loading…' : 'Load My Docs'}
              </button>
              {contractAddress && (
                <span className="muted mono" title={contractAddress}>
                  Contract: {shortAddr(contractAddress)}
                </span>
              )}
            </div>

            {myDocsError && <div className="alert bad">{myDocsError}</div>}

            {walletConnected && !myDocsLoading && myDocs.length === 0 && (
              <div className="muted">No documents found for this wallet yet.</div>
            )}

            {myDocs.length > 0 && (
              <div className="resultBox">
                <div className="kvGrid">
                  {myDocs.map((d) => (
                    <div className="kvItem" key={d.hash}>
                      <div className="k">CID</div>
                      <div className="v docContent">
                        {d.revoked ? (
                          <div>
                            <div className="status bad" style={{ display: 'inline-block' }}>
                              Revoked
                            </div>
                            <div className="muted" style={{ marginTop: 6 }}>
                              This version is revoked on-chain.
                            </div>
                          </div>
                        ) : d.cid && d.url ? (
                          <a className="link" href={withHttps(d.url)} target="_blank" rel="noreferrer">
                            {shortHash(d.cid, 18)}
                          </a>
                        ) : (
                          <div className="muted" style={{ marginTop: 2 }}>
                            CID is kept off-chain.
                          </div>
                        )}

                        <div className="docRow" style={{ marginTop: 10 }}>
                          <button
                            className="btnGhost"
                            type="button"
                            disabled={!walletConnected || !!myDownloadLoadingByHash[d.hash]}
                            onClick={() => downloadMyHash(d.hash)}
                          >
                            {myDownloadLoadingByHash[d.hash] ? 'Downloading…' : 'Download'}
                          </button>
                        </div>

                        {myDownloadStatusByHash[d.hash] && (
                          <div
                            className={`alert ${myDownloadStatusByHash[d.hash]!.toLowerCase().includes('downloaded') ? 'ok' : 'bad'}`}
                          >
                            {myDownloadStatusByHash[d.hash]}
                          </div>
                        )}
                        <div className="muted mono docMetaLine">
                          {shortHash(d.hash, 14)}
                        </div>

                        <div className="muted mono docMetaLine">
                          Root: {shortHash(d.rootHash, 14)} · v{d.version}
                        </div>

                        <div className="docSection">
                          <div className="docHint">
                            Share viewer access (wallet address)
                          </div>
                          <div className="docRow">
                            <input
                              className="textInput"
                              value={shareAddressByHash[d.hash] ?? ''}
                              onChange={(e) =>
                                setShareAddressByHash((prev) => ({ ...prev, [d.hash]: e.target.value }))
                              }
                              placeholder="0x..."
                            />
                            <div className="docButtons">
                              <button
                                className="btnGhost"
                                type="button"
                                disabled={!walletConnected || !!shareLoadingByHash[d.hash]}
                                onClick={() => grantViewerAccess(d.hash, shareAddressByHash[d.hash] ?? '')}
                              >
                                {shareLoadingByHash[d.hash] ? 'Working…' : 'Grant'}
                              </button>
                              <button
                                className="btnGhost"
                                type="button"
                                disabled={!walletConnected || !!shareLoadingByHash[d.hash]}
                                onClick={() => revokeViewerAccess(d.hash, shareAddressByHash[d.hash] ?? '')}
                              >
                                {shareLoadingByHash[d.hash] ? 'Working…' : 'Revoke'}
                              </button>
                            </div>
                          </div>
                          {shareStatusByHash[d.hash] && (
                            <div className={`alert ${shareStatusByHash[d.hash]?.toLowerCase().includes('revoked') || shareStatusByHash[d.hash]?.toLowerCase().includes('granted') ? 'ok' : 'bad'}`}>
                              {shareStatusByHash[d.hash]}
                            </div>
                          )}
                        </div>

                        {!d.revoked && (
                          <div className="docRow">
                            <button
                              className="btnGhost"
                              type="button"
                              disabled={!walletConnected || !!revokeLoadingByHash[d.hash]}
                              onClick={() => revokeThisVersion(d.hash)}
                            >
                              {revokeLoadingByHash[d.hash] ? 'Revoking…' : 'Revoke version'}
                            </button>

                            {d.hash === d.rootHash && (
                              <button
                                className="btnGhost"
                                type="button"
                                disabled={!walletConnected || !!revokeRootLoadingByRoot[d.rootHash]}
                                onClick={() => revokeAllVersions(d.rootHash)}
                              >
                                {revokeRootLoadingByRoot[d.rootHash] ? 'Revoking…' : 'Revoke all versions'}
                              </button>
                            )}
                          </div>
                        )}

                        {(revokeStatusByHash[d.hash] || (d.hash === d.rootHash && revokeRootStatusByRoot[d.rootHash])) && (
                          <div className="alert ok">
                            {revokeStatusByHash[d.hash] ?? revokeRootStatusByRoot[d.rootHash]}
                          </div>
                        )}

                        {d.hash === d.rootHash && !d.revoked && (
                          <div className="docSection">
                            <div className="docHint">
                              Add a new version under this root
                            </div>
                            <div className="docRow">
                              <input
                                type="file"
                                className="docFileInput"
                                onChange={(e) =>
                                  setNewVersionFileByRoot((prev) => ({
                                    ...prev,
                                    [d.rootHash]: e.target.files?.[0] ?? null,
                                  }))
                                }
                              />

                              <button
                                className="btnGhost"
                                type="button"
                                disabled={!walletConnected || !!newVersionLoadingByRoot[d.rootHash]}
                                onClick={() => addNewVersion(d.rootHash)}
                              >
                                {newVersionLoadingByRoot[d.rootHash] ? 'Adding…' : 'Add version'}
                              </button>
                            </div>

                            {newVersionStatusByRoot[d.rootHash] && (
                              <div
                                className={`alert ${newVersionStatusByRoot[d.rootHash]?.toLowerCase().includes('added') ? 'ok' : 'bad'}`}
                              >
                                {newVersionStatusByRoot[d.rootHash]}
                              </div>
                            )}

                            <div className="docRow">
                              <button
                                className="btnGhost"
                                type="button"
                                disabled={!!versionsLoadingByRoot[d.rootHash]}
                                onClick={() => loadVersionsForRoot(d.rootHash)}
                              >
                                {versionsLoadingByRoot[d.rootHash] ? 'Loading…' : 'Show versions'}
                              </button>
                              {versionsErrorByRoot[d.rootHash] && (
                                <span className="muted">{versionsErrorByRoot[d.rootHash]}</span>
                              )}
                            </div>

                            {versionsByRootHash[d.rootHash] && (
                              <div className="muted mono" style={{ whiteSpace: 'pre-wrap' }}>
                                {versionsByRootHash[d.rootHash]!.map((h, i) => `${i + 1}. ${h}`).join('\n')}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        <section id="sharedDocs" className="section">
          <div className="sectionHead">
            <h2>View Shared Documents</h2>
            <p className="muted">Documents shared with you</p>
          </div>

          <div className="panel">
            <div className="formRow" style={{ justifyContent: 'space-between' }}>
              <button
                className="btnPrimary"
                type="button"
                onClick={loadSharedDocumentsFromBlockchain}
                disabled={!walletConnected || sharedDocsLoading}
              >
                {sharedDocsLoading ? 'Loading…' : 'Load Shared Doc'}
              </button>
            </div>

            {sharedDocsError && <div className="alert bad">{sharedDocsError}</div>}

            {sharedDocs.length > 0 && (
              <div className="resultBox">
                <div className="kvGrid">
                  {sharedDocs.map((d) => (
                    <div className="kvItem" key={d.hash}>
                      <div className="k">CID</div>
                      <div className="v">
                        {d.revoked ? (
                          <div>
                            <div className="status bad" style={{ display: 'inline-block' }}>
                              Revoked
                            </div>
                            <div className="muted" style={{ marginTop: 6 }}>
                              CID hidden (revoked documents cannot be viewed)
                            </div>
                          </div>
                        ) : d.url && d.cid ? (
                          <a className="link" href={withHttps(d.url)} target="_blank" rel="noreferrer">
                            {shortHash(d.cid, 18)}
                          </a>
                        ) : (
                          <div className="muted">{d.status ?? (d.access ? 'Not available' : 'No access')}</div>
                        )}

                        <div className="muted mono" style={{ marginTop: 6 }}>
                          {shortHash(d.hash, 14)}
                        </div>

                        {d.owner && (
                          <div className="muted mono" style={{ marginTop: 6 }}>
                            Owner: {shortAddr(d.owner)}
                          </div>
                        )}

                        {d.rootHash && d.version != null && (
                          <div className="muted mono" style={{ marginTop: 6 }}>
                            Root: {shortHash(d.rootHash, 14)} · v{d.version}
                          </div>
                        )}

                        <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                          <button className="btnGhost" type="button" onClick={() => removeSharedHash(d.hash)}>
                            Remove
                          </button>

                          {!d.revoked && (
                            <>
                              <button
                                className="btnGhost"
                                type="button"
                                disabled={!!sharedDownloadLoadingByHash[d.hash]}
                                onClick={() => downloadOrDecryptSharedHash(d.hash)}
                              >
                                {sharedDownloadLoadingByHash[d.hash] ? 'Working…' : 'Download'}
                              </button>
                            </>
                          )}
                        </div>

                        {sharedDownloadStatusByHash[d.hash] && (
                          <div
                            className={`alert ${sharedDownloadStatusByHash[d.hash]!.toLowerCase().includes('decrypted') || sharedDownloadStatusByHash[d.hash]!.toLowerCase().includes('opened') ? 'ok' : 'bad'}`}
                            style={{ marginTop: 10 }}
                          >
                            {sharedDownloadStatusByHash[d.hash]}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container footerInner">
          <div className="footerBrand">
            <div className="brandSmall">
              <span className="brandMark" aria-hidden="true" />
              <span className="brandText">DocuChain</span>
            </div>
            <p className="muted">Blockchain + IPFS document verification demo.</p>
          </div>
          <div className="footerLinks">
            <a href="#upload">Upload</a>
            <a href="#verify">Verify</a>
            <a href="#mydocs">My Docs</a>
            <a href="#sharedDocs">Shared Docs</a>
            <a href={apiUrl('/api/health')} target="_blank" rel="noreferrer">
              API Health
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
