export type RegisterResponse = {
  message?: string
  hash: string
  file: { name: string; mimetype: string; size: number }
  ipfs: { cid: string | null; url: string | null; provider: string | null }
  encryption?:
    | { enabled: false }
    | {
        enabled: true
        format: string
        cipher: string
        kdf: string
        iterations: number
      }
    | {
        enabled: true
        cipher: string
        keyStored?: boolean
      }
  chain: { contractAddress: string; txHash: string | null; blockNumber: number | null }
  alreadyRegistered?: boolean
  existingOwner?: string | null
  revoked?: boolean | null
}

export type VerifyResponse = {
  hash: string
  existsOnChain: boolean
  verified: boolean
  authentic?: boolean
  status?: string
  verifiedAt?: number | null
  verifiedMessage?: string | null
  revoked: boolean
  onChain: {
    owner: string | null
    createdAt: number | null
    blockNumber: number | null
  } | null
  database: {
    owner: string | null
    createdAt: number | null
    file: { name: string; mimetype: string; size: number } | null
    ipfs: { cid: string | null; provider: string | null } | null
    encryption: { enabled: boolean } | null
  } | null
  source?: { filename: string; mimetype: string; size: number }
}

export type UserProfile = {
  address: string
  name: string
  title: string
  email: string
  bio: string
  photoDataUrl: string | null
  preferredTheme: 'dark' | 'light'
  updatedAt: number | null
}

export type DocumentSummary = {
  hash: string
  name: string
  owner: string | null
  createdAt: number | null
  verified: boolean
  status: 'Registered' | 'Revoked'
  cid: string | null
  access: 'owned' | 'shared'
  file?: { name: string; mimetype: string; size: number } | null
  sharedAt?: number | null
}

export type DocumentCollections = {
  owned: DocumentSummary[]
  shared: DocumentSummary[]
}

export async function fetchSharedDocuments(walletAddress: string): Promise<{ shared: DocumentSummary[] }> {
  return requestJson<{ shared: DocumentSummary[] }>('/api/shared-documents', {
    method: 'GET',
    headers: {
      'wallet-address': walletAddress,
    },
  })
}

export async function recordSharedDocument(
  walletAddress: string,
  document: Pick<DocumentSummary, 'hash' | 'name' | 'owner' | 'createdAt' | 'cid'>,
): Promise<{ shared: DocumentSummary }> {
  return requestJson<{ shared: DocumentSummary }>('/api/shared-record', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'wallet-address': walletAddress,
    },
    body: JSON.stringify(document),
  })
}

async function parseJsonSafely(res: Response) {
  try {
    return await res.json()
  } catch {
    return null
  }
}

function extractErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  if (!('error' in data)) return null
  const err = (data as { error?: unknown }).error
  return typeof err === 'string' ? err : null
}

function resolveUrl(url: string) {
  const base = (import.meta as any).env?.VITE_API_BASE_URL as string | undefined
  if (!base) return url
  const trimmed = base.replace(/\/+$/, '')
  if (url.startsWith('/')) return `${trimmed}${url}`
  return `${trimmed}/${url}`
}

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const resolved = resolveUrl(url)
  const res = await fetch(resolved, options)
  const data = await parseJsonSafely(res)
  if (!res.ok) {
    const message = extractErrorMessage(data) || `Request failed (${res.status})`
    throw new Error(String(message))
  }
  return data as T
}

export async function postFile<T>(
  url: string,
  file: File,
  options?: { encrypt?: boolean; passphrase?: string; headers?: Record<string, string> },
): Promise<T> {
  const formData = new FormData()
  formData.append('file', file)

  if (options?.encrypt != null) formData.append('encrypt', options.encrypt ? 'true' : 'false')
  if (options?.passphrase != null) formData.append('passphrase', options.passphrase)

  const resolved = resolveUrl(url)
  const res = await fetch(resolved, {
    method: 'POST',
    body: formData,
    headers: options?.headers,
  })

  const data = await parseJsonSafely(res)
  if (!res.ok) {
    const message = extractErrorMessage(data) || `Request failed (${res.status})`
    throw new Error(String(message))
  }

  return data as T
}

export function postFileWithProgress<T>(
  url: string,
  file: File,
  options: { encrypt?: boolean; passphrase?: string; headers?: Record<string, string> } | undefined,
  onProgress: (percent: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const resolved = resolveUrl(url)
    const xhr = new XMLHttpRequest()
    xhr.open('POST', resolved, true)

    if (options?.headers) {
      for (const [k, v] of Object.entries(options.headers)) {
        try {
          xhr.setRequestHeader(k, v)
        } catch {}
      }
    }

    xhr.upload.onprogress = (evt) => {
      if (!evt.lengthComputable) {
        onProgress(0)
        return
      }
      const percent = Math.round((evt.loaded / evt.total) * 100)
      onProgress(percent)
    }

    xhr.onerror = () => {
      reject(new Error('Network error during upload'))
    }

    xhr.onload = async () => {
      try {
        const contentType = xhr.getResponseHeader('content-type') || ''
        let data: any = null
        if (contentType.includes('application/json')) {
          data = JSON.parse(xhr.responseText)
        } else {
          try {
            data = JSON.parse(xhr.responseText)
          } catch {
            data = null
          }
        }

        if (xhr.status < 200 || xhr.status >= 300) {
          const message = extractErrorMessage(data) || `Request failed (${xhr.status})`
          reject(new Error(String(message)))
          return
        }

        resolve(data as T)
      } catch (err) {
        reject(err)
      }
    }

    const formData = new FormData()
    formData.append('file', file)
    if (options?.encrypt != null) formData.append('encrypt', options.encrypt ? 'true' : 'false')
    if (options?.passphrase != null) formData.append('passphrase', options.passphrase)

    try {
      xhr.send(formData)
    } catch (err) {
      reject(err)
    }
  })
}

export async function fetchProfile(walletAddress: string): Promise<{ profile: UserProfile }> {
  return requestJson<{ profile: UserProfile }>('/api/profile', {
    method: 'GET',
    headers: {
      'wallet-address': walletAddress,
    },
  })
}

export async function saveProfile(
  walletAddress: string,
  profile: Pick<UserProfile, 'name' | 'title' | 'email' | 'bio' | 'photoDataUrl' | 'preferredTheme'>,
): Promise<{ profile: UserProfile }> {
  return requestJson<{ profile: UserProfile }>('/api/profile', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'wallet-address': walletAddress,
    },
    body: JSON.stringify(profile),
  })
}

export async function fetchDocuments(walletAddress: string): Promise<DocumentCollections> {
  return requestJson<DocumentCollections>('/api/documents', {
    method: 'GET',
    headers: {
      'wallet-address': walletAddress,
    },
  })
}

export async function verifyHash(hash: string, walletAddress?: string): Promise<VerifyResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (walletAddress) headers['wallet-address'] = walletAddress
  return requestJson<VerifyResponse>('/api/verify-hash', {
    method: 'POST',
    headers,
    body: JSON.stringify({ hash }),
  })
}
