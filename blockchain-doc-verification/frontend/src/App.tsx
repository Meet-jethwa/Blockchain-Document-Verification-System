import './App.css'
import { useEffect, useMemo, useState } from 'react'
import type { RegisterResponse, VerifyResponse } from './api'
import { postFile } from './api'
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
  'function registerDocument(bytes32 hash, string cid) external',
  'function verifyDocument(bytes32 hash) external view returns (bool)',
  'function verifyMyDocument(bytes32 hash) external view returns (bool)',
  'function getDocument(bytes32 hash) external view returns (address owner, string cid, uint256 createdAt)',
  'function getMyDocuments() external view returns (bytes32[] memory)',
]

async function hashFileKeccak256(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  return ethers.keccak256(new Uint8Array(buf))
}

function App() {
  const [registerFile, setRegisterFile] = useState<File | null>(null)
  const [verifyFile, setVerifyFile] = useState<File | null>(null)

  const [registerLoading, setRegisterLoading] = useState(false)
  const [verifyLoading, setVerifyLoading] = useState(false)

  const [registerError, setRegisterError] = useState<string | null>(null)
  const [verifyError, setVerifyError] = useState<string | null>(null)

  const [registerResult, setRegisterResult] = useState<RegisterResponse | null>(null)
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null)

  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [walletChainId, setWalletChainId] = useState<number | null>(null)
  const [walletError, setWalletError] = useState<string | null>(null)

  const [contractAddress, setContractAddress] = useState<string | null>(null)
  const [backendChainId, setBackendChainId] = useState<number | null>(null)
  const [ipfsGatewayBaseUrl, setIpfsGatewayBaseUrl] = useState<string>('https://ipfs.io/ipfs/')

  const [myDocs, setMyDocs] = useState<Array<{ hash: string; cid: string; createdAt: number; url: string }>>([])
  const [myDocsLoading, setMyDocsLoading] = useState(false)
  const [myDocsError, setMyDocsError] = useState<string | null>(null)

  const canRegister = useMemo(() => !!registerFile && !registerLoading, [registerFile, registerLoading])
  const canVerify = useMemo(() => !!verifyFile && !verifyLoading, [verifyFile, verifyLoading])

  const walletConnected = !!walletAddress
  const chainMismatch =
    walletChainId != null && backendChainId != null ? walletChainId !== backendChainId : false

  useEffect(() => {
    let cancelled = false
    async function loadHealth() {
      try {
        const res = await fetch('/api/health')
        const data = await res.json()
        if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`)
        if (cancelled) return
        setContractAddress(String(data.contractAddress))
        setBackendChainId(typeof data.chainId === 'number' ? data.chainId : Number(data.chainId))
        if (data.ipfsGatewayBaseUrl) setIpfsGatewayBaseUrl(String(data.ipfsGatewayBaseUrl))
      } catch {
        // Non-fatal; UI can still render.
      }
    }
    loadHealth()
    return () => {
      cancelled = true
    }
  }, [])

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
    setWalletError(null)
    const eth = window.ethereum
    if (!eth) {
      setWalletError('No wallet detected. Install MetaMask (or another EVM wallet).')
      return
    }
    try {
      const accounts = (await eth.request({ method: 'eth_requestAccounts' })) as string[]
      const chainIdHex = (await eth.request({ method: 'eth_chainId' })) as string
      setWalletAddress(accounts?.[0] ?? null)
      setWalletChainId(Number(BigInt(chainIdHex)))
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : String(err))
    }
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
          const [_owner, cid, createdAt] = (await contract.getDocument(hash)) as [string, string, bigint]
          const url = `${ipfsGatewayBaseUrl}${cid}`
          return { hash, cid, createdAt: Number(createdAt), url }
        }),
      )
      setMyDocs(docs.slice().reverse())
    } catch (err) {
      setMyDocsError(err instanceof Error ? err.message : String(err))
    } finally {
      setMyDocsLoading(false)
    }
  }

  async function onRegisterSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!registerFile) return

    setRegisterError(null)
    setRegisterResult(null)
    setRegisterLoading(true)
    try {
      // Step 1: Upload to IPFS via backend (returns {hash, cid})
      const upload = await postFile<RegisterResponse>('/api/upload', registerFile)
      setRegisterResult(upload)

      if (upload.alreadyRegistered) {
        return
      }

      // Step 2: Register on-chain using the *connected wallet* (binds hash to wallet ⇒ prevents relay/replay)
      if (!walletConnected) {
        await connectWallet()
      }
      const { contract } = await getSignerAndContract()
      if (!upload.ipfs?.cid) throw new Error('Missing CID from IPFS upload.')

      const tx = await contract.registerDocument(upload.hash, upload.ipfs.cid)
      const receipt = await tx.wait()
      setRegisterResult({
        ...upload,
        message: 'Registered successfully (IPFS + on-chain, wallet-bound).',
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
      setVerifyResult({ hash, verified })
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : String(err))
    } finally {
      setVerifyLoading(false)
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
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {walletConnected ? (
              <span className="muted" title={walletAddress ?? ''}>
                {shortAddr(walletAddress ?? '')}
              </span>
            ) : (
              <button className="btnGhost" type="button" onClick={connectWallet}>
                Connect Wallet
              </button>
            )}
            <a className="navCta" href="/api/health" target="_blank" rel="noreferrer">
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
            Upload a document to store its hash on-chain and its content on IPFS. Later, verify the document by re-
            uploading it.
          </p>
          <div className="heroActions">
            <a className="btnPrimary" href="#verify">
              Go Verify
            </a>
            <a className="btnGhost" href="#upload">
              Upload Document
            </a>
          </div>

          <div className="featureRow">
            <div className="featureCard">
              <div className="featureIcon">LC</div>
              <div>
                <div className="featureTitle">Less Cost</div>
                <div className="featureText">No intermediaries; store only the hash on-chain.</div>
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
                </div>

                {registerIpfsUrl && (
                  <div className="resultActions">
                    <a className="btnGhost" href={registerIpfsUrl} target="_blank" rel="noreferrer">
                      View on IPFS
                    </a>
                    <a className="btnGhost" href="#verify">
                      Verify Document
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
              Upload a document and we’ll verify that <span className="mono">hash</span> is registered by your connected
              wallet (relay/replay-safe in-app).
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
                  {verifyResult.verified ? 'Document Verified' : 'Not Verified'}
                </div>
                <div className="kvGrid">
                  <div className="kvItem">
                    <div className="k">Hash</div>
                    <div className="v mono">{verifyResult.hash}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <section id="mydocs" className="section">
          <div className="sectionHead">
            <h2>My Documents</h2>
            <p className="muted">Documents registered by your connected wallet. Open them via their IPFS CID.</p>
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
                      <div className="v">
                        <a className="link" href={d.url} target="_blank" rel="noreferrer">
                          {shortHash(d.cid, 18)}
                        </a>
                        <div className="muted mono" style={{ marginTop: 6 }}>
                          {shortHash(d.hash, 14)}
                        </div>
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
            <a href="/api/health" target="_blank" rel="noreferrer">
              API Health
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
