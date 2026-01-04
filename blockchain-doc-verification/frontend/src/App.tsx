import './App.css'
import { useMemo, useState } from 'react'
import type { RegisterResponse, VerifyResponse } from './api'
import { postFile } from './api'

function withHttps(url: string) {
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  return `https://${url}`
}

function shortHash(value: string, keep = 10) {
  if (!value) return ''
  if (value.length <= keep * 2 + 3) return value
  return `${value.slice(0, keep)}…${value.slice(-keep)}`
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

  const canRegister = useMemo(() => !!registerFile && !registerLoading, [registerFile, registerLoading])
  const canVerify = useMemo(() => !!verifyFile && !verifyLoading, [verifyFile, verifyLoading])

  async function onRegisterSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!registerFile) return

    setRegisterError(null)
    setRegisterResult(null)
    setRegisterLoading(true)
    try {
      const data = await postFile<RegisterResponse>('/api/register', registerFile)
      setRegisterResult(data)
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
      const data = await postFile<VerifyResponse>('/api/verify', verifyFile)
      setVerifyResult(data)
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
          </div>
          <a className="navCta" href="/api/health" target="_blank" rel="noreferrer">
            API Health
          </a>
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
        <section id="upload" className="section">
          <div className="sectionHead">
            <h2>Upload Document</h2>
            <p className="muted">Upload a file to IPFS and register its hash on the blockchain.</p>
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
            <p className="muted">Upload a document and we’ll check if its hash exists on-chain.</p>
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
