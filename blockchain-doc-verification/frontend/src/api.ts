export type RegisterResponse = {
  message?: string
  hash: string
  file: { name: string; mimetype: string; size: number }
  ipfs: { cid: string | null; url: string | null; provider: string | null }
  chain: { contractAddress: string; txHash: string | null; blockNumber: number | null }
  alreadyRegistered?: boolean
  existingOwner?: string | null
}

export type VerifyResponse = {
  hash: string
  verified: boolean
}

async function parseJsonSafely(res: Response) {
  try {
    return await res.json()
  } catch {
    return null
  }
}

export async function postFile<T>(url: string, file: File): Promise<T> {
  const formData = new FormData()
  formData.append('file', file)

  const res = await fetch(url, {
    method: 'POST',
    body: formData,
  })

  const data = await parseJsonSafely(res)
  if (!res.ok) {
    const message = (data && typeof data === 'object' && 'error' in data && (data as any).error) ||
      `Request failed (${res.status})`
    throw new Error(String(message))
  }

  return data as T
}
