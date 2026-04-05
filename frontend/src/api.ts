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
  verified: boolean
  owner?: string | null
  registeredAt?: number | null
}

const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() ?? ''
const apiBaseUrl = rawApiBaseUrl.replace(/\/+$/, '')

export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  if (!apiBaseUrl) return path
  if (!path) return apiBaseUrl
  return path.startsWith('/') ? `${apiBaseUrl}${path}` : `${apiBaseUrl}/${path}`
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

export async function postFile<T>(
  url: string,
  file: File,
  options?: { encrypt?: boolean; passphrase?: string; headers?: Record<string, string> },
): Promise<T> {
  const formData = new FormData()
  formData.append('file', file)

  if (options?.encrypt != null) formData.append('encrypt', options.encrypt ? 'true' : 'false')
  if (options?.passphrase != null) formData.append('passphrase', options.passphrase)

  const res = await fetch(url, {
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
