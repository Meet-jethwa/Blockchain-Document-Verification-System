import './App.css'
import profilePhoto from './photo.jpeg'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { ethers } from 'ethers'
import { fetchDocuments, fetchProfile, fetchSharedDocuments, postFileWithProgress, recordSharedDocument, saveProfile, verifyHash, type DocumentSummary, type RegisterResponse, type UserProfile } from './api'

type PageId = 'home' | 'dashboard' | 'upload' | 'shared' | 'profile'
type ThemeMode = 'dark' | 'light'
type ToastTone = 'info' | 'success' | 'warning' | 'error'

type Toast = {
  id: number
  title: string
  detail?: string
  tone: ToastTone
}

type LedgerDocument = {
  hash: string
  name: string
  owner: string | null
  createdAt: number | null
  verified: boolean
  status: 'Registered' | 'Revoked'
  cid: string | null
}

type VerifyPreview = {
  hash: string
  verified: boolean
  revoked: boolean
  existsOnChain: boolean
  status: string
  note: string
}

type ProfileState = UserProfile

const THEME_STORAGE_KEY = 'bdvs-theme'

const DOCUMENT_REGISTRY_ABI = [
  'function registerDocument(bytes32 hash, string cid) external',
  'function revokeDocument(bytes32 hash) external',
  'function grantViewer(bytes32 hash, address viewer) external',
  'function revokeViewer(bytes32 hash, address viewer) external',
  'function getMyDocuments() external view returns (bytes32[] memory)',
  'function getDocumentMeta(bytes32 hash) external view returns (address owner, uint256 createdAt)',
  'function verifyDocument(bytes32 hash) external view returns (bool)',
]

type ShareDialogState = {
  open: boolean
  doc: LedgerDocument | null
  viewer: string
  busy: boolean
}


function createFallbackProfile(address: string | null, preferredTheme: ThemeMode = 'light'): ProfileState {
  return {
    address: address ?? '',
    name: 'My Profile',
    title: 'Document owner',
    email: '',
    bio: '',
    photoDataUrl: null,
    preferredTheme,
    updatedAt: null,
  }
}

function readTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light'
  const value = window.localStorage.getItem(THEME_STORAGE_KEY)
  return value === 'dark' ? 'dark' : 'light'
}

function shortAddr(addr: string | null | undefined) {
  if (!addr) return '—'
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function shortHash(hash: string | null | undefined) {
  if (!hash) return '—'
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`
}

function formatUnixSeconds(seconds: number | null) {
  if (!seconds || Number.isNaN(seconds)) return 'Unknown'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(seconds * 1000))
}

function networkLabel(chainId: number | null) {
  if (chainId == null) return 'Disconnected'
  const labels: Record<number, string> = {
    1: 'Ethereum',
    11155111: 'Sepolia',
    31337: 'Hardhat',
    8453: 'Base',
    42161: 'Arbitrum',
  }
  return labels[chainId] ?? `Chain ${chainId}`
}

function toastToneLabel(tone: ToastTone) {
  switch (tone) {
    case 'success':
      return 'Success'
    case 'warning':
      return 'Warning'
    case 'error':
      return 'Error'
    default:
      return 'Info'
  }
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }
  const input = document.createElement('textarea')
  input.value = value
  input.style.position = 'fixed'
  input.style.opacity = '0'
  document.body.appendChild(input)
  input.select()
  document.execCommand('copy')
  input.remove()
}

function downloadBytes(bytes: Uint8Array, filename: string, mimetype: string) {
  const blob = new Blob([bytes as unknown as BlobPart], {
    type: mimetype || 'application/octet-stream',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

async function extractHash(file: File) {
  const buffer = await file.arrayBuffer()
  return ethers.keccak256(new Uint8Array(buffer))
}

async function fetchBackendHealth() {
  const response = await fetch('/api/health')
  if (!response.ok) {
    throw new Error(`Health check failed (${response.status})`)
  }
  return response.json() as Promise<{ contractAddress?: string; chainId?: number; ipfsGatewayBaseUrl?: string }>
}

async function fetchDocumentDownload(hash: string, walletAddress: string) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 90000)
  let response: Response
  try {
    response = await fetch(`/api/documents/${hash}/download`, {
      method: 'GET',
      headers: {
        'wallet-address': walletAddress,
      },
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Download timed out. Please retry and check backend/RPC connectivity.')
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(message || `Download failed (${response.status})`)
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  const contentDisposition = response.headers.get('content-disposition') || ''
  const match = /filename="?([^";]+)"?/i.exec(contentDisposition)
  const filename = match?.[1] || 'document'
  const mimetype = response.headers.get('content-type') || 'application/octet-stream'
  return { bytes, filename, mimetype }
}

function App() {
  const [theme, setTheme] = useState<ThemeMode>(readTheme)
  const [activePage, setActivePage] = useState<PageId>('home')
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [chainId, setChainId] = useState<number | null>(null)
  const [balance, setBalance] = useState<string | null>(null)
  const [contractAddress, setContractAddress] = useState<string | null>(null)
  const [backendChainId, setBackendChainId] = useState<number | null>(null)
  const [walletBusy, setWalletBusy] = useState(false)
  const [dashboardDocs, setDashboardDocs] = useState<LedgerDocument[]>([])
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [dashboardFilter, setDashboardFilter] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadHash, setUploadHash] = useState('')
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadStage, setUploadStage] = useState(0)
  const [uploadMessage, setUploadMessage] = useState('')
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [sharedDocs, setSharedDocs] = useState<DocumentSummary[]>([])
  const [sharedFilter, setSharedFilter] = useState('')
  const [sharedLoading, setSharedLoading] = useState(false)
  const [verifyPreview, setVerifyPreview] = useState<VerifyPreview | null>(null)
  const [verifyBusy, setVerifyBusy] = useState(false)
  const [profile, setProfile] = useState<ProfileState | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [shareDialog, setShareDialog] = useState<ShareDialogState>({
    open: false,
    doc: null,
    viewer: '',
    busy: false,
  })
  const [toasts, setToasts] = useState<Toast[]>([])
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const verifyInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {}
  }, [theme])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const health = await fetchBackendHealth()
        if (cancelled) return
        if (health.contractAddress) setContractAddress(health.contractAddress)
        if (typeof health.chainId === 'number') setBackendChainId(health.chainId)
      } catch {
        if (!cancelled) {
          setContractAddress(null)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    void syncWalletContext()
    const ethereum = window.ethereum
    if (!ethereum) return undefined

    const handleAccounts = (accounts: string[]) => {
      if (!accounts?.[0]) {
        setWalletAddress(null)
        setChainId(null)
        setBalance(null)
        setActivePage('home')
        setDashboardDocs([])
        setSharedDocs([])
        setProfile(null)
        return
      }
      void syncWalletContext(accounts[0])
      setActivePage('dashboard')
    }

    const handleChain = (hexChainId: string) => {
      setChainId(Number(BigInt(hexChainId)))
      void syncWalletContext()
    }

    ethereum.on?.('accountsChanged', handleAccounts)
    ethereum.on?.('chainChanged', handleChain)

    return () => {
      ethereum.removeListener?.('accountsChanged', handleAccounts)
      ethereum.removeListener?.('chainChanged', handleChain)
    }
  }, [])

  useEffect(() => {
    if (!walletAddress || (activePage !== 'dashboard' && activePage !== 'shared')) {
      return
    }
    void refreshDashboardDocs()
  }, [walletAddress, contractAddress, activePage])

  useEffect(() => {
    if (!walletAddress) {
      setProfile(null)
      setProfileLoading(false)
      return
    }

    let cancelled = false
    setProfileLoading(true)
    void (async () => {
      try {
        const response = await fetchProfile(walletAddress)
        if (cancelled) return
        setProfile(response.profile)
        setTheme(response.profile.preferredTheme)
      } catch {
        if (cancelled) return
        setProfile(createFallbackProfile(walletAddress, theme))
      } finally {
        if (!cancelled) setProfileLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [walletAddress])

  useEffect(() => {
    if (!uploadFile) {
      setUploadHash('')
      setUploadMessage('')
      return
    }
    let cancelled = false
    setUploadMessage('Calculating SHA-256 hash locally.')
    void extractHash(uploadFile)
      .then((hash) => {
        if (cancelled) return
        setUploadHash(hash)
        setUploadMessage('Hash ready. Register on blockchain when you are ready.')
      })
      .catch((error) => {
        if (cancelled) return
        setUploadHash('')
        setUploadMessage(error instanceof Error ? error.message : String(error))
      })
    return () => {
      cancelled = true
    }
  }, [uploadFile])

  function pushToast(title: string, detail: string, tone: ToastTone = 'info') {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    setToasts((current) => [...current, { id, title, detail, tone }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 4000)
  }

  async function syncWalletContext(address?: string | null) {
    const ethereum = window.ethereum
    if (!ethereum) return
    try {
      const chainHex = (await ethereum.request({ method: 'eth_chainId' })) as string
      setChainId(Number(BigInt(chainHex)))
      const accounts = address ? [address] : ((await ethereum.request({ method: 'eth_accounts' })) as string[])
      const nextAddress = address ?? accounts?.[0] ?? null
      setWalletAddress(nextAddress)
      if (nextAddress) {
        const provider = new ethers.BrowserProvider(ethereum)
        const weiBalance = await provider.getBalance(nextAddress)
        setBalance(ethers.formatEther(weiBalance))
      } else {
        setBalance(null)
      }
    } catch {
      if (!address) {
        setBalance(null)
      }
    }
  }

  async function ensureContractAddress() {
    if (contractAddress) return contractAddress
    const health = await fetchBackendHealth()
    if (!health.contractAddress) {
      throw new Error('Backend contract address is not available')
    }
    setContractAddress(health.contractAddress)
    return health.contractAddress
  }

  async function connectWallet() {
    const ethereum = window.ethereum
    if (!ethereum) {
      pushToast('Wallet unavailable', 'Install MetaMask or another EVM wallet.', 'error')
      return
    }
    setWalletBusy(true)
    try {
      const accounts = (await ethereum.request({ method: 'eth_requestAccounts' })) as string[]
      await syncWalletContext()
      setActivePage('dashboard')
      pushToast('Wallet connected', shortAddr(accounts?.[0] ?? null), 'success')
    } catch (error) {
      pushToast('Wallet connection failed', error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setWalletBusy(false)
    }
  }

  async function disconnectWallet() {
    const ethereum = window.ethereum
    if (ethereum?.request) {
      try {
        await ethereum.request({
          method: 'wallet_revokePermissions',
          params: [{ eth_accounts: {} }],
        })
      } catch {
        // Some wallets do not support permission revocation; local logout still works.
      }
    }

    setWalletAddress(null)
    setChainId(null)
    setBalance(null)
    setDashboardDocs([])
    setSharedDocs([])
    setProfile(null)
    setActivePage('home')
    pushToast('Wallet context cleared', 'The app is back in guest mode.', 'info')
  }

  function handleReconnect() {
    if (walletAddress) {
      return
    }
    void connectWallet()
  }

  async function saveProfileDraft() {
    if (!walletAddress || !profile) {
      pushToast('Profile unavailable', 'Connect a wallet before saving profile changes.', 'warning')
      return
    }

    setProfileSaving(true)
    try {
      const response = await saveProfile(walletAddress, {
        name: profile.name,
        title: profile.title,
        email: profile.email,
        bio: profile.bio,
        photoDataUrl: profile.photoDataUrl,
        preferredTheme: profile.preferredTheme,
      })
      setProfile(response.profile)
      setTheme(response.profile.preferredTheme)
      pushToast('Profile saved', 'Your profile was stored in MongoDB.', 'success')
    } catch (error) {
      pushToast('Profile save failed', error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setProfileSaving(false)
    }
  }

  async function verifyFile(file: File) {
    setVerifyBusy(true)
    try {
      const hash = await extractHash(file)
      const response = await verifyHash(hash, walletAddress ?? undefined)
      setVerifyPreview({
        hash: response.hash,
        verified: !!response.verified,
        revoked: !!response.revoked,
        existsOnChain: !!response.existsOnChain,
        status: response.status || (response.verified ? 'Authentic / Untampered' : 'Modified / Fake'),
        note: response.verifiedMessage || (response.verified ? 'Hash matches a record on-chain' : 'No matching hash found on-chain'),
      })
      pushToast(response.verified ? 'Document verified' : 'Document not found', shortHash(hash), response.verified ? 'success' : 'warning')
    } catch (error) {
      pushToast('Verify failed', error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setVerifyBusy(false)
    }
  }

  async function handleGlobalVerifyDrop(file: File) {
    await verifyFile(file)
  }

  async function refreshDashboardDocs() {
    if (!walletAddress) return
    setDashboardLoading(true)
    try {
      const collections = await fetchDocuments(walletAddress)
      setDashboardDocs(collections.owned)
      setSharedDocs(collections.shared)
    } catch (error) {
      pushToast('Ledger load failed', error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setDashboardLoading(false)
    }
  }

  async function loadSharedDocs() {
    if (!walletAddress) return
    setSharedLoading(true)
    try {
      const result = await fetchSharedDocuments(walletAddress)
      setSharedDocs(result.shared)
    } catch (error) {
      pushToast('Shared docs load failed', error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setSharedLoading(false)
    }
  }

  async function registerSelectedDocument() {
    if (!uploadFile) {
      pushToast('No file selected', 'Choose a file before registering it.', 'warning')
      return
    }
    const ethereum = window.ethereum
    if (!ethereum) {
      pushToast('Wallet unavailable', 'MetaMask is required to register on-chain.', 'error')
      return
    }
    setUploadBusy(true)
    setUploadStage(1)
    setUploadMessage('Encrypting and uploading through the backend.')
    try {
      if (!walletAddress) {
        await ethereum.request({ method: 'eth_requestAccounts' })
        await syncWalletContext()
      }
      const activeWallet = walletAddress ?? (((await ethereum.request({ method: 'eth_accounts' })) as string[])[0] ?? null)
      if (!activeWallet) {
        throw new Error('No connected wallet available')
      }

      setUploadProgress(0)
      const uploadResponse = await postFileWithProgress<RegisterResponse>(
        '/api/upload',
        uploadFile,
        { headers: { 'wallet-address': activeWallet } },
        (percent) => setUploadProgress(percent),
      )
      setUploadProgress(null)

      const hash = uploadResponse.hash
      setUploadHash(hash)
      setUploadStage(2)
      setUploadMessage('Transaction ready. Confirm MetaMask to anchor the hash.')

      if (uploadResponse.alreadyRegistered) {
        setUploadStage(3)
        setUploadMessage('The document is already registered on-chain.')
        pushToast('Already registered', shortHash(hash), 'warning')
        setActivePage('dashboard')
        await refreshDashboardDocs()
        return
      }

      const address = await ensureContractAddress()
      const provider = new ethers.BrowserProvider(ethereum)
      const signer = await provider.getSigner()
      const contract = new ethers.Contract(address, DOCUMENT_REGISTRY_ABI, signer)
      const cid = uploadResponse.ipfs?.cid ?? ''
      const tx = await contract.registerDocument(hash, cid)
      setUploadStage(3)
      setUploadMessage(`Transaction submitted: ${tx.hash}`)
      pushToast('Transaction pending', 'Confirm the MetaMask transaction to finish registration.', 'info')
      await tx.wait()
      setUploadMessage(`Document anchored on-chain. Transaction hash: ${tx.hash}`)
      // Query backend for canonical verification response so UI shows the same
      // verification output as backend (includes database info and timestamps).
      try {
        const verified = await verifyHash(hash, walletAddress ?? undefined)
        pushToast('Registration confirmed', shortHash(hash), 'success')
        if (verified.onChain && verified.onChain.createdAt) {
          setUploadMessage(`Anchored at ${new Date(verified.onChain.createdAt * 1000).toLocaleString()}. Transaction hash: ${tx.hash}`)
        }
      } catch (e) {
        // Non-fatal: still refresh documents if backend verify fails temporarily
        // eslint-disable-next-line no-console
        console.warn('Post-register verify failed', e)
      }
      setActivePage('dashboard')
      await refreshDashboardDocs()
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : String(error))
      pushToast('Registration failed', error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setUploadProgress(null)
      setUploadBusy(false)
    }
  }

  async function downloadDocument(hash: string, fallbackName: string) {
    if (!walletAddress) {
      pushToast('Download blocked', 'Connect your wallet first.', 'warning')
      return
    }
    try {
      const payload = await fetchDocumentDownload(hash, walletAddress)
      downloadBytes(payload.bytes, payload.filename || fallbackName, payload.mimetype)
      pushToast('Download started', shortHash(hash), 'success')
    } catch (error) {
      pushToast('Download failed', error instanceof Error ? error.message : String(error), 'error')
    }
  }

  function openShareDialog(doc: LedgerDocument) {
    setShareDialog({
      open: true,
      doc,
      viewer: '',
      busy: false,
    })
  }

  function closeShareDialog() {
    if (shareDialog.busy) return
    setShareDialog({ open: false, doc: null, viewer: '', busy: false })
  }

  async function submitShareDialog() {
    if (!shareDialog.doc) return
    if (!walletAddress) {
      pushToast('Wallet required', 'Connect your wallet before sharing a document.', 'warning')
      return
    }
    if (!ethers.isAddress(shareDialog.viewer)) {
      pushToast('Invalid recipient', 'Enter a valid 0x wallet address.', 'error')
      return
    }

    try {
      setShareDialog((current) => ({ ...current, busy: true }))
      const address = await ensureContractAddress()
      const ethereum = window.ethereum
      if (!ethereum) throw new Error('Wallet provider unavailable')
      const provider = new ethers.BrowserProvider(ethereum)
      const signer = await provider.getSigner()
      const contract = new ethers.Contract(address, DOCUMENT_REGISTRY_ABI, signer)
      const tx = await contract.grantViewer(shareDialog.doc.hash, shareDialog.viewer)
      pushToast('Share pending', `${shortAddr(shareDialog.viewer)} will receive access after confirmation.`, 'info')
      await tx.wait()
      try {
        await recordSharedDocument(shareDialog.viewer, {
          hash: shareDialog.doc.hash,
          name: shareDialog.doc.name,
          owner: shareDialog.doc.owner,
          createdAt: shareDialog.doc.createdAt,
          cid: shareDialog.doc.cid,
        })
      } catch (recordError) {
        // Non-fatal: on-chain sharing succeeded, local share index can be refreshed later.
        // eslint-disable-next-line no-console
        console.warn('Failed to record shared document locally', recordError)
      }
      pushToast('Access granted', `${shareDialog.doc.name} shared with ${shortAddr(shareDialog.viewer)}.`, 'success')
      setShareDialog({ open: false, doc: null, viewer: '', busy: false })
    } catch (error) {
      pushToast('Share failed', error instanceof Error ? error.message : String(error), 'error')
      setShareDialog((current) => ({ ...current, busy: false }))
    }
  }

  async function submitRevokeShareDialog() {
    if (!shareDialog.doc) return
    if (!walletAddress) {
      pushToast('Wallet required', 'Connect your wallet to revoke shared access.', 'warning')
      return
    }
    if (!ethers.isAddress(shareDialog.viewer)) {
      pushToast('Invalid viewer', 'Enter a valid wallet address to revoke access.', 'warning')
      return
    }

    setShareDialog((current) => ({ ...current, busy: true }))
    try {
      const address = await ensureContractAddress()
      const ethereum = window.ethereum
      if (!ethereum) throw new Error('Wallet provider unavailable')
      const provider = new ethers.BrowserProvider(ethereum)
      const signer = await provider.getSigner()
      const contract = new ethers.Contract(address, DOCUMENT_REGISTRY_ABI, signer)
      const tx = await contract.revokeViewer(shareDialog.doc.hash, shareDialog.viewer)
      pushToast('Revoke pending', `${shortAddr(shareDialog.viewer)} will lose access after confirmation.`, 'info')
      await tx.wait()
      try {
        await fetch('/api/shared-record', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'wallet-address': String(walletAddress),
          },
          body: JSON.stringify({ hash: shareDialog.doc.hash, viewerAddress: shareDialog.viewer }),
        })
      } catch (deleteError) {
        // Non-fatal: on-chain revoke succeeded; local cleanup can be retried later.
        // eslint-disable-next-line no-console
        console.warn('Backend shared-record delete failed after on-chain revoke', deleteError)
      }
      pushToast('Access revoked', `${shortAddr(shareDialog.viewer)} can no longer access this document.`, 'success')
      setShareDialog({ open: false, doc: null, viewer: '', busy: false })
      await refreshDashboardDocs()
    } catch (error) {
      pushToast('Revoke failed', error instanceof Error ? error.message : String(error), 'error')
      setShareDialog((current) => ({ ...current, busy: false }))
    }
  }

  async function revokeDocument(hash: string) {
    if (!walletAddress) {
      pushToast('Wallet required', 'Connect your wallet to delete a document.', 'warning')
      return
    }
    try {
      const address = await ensureContractAddress()
      const ethereum = window.ethereum
      if (!ethereum) throw new Error('Wallet provider unavailable')
      const provider = new ethers.BrowserProvider(ethereum)
      const signer = await provider.getSigner()
      const contract = new ethers.Contract(address, DOCUMENT_REGISTRY_ABI, signer)
      const tx = await contract.revokeDocument(hash)
      pushToast('Delete pending', shortHash(hash), 'info')
      await tx.wait()
      try {
        await fetch(`/api/documents/${hash}`, {
          method: 'DELETE',
          headers: {
            'wallet-address': String(walletAddress),
          },
        })
      } catch (deleteError) {
        // Non-fatal: chain delete succeeded; local cleanup may still happen later.
        // eslint-disable-next-line no-console
        console.warn('Backend delete failed after on-chain revoke', deleteError)
      }
      pushToast('Document deleted', shortHash(hash), 'success')
      setDashboardDocs((current) => current.filter((doc) => doc.hash !== hash))
      setSharedDocs((current) => current.filter((doc) => doc.hash !== hash))
      await refreshDashboardDocs()
    } catch (error) {
      pushToast('Delete failed', error instanceof Error ? error.message : String(error), 'error')
    }
  }

  const metrics = {
    totalDocuments: dashboardDocs.length,
    sharedWithMe: sharedDocs.length,
    verifiedThisMonth: dashboardDocs.filter((doc) => {
      if (!doc.verified || !doc.createdAt) return false
      return Date.now() - doc.createdAt * 1000 <= 1000 * 60 * 60 * 24 * 30
    }).length,
  }

  const filteredDashboardDocs = dashboardDocs.filter((doc) => {
    const query = dashboardFilter.trim().toLowerCase()
    if (!query) return true
    return [doc.name, doc.hash, doc.owner ?? '', doc.status].some((value) => value.toLowerCase().includes(query))
  })

  return (
    <div className={`site theme-${theme}`}>
      <Header
        activePage={activePage}
        balance={balance}
        backendChainId={backendChainId}
        chainId={chainId}
        contractAddress={contractAddress}
        onDisconnect={disconnectWallet}
        onNavChange={setActivePage}
          onReconnect={handleReconnect}
        onVerifyDrop={handleGlobalVerifyDrop}
        onVerifyInputClick={() => verifyInputRef.current?.click()}
        onVerifyInputSelected={handleGlobalVerifyDrop}
        verifyBusy={verifyBusy}
        verifyPreview={verifyPreview}
        walletAddress={walletAddress}
        walletBusy={walletBusy}
        verifyInputRef={verifyInputRef}
      />

      <main className="pageShell container">
        {activePage === 'home' && (
          <LandingPage onConnect={connectWallet} onGoUpload={() => setActivePage('upload')} />
        )}

        {activePage === 'dashboard' && (
          <DashboardPage
            balance={balance}
            docs={filteredDashboardDocs}
            filter={dashboardFilter}
            loading={dashboardLoading}
            metrics={metrics}
            onDownload={downloadDocument}
            onFilterChange={setDashboardFilter}
            onRefresh={refreshDashboardDocs}
            onRevoke={revokeDocument}
            onShare={openShareDialog}
            walletAddress={walletAddress}
          />
        )}

        {activePage === 'upload' && (
          <UploadPage
            file={uploadFile}
            hash={uploadHash}
            inputRef={uploadInputRef}
            message={uploadMessage}
            onPickFile={() => uploadInputRef.current?.click()}
            onRegister={registerSelectedDocument}
            onSelectFile={setUploadFile}
            stage={uploadStage}
            busy={uploadBusy}
            progress={uploadProgress}
          />
        )}

        {activePage === 'shared' && (
          <SharedPage
            docs={sharedDocs}
            filter={sharedFilter}
            loading={sharedLoading}
            onDownload={downloadDocument}
            onFilterChange={setSharedFilter}
            onRefresh={() => void loadSharedDocs()}
            walletAddress={walletAddress}
          />
        )}

        {activePage === 'profile' && (
          <ProfilePage
            profile={profile}
            loading={profileLoading}
            saving={profileSaving}
            walletAddress={walletAddress}
            backendChainId={backendChainId}
            chainId={chainId}
            theme={theme}
            onDisconnect={disconnectWallet}
            onProfileChange={setProfile}
            onSave={() => void saveProfileDraft()}
            onThemeChange={setTheme}
          />
        )}
      </main>

      {shareDialog.open && shareDialog.doc ? (
        <div className="overlayBackdrop" role="presentation" onClick={closeShareDialog}>
          <div className="shareModal" role="dialog" aria-modal="true" aria-labelledby="share-modal-title" onClick={(event) => event.stopPropagation()}>
            <div className="shareModalHeader">
              <div>
                <div className="eyebrow">Share document</div>
                <h3 id="share-modal-title">Grant viewer access</h3>
              </div>
              <button type="button" className="ghostButton" onClick={closeShareDialog} disabled={shareDialog.busy}>
                Close
              </button>
            </div>

            <div className="shareModalBody">
              <div className="shareDocSummary">
                <strong>{shareDialog.doc.name}</strong>
                <span className="mutedCopy">{shortHash(shareDialog.doc.hash)}</span>
              </div>

              <label className="shareField">
                <span>Recipient wallet address</span>
                <input
                  className="textInput"
                  value={shareDialog.viewer}
                  onChange={(event) => setShareDialog((current) => ({ ...current, viewer: event.target.value }))}
                  placeholder="0x..."
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>

              <p className="mutedCopy">
                This will call <span className="monoInline">grantViewer</span> on-chain so the other wallet can access this document.
              </p>
            </div>

            <div className="shareModalActions">
              <button type="button" className="secondaryButton" onClick={closeShareDialog} disabled={shareDialog.busy}>
                Cancel
              </button>
              <button type="button" className="ghostButton dangerButton" onClick={() => void submitRevokeShareDialog()} disabled={shareDialog.busy || !shareDialog.viewer.trim()}>
                {shareDialog.busy ? 'Revoking...' : 'Revoke access'}
              </button>
              <button type="button" className="primaryButton" onClick={() => void submitShareDialog()} disabled={shareDialog.busy || !shareDialog.viewer.trim()}>
                {shareDialog.busy ? 'Sharing...' : 'Share access'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ToastStack toasts={toasts} />
    </div>
  )
}

function Header(props: {
  activePage: PageId
  balance: string | null
  backendChainId: number | null
  chainId: number | null
  contractAddress: string | null
  onDisconnect: () => void
  onReconnect: () => void
  onNavChange: (page: PageId) => void
  onVerifyDrop: (file: File) => Promise<void>
  onVerifyInputClick: () => void
  onVerifyInputSelected: (file: File) => Promise<void>
  verifyBusy: boolean
  verifyPreview: VerifyPreview | null
  walletAddress: string | null
  walletBusy: boolean
  verifyInputRef: React.RefObject<HTMLInputElement | null>
}) {
  const {
    activePage,
    balance,
    backendChainId,
    chainId,
    contractAddress,
    onDisconnect,
    onReconnect,
    onNavChange,
    verifyPreview,
    walletAddress,
  } = props

  const navItems: Array<{ id: PageId; label: string }> = [
    { id: 'home', label: 'Home' },
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'upload', label: 'Upload' },
    { id: 'shared', label: 'Shared With Me' },
    { id: 'profile', label: 'Profile' },
  ]

  return (
    <header className="topBar">
      {walletAddress ? (
        <div className="container topBarMini">
          <div className="walletChip mini profileChip">
            <img className="walletAvatar" src={profilePhoto} alt="My profile" />
            <div className="walletProfileCopy">
              <div className="walletProfileLabel">My profile</div>
              <div className="walletAddress">{shortAddr(walletAddress)}</div>
              <div className="walletMeta">
                {networkLabel(chainId ?? backendChainId)}{balance ? ` · ${Number(balance).toFixed(3)} ETH` : ''}
              </div>
            </div>
            <button type="button" className="ghostButton" onClick={onDisconnect}>
              Logout
            </button>
          </div>
        </div>
      ) : null}
      <div className="container topBarInner">
        <div className="brandBlock">
          <button className="brand" type="button" onClick={() => onNavChange('home')}>
            <span className="brandMark" />
            <span className="brandText">BDVS</span>
          </button>
          <span className="networkBadge">{networkLabel(chainId ?? backendChainId)}</span>
        </div>

        <nav className="navTabs" aria-label="Primary">
          {navItems.map((item) => (
            <button key={item.id} type="button" className={activePage === item.id ? 'navTab active' : 'navTab'} onClick={() => onNavChange(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="navActions">
          {!walletAddress ? (
            <button type="button" className="primaryButton" onClick={onReconnect}>
              Connect Wallet
            </button>
          ) : null}
        </div>
      </div>

      <div className="container verifyResultRow">
        {verifyPreview ? (
          <div className={verifyPreview.verified ? 'verifyResult verified' : 'verifyResult'}>
            <span className={verifyPreview.verified ? 'statusPill success' : 'statusPill warning'}>
              {verifyPreview.status}
            </span>
            <span className="verifyNote">{verifyPreview.note}</span>
          </div>
        ) : (
          <div className="verifyResult verifyEmpty">
            {contractAddress ? <span className="verifyNote subtle">Contract {shortAddr(contractAddress)}</span> : null}
          </div>
        )}
      </div>
    </header>
  )
}

function LandingPage(props: {
  onConnect: () => void
  onGoUpload: () => void
}) {
  const { onConnect, onGoUpload } = props

  return (
    <section className="landingPageShell">
      <div className="landingGrid">
        <div className="heroCopy">
          <div className="eyebrow">Secure vault for verified records</div>
          <h1>Secure Documents. Immutable Verification.</h1>
          <p className="lead">
            BDVS combines blockchain verification, encrypted IPFS storage, and wallet-based access control into one secure document ecosystem. Files stay encrypted off-chain while their authenticity is permanently proven on-chain.
            <br></br>
            Designed for secure digital workflows, the platform offers transparent verification, tamper detection, and a simplified document experience without the complexity of traditional dashboards.
          </p>

          <div className="heroActions">
            <button type="button" className="primaryButton heroButton" onClick={onConnect}>
              Connect Wallet
            </button>
            <button type="button" className="secondaryButton heroButton" onClick={onGoUpload}>
              Open Upload Studio
            </button>
          </div>

        </div>

        <div className="heroPanel">
          <div className="vaultDisplay videoDisplay">
            <div className="blockchainStage">
              <BlockchainBackdrop />
              <div className="blockchainGlow" />
              <div className="blockchainOrbit orbitOne">
                <span className="orbitNode" />
              </div>
              <div className="blockchainOrbit orbitTwo">
                <span className="orbitNode" />
              </div>
              <div className="blockchainOrbit orbitThree">
                <span className="orbitNode" />
              </div>

              <div className="blockchainConveyor" aria-hidden="true">
                <div className="blockchainTrack">
                  <div className="chainRun">
                    <div className="chainBlock" />
                    <div className="chainLink" />
                    <div className="chainBlock" />
                    <div className="chainLink" />
                    <div className="chainBlock" />
                    <div className="chainLink" />
                    <div className="chainBlock" />
                    <div className="chainLink" />
                    <div className="chainBlock" />
                    <div className="chainLink" />
                  </div>
                  <div className="chainRun" aria-hidden="true">
                    <div className="chainBlock" />
                    <div className="chainLink" />
                    <div className="chainBlock" />
                    <div className="chainLink" />
                    <div className="chainBlock" />
                    <div className="chainLink" />
                    <div className="chainBlock" />
                    <div className="chainLink" />
                    <div className="chainBlock" />
                    <div className="chainLink" />
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      <div className="featureGrid homeFeatureGrid">
        <article className="featureCard">
          <span className="featureTag">Document Overview</span>
          <p>See the document flow, access status, and trust signals at a glance.</p>
        </article>
        <article className="featureCard">
          <span className="featureTag">Encrypted Storage</span>
          <p>Payloads stay encrypted off-chain while the chain stores proof and access metadata.</p>
        </article>
        <article className="featureCard">
          <span className="featureTag">Wallet-Based Control</span>
          <p>MetaMask manages registration, revocation, and owner-authorized downloads.</p>
        </article>
      </div>

      <div className="flowCard homeFlowCard">
        <div className="sectionKicker">Workflow</div>
        <div className="timeline">
          <div className="timelineStep"><span>Upload</span><small>Choose a file</small></div>
          <div className="timelineArrow" aria-hidden="true">→</div>
          <div className="timelineStep"><span>Encrypt</span><small>Backend locks payload</small></div>
          <div className="timelineArrow" aria-hidden="true">→</div>
          <div className="timelineStep"><span>Chain</span><small>MetaMask signs proof</small></div>
          <div className="timelineArrow" aria-hidden="true">→</div>
          <div className="timelineStep"><span>Verify</span><small>Anyone can read trust</small></div>
        </div>
      </div>

      <footer className="homeFooter">
        <div>
          <div className="brandText">BDVS</div>
          <p>Encrypted document verification for teams that want proof without dashboard clutter.</p>
        </div>
        <div className="footerMeta">
          <span>Home overview</span>
          <span>Theme aware</span>
          <span>On-chain integrity</span>
        </div>
      </footer>
    </section>
  )
}

function DashboardPage(props: {
  balance: string | null
  docs: LedgerDocument[]
  filter: string
  loading: boolean
  metrics: { totalDocuments: number; sharedWithMe: number; verifiedThisMonth: number }
  onDownload: (hash: string, name: string) => Promise<void>
  onFilterChange: (value: string) => void
  onRefresh: () => Promise<void>
  onRevoke: (hash: string) => Promise<void>
  onShare: (doc: LedgerDocument) => void
  walletAddress: string | null
}) {
  const { balance, docs, filter, loading, metrics, onDownload, onFilterChange, onRefresh, onRevoke, onShare, walletAddress } = props

  return (
    <section className="pageStack">
      <div className="sectionHeading">
        <div>
          <div className="eyebrow">Dashboard</div>
          <h2>Vault command center</h2>
        </div>
        <button type="button" className="secondaryButton" onClick={() => void onRefresh()}>
          Refresh ledger
        </button>
      </div>

      {!walletAddress ? <div className="emptyState">Connect MetaMask to load your document vault.</div> : null}

      <div className="metricsGrid">
        <article className="metricCard">
          <span>Total Documents</span>
          <strong>{metrics.totalDocuments}</strong>
          <small>{walletAddress ? shortAddr(walletAddress) : 'No wallet connected'}</small>
        </article>
        <article className="metricCard">
          <span>Shared With Me</span>
          <strong>{metrics.sharedWithMe}</strong>
          <small>{balance ? `${Number(balance).toFixed(3)} ETH available` : 'Wallet balance hidden until connect'}</small>
        </article>
        <article className="metricCard">
          <span>Verified This Month</span>
          <strong>{metrics.verifiedThisMonth}</strong>
          <small>Chain proofs with recent timestamps</small>
        </article>
      </div>

      <div className="panelShell">
        <div className="panelHeader">
          <div>
            <div className="sectionKicker">Documents</div>
            <h3>Filterable registry</h3>
          </div>
          <input className="textInput filterInput" value={filter} onChange={(event) => onFilterChange(event.target.value)} placeholder="Search by name, hash, owner, or status" />
        </div>

        <div className="tableWrap">
          <table className="docTable">
            <thead>
              <tr>
                <th>Filename</th>
                <th>Upload date</th>
                <th>Hash</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="tableEmpty">Loading ledger records...</td>
                </tr>
              ) : docs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="tableEmpty">No documents match the current filter.</td>
                </tr>
              ) : (
                docs.map((doc) => (
                  <tr key={doc.hash} className={doc.status === 'Revoked' ? 'revokedRow' : ''}>
                    <td>
                      <div className="docNameBlock">
                        <strong>{doc.name}</strong>
                        <small>{doc.owner ? shortAddr(doc.owner) : 'Unknown owner'}</small>
                      </div>
                    </td>
                    <td>{formatUnixSeconds(doc.createdAt)}</td>
                    <td>
                      <button type="button" className="hashPill" onClick={() => void copyText(doc.hash)}>
                        {shortHash(doc.hash)}
                      </button>
                    </td>
                    <td>
                      <span className={doc.status === 'Revoked' ? 'statusPill danger' : 'statusPill success'}>{doc.status}</span>
                    </td>
                    <td>
                      <div className="rowActions">
                        <button type="button" className="ghostButton" disabled={doc.status === 'Revoked'} onClick={() => void onDownload(doc.hash, doc.name)}>
                          Download
                        </button>
                        <button type="button" className="ghostButton" onClick={() => onShare(doc)}>
                          Share
                        </button>
                        <button type="button" className="ghostButton dangerButton" disabled={doc.status === 'Revoked'} onClick={() => void onRevoke(doc.hash)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function UploadPage(props: {
  file: File | null
  hash: string
  inputRef: React.RefObject<HTMLInputElement | null>
  message: string
  onPickFile: () => void
  onRegister: () => Promise<void>
  onSelectFile: (file: File | null) => void
  stage: number
  busy: boolean
  progress: number | null
}) {
  const { file, inputRef, onPickFile, onRegister, onSelectFile, busy, progress } = props

  return (
    <section className="pageStack uploadPage">
      <div className="sectionHeading">
        <div>
          <div className="eyebrow">Upload</div>
          <h2>Register a document on-chain</h2>
        </div>
        <button type="button" className="secondaryButton" onClick={onPickFile}>
          Choose file
        </button>
      </div>

      <label
        className="uploadZone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          const nextFile = event.dataTransfer.files?.[0] ?? null
          onSelectFile(nextFile)
        }}
      >
        <input
          ref={inputRef}
          className="hiddenInput"
          type="file"
          onChange={(event) => onSelectFile(event.target.files?.[0] ?? null)}
        />
        <div className="uploadZoneIcon">□</div>
        <h3>Drag and drop your file here</h3>
        {file ? (
          <div className="fileMetaRow">
            <span>{file.name}</span>
            <span>{Math.max(1, Math.round(file.size / 1024))} KB</span>
          </div>
        ) : null}
      </label>

      {busy && progress != null ? (
        <div className="uploadGrid">
          <div className="panelShell">
            <div className="uploadProgressBar" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <div className="uploadProgressFill" style={{ width: `${progress}%` }} />
              <div className="progressLabel">{progress}%</div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="uploadActions">
        <button type="button" className="primaryButton" onClick={() => void onRegister()} disabled={busy || !file}>
          {busy ? 'Working...' : 'Register on Blockchain'}
        </button>
      </div>

      {props.message ? <div className="verifyNote uploadMessage">{props.message}</div> : null}
    </section>
  )
}

function SharedPage(props: {
  docs: DocumentSummary[]
  filter: string
  loading: boolean
  onDownload: (hash: string, name: string) => Promise<void>
  onFilterChange: (value: string) => void
  onRefresh: () => void
  walletAddress: string | null
}) {
  const { docs, filter, loading, onDownload, onFilterChange, onRefresh, walletAddress } = props
  const [expandedHashes, setExpandedHashes] = useState<Record<string, boolean>>({})

  const toggleExpand = (hash: string) => {
    setExpandedHashes((prev) => ({
      ...prev,
      [hash]: !prev[hash],
    }))
  }

  const filteredDocs = docs.filter((doc) => {
    const query = filter.trim().toLowerCase()
    if (!query) return true
    return [doc.name, doc.hash, doc.owner ?? '', doc.status, doc.file?.name ?? ''].some((value) => value.toLowerCase().includes(query))
  })

  function formatFileSize(bytes: number | undefined | null) {
    if (!bytes) return null
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <section className="pageStack">
      <div className="sectionHeading">
        <div>
          <div className="eyebrow">Shared With Me</div>
          <h2>Documents shared to your wallet</h2>
        </div>
        <button type="button" className="secondaryButton" onClick={onRefresh}>
          Refresh inbox
        </button>
      </div>

      {!walletAddress ? <div className="emptyState">Connect MetaMask to view documents shared with you.</div> : null}

      <div className="sharedStatsRow">
        <div className="sharedStat">
          <span className="sharedStatValue">{docs.length}</span>
          <span className="sharedStatLabel">Total shared</span>
        </div>
        <div className="sharedStat">
          <span className="sharedStatValue">{docs.filter(d => d.verified).length}</span>
          <span className="sharedStatLabel">Verified</span>
        </div>
        <div className="sharedStat">
          <span className="sharedStatValue">{docs.filter(d => d.file?.size).length}</span>
          <span className="sharedStatLabel">With file info</span>
        </div>
      </div>

      <div className="sharedSearchBar">
        <input
          className="textInput filterInput"
          value={filter}
          onChange={(event) => onFilterChange(event.target.value)}
          placeholder="Search by name, hash, owner, or filename…"
        />
      </div>

      {loading ? (
        <div className="emptyState">Loading shared documents from MongoDB…</div>
      ) : filteredDocs.length === 0 ? (
        <div className="emptyState">
          {docs.length === 0
            ? 'No documents have been shared with your wallet yet.'
            : 'No shared documents match your search.'}
        </div>
      ) : (
        <div className="sharedGrid">
          {filteredDocs.map((doc) => (
            <article className="sharedCard" key={doc.hash}>
              <div className="sharedCardTop">
                <div>
                  <div className="sharedName">{doc.name}</div>
                  <div className="sharedMeta">Owner {shortAddr(doc.owner)}</div>
                </div>
                <span className={doc.verified ? 'statusPill success' : 'statusPill warning'}>
                  {doc.verified ? 'hash Verified' : 'Pending'}
                </span>
              </div>

              <div className="sharedCardDetails">
                {doc.file?.name ? (
                  <div className="sharedDetailRow">
                    <span className="sharedDetailLabel">File</span>
                    <span className="sharedDetailValue">{doc.file.name}</span>
                  </div>
                ) : null}
                {doc.file?.size ? (
                  <div className="sharedDetailRow">
                    <span className="sharedDetailLabel">Size</span>
                    <span className="sharedDetailValue">{formatFileSize(doc.file.size)}</span>
                  </div>
                ) : null}
                {doc.file?.mimetype ? (
                  <div className="sharedDetailRow">
                    <span className="sharedDetailLabel">Type</span>
                    <span className="sharedDetailValue">{doc.file.mimetype}</span>
                  </div>
                ) : null}
                {doc.sharedAt ? (
                  <div className="sharedDetailRow">
                    <span className="sharedDetailLabel">Shared on</span>
                    <span className="sharedDetailValue">{new Date(doc.sharedAt).toLocaleDateString()}</span>
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                className="primaryButton sharedDownload"
                disabled={doc.status === 'Revoked'}
                onClick={() => void onDownload(doc.hash, doc.name)}
              >
                Download
              </button>

              <div style={{ textAlign: 'center', marginTop: '12px' }}>
                <button
                  type="button"
                  className="ghostButton"
                  style={{ width: '100%', borderRadius: '12px', fontSize: '0.85rem' }}
                  onClick={() => toggleExpand(doc.hash)}
                >
                  {expandedHashes[doc.hash] ? 'View Less ▲' : 'View More ▼'}
                </button>
              </div>

              {expandedHashes[doc.hash] ? (
                <div className="sharedBottomHashes">
                  <div className="sharedBottomHashRow">
                    <span className="sharedBottomHashLabel">shared Document hash:</span>
                    <button type="button" className="hashPill" onClick={() => void copyText(doc.hash)}>
                      {shortHash(doc.hash)}
                    </button>
                  </div>
                  <div className="sharedBottomHashRow">
                    <span className="sharedBottomHashLabel">Registrator hash:</span>
                    <button type="button" className="hashPill" onClick={() => void copyText(doc.owner || '')}>
                      {shortAddr(doc.owner)}
                    </button>
                  </div>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function ProfilePage(props: {
  profile: ProfileState | null
  loading: boolean
  saving: boolean
  walletAddress: string | null
  backendChainId: number | null
  chainId: number | null
  theme: ThemeMode
  onDisconnect: () => void
  onProfileChange: (profile: ProfileState) => void
  onSave: () => void
  onThemeChange: (theme: ThemeMode) => void
}) {
  const { profile, loading, saving, walletAddress, backendChainId, chainId, theme, onDisconnect, onProfileChange, onSave, onThemeChange } = props
  const effectiveProfile = profile ?? createFallbackProfile(walletAddress, theme)

  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('Unable to read image file'))
      reader.readAsDataURL(file)
    })
    onProfileChange({ ...effectiveProfile, photoDataUrl: dataUrl })
  }

  return (
    <section className="pageStack profilePage">
      <div className="sectionHeading">
        <div>
          <div className="eyebrow">Profile</div>
          <h2>Update your profile</h2>
        </div>
        <button type="button" className="secondaryButton" onClick={onDisconnect} disabled={!walletAddress}>
          Logout
        </button>
      </div>

      {!walletAddress ? <div className="emptyState">Connect a wallet to load and save your profile in MongoDB.</div> : null}

      <div className="profileLayout">
        <article className="profileHeroCard">
          <img className="profileHeroPhoto" src={effectiveProfile.photoDataUrl || profilePhoto} alt="Profile" />
          <div className="profileHeroCopy">
            <div className="sectionKicker">Profile preview</div>
            <h3>{effectiveProfile.name}</h3>
            <p>{effectiveProfile.title || 'Document owner'}</p>
            <div className="profileMetaRow">
              <span>{shortAddr(walletAddress)}</span>
              <span>{networkLabel(chainId ?? backendChainId)}</span>
            </div>
          </div>
        </article>

        <div className="profileEditorCard">
          <label className="profileField">
            <span>Profile photo</span>
            <input type="file" accept="image/*" onChange={(event) => void handlePhotoChange(event)} />
          </label>

          <label className="profileField">
            <span>Name</span>
            <input
              className="textInput"
              value={effectiveProfile.name}
              onChange={(event) => onProfileChange({ ...effectiveProfile, name: event.target.value })}
              placeholder="Your name"
            />
          </label>

          <label className="profileField">
            <span>Role / title</span>
            <input
              className="textInput"
              value={effectiveProfile.title}
              onChange={(event) => onProfileChange({ ...effectiveProfile, title: event.target.value })}
              placeholder="Document owner"
            />
          </label>

          <label className="profileField">
            <span>Email</span>
            <input
              className="textInput"
              type="email"
              value={effectiveProfile.email}
              onChange={(event) => onProfileChange({ ...effectiveProfile, email: event.target.value })}
              placeholder="you@example.com"
            />
          </label>

          <label className="profileField">
            <span>Bio</span>
            <textarea
              className="textInput profileBio"
              value={effectiveProfile.bio}
              onChange={(event) => onProfileChange({ ...effectiveProfile, bio: event.target.value })}
              placeholder="Short profile bio"
            />
          </label>

          <div className="appearanceCard profileSettingsCard">
            <div className="appearanceHeader">
              <div>
                <div className="sectionKicker">Settings</div>
                <strong>Appearance</strong>
              </div>
              <span className="themeBadge">{effectiveProfile.preferredTheme === 'dark' ? 'Dark' : 'White'}</span>
            </div>
            <div className="themeSwitch" role="group" aria-label="Theme selection">
              <button
                type="button"
                className={effectiveProfile.preferredTheme === 'dark' ? 'themeOption active' : 'themeOption'}
                onClick={() => {
                  onProfileChange({ ...effectiveProfile, preferredTheme: 'dark' })
                  onThemeChange('dark')
                }}
              >
                Dark
              </button>
              <button
                type="button"
                className={effectiveProfile.preferredTheme === 'light' ? 'themeOption active' : 'themeOption'}
                onClick={() => {
                  onProfileChange({ ...effectiveProfile, preferredTheme: 'light' })
                  onThemeChange('light')
                }}
              >
                White
              </button>
            </div>
            <p className="themeNote">The theme choice is saved with your profile and can update the whole app shell.</p>
          </div>

          <div className="profileActions">
            <button type="button" className="primaryButton" onClick={() => void onSave()} disabled={saving || loading || !walletAddress}>
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
            <button type="button" className="secondaryButton" onClick={onDisconnect} disabled={!walletAddress}>
              Logout
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

function ToastStack(props: { toasts: Toast[] }) {
  const { toasts } = props
  return (
    <div className="toastStack" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.tone}`}>
          <strong>{toastToneLabel(toast.tone)}</strong>
          <span>{toast.title}</span>
          {toast.detail ? <small>{toast.detail}</small> : null}
        </div>
      ))}
    </div>
  )
}

function BlockchainBackdrop() {
  return (
    <svg className="blockchainBackdrop" viewBox="0 0 640 440" aria-hidden="true">
      <defs>
        <linearGradient id="bdvsGlow" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stopColor="#32d6c8" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#6af2ff" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      <g className="backdropLines">
        <path d="M76 92 L170 142 L252 104 L334 168 L420 124 L520 180" />
        <path d="M102 282 L202 224 L296 276 L384 216 L470 258 L570 208" />
        <path d="M170 142 L168 252 L252 104" />
        <path d="M334 168 L348 268 L420 124" />
        <path d="M252 104 L296 276 L384 216" />
        <path d="M470 258 L520 180 L570 208" />
      </g>
      <g className="backdropNodes">
        <circle cx="76" cy="92" r="8" />
        <circle cx="170" cy="142" r="8" />
        <circle cx="252" cy="104" r="8" />
        <circle cx="334" cy="168" r="8" />
        <circle cx="420" cy="124" r="8" />
        <circle cx="520" cy="180" r="8" />
        <circle cx="102" cy="282" r="8" />
        <circle cx="202" cy="224" r="8" />
        <circle cx="296" cy="276" r="8" />
        <circle cx="384" cy="216" r="8" />
        <circle cx="470" cy="258" r="8" />
        <circle cx="570" cy="208" r="8" />
        <circle cx="168" cy="252" r="8" />
        <circle cx="348" cy="268" r="8" />
      </g>
    </svg>
  )
}

export default App
