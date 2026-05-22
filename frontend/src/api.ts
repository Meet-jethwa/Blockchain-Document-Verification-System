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
