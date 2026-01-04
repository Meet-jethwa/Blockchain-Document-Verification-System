import axios from "axios";
import FormData from "form-data";

function axiosErrorMessage(err, context) {
  if (!axios.isAxiosError(err)) {
    const message = err instanceof Error ? err.message : String(err);
    return context ? `${context}: ${message}` : message;
  }

  const status = err.response?.status;
  const data = err.response?.data;
  const base = err.message || "Axios request failed";
  const details = [
    status ? `status=${status}` : null,
    data ? `response=${typeof data === "string" ? data : JSON.stringify(data)}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const full = details ? `${base} (${details})` : base;
  return context ? `${context}: ${full}` : full;
}

export function pickIpfsUploader({ pinataJwt, web3StorageToken, ipfsGatewayBaseUrl, ipfsDisabled }) {
  if (ipfsDisabled) {
    return new DisabledUploader();
  }
  if (pinataJwt) {
    return new PinataUploader({ pinataJwt, ipfsGatewayBaseUrl });
  }
  if (web3StorageToken) {
    return new Web3StorageUploader({ web3StorageToken, ipfsGatewayBaseUrl });
  }
  throw new Error(
    "No IPFS credentials configured. Set PINATA_JWT or WEB3_STORAGE_TOKEN in your .env."
  );
}

class DisabledUploader {
  async uploadBuffer() {
    return { cid: null, url: null, provider: "disabled", raw: null };
  }
}

class PinataUploader {
  constructor({ pinataJwt, ipfsGatewayBaseUrl }) {
    this.pinataJwt = pinataJwt;
    this.ipfsGatewayBaseUrl = ipfsGatewayBaseUrl;
  }

  async uploadBuffer({ buffer, filename }) {
    const formData = new FormData();
    formData.append("file", buffer, { filename });

    let res;
    try {
      res = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", formData, {
        headers: {
          Authorization: `Bearer ${this.pinataJwt}`,
          ...formData.getHeaders(),
        },
        maxBodyLength: Infinity,
      });
    } catch (err) {
      throw new Error(axiosErrorMessage(err, "Pinata upload failed"));
    }

    const cid = res?.data?.IpfsHash;
    if (!cid) {
      throw new Error(`Pinata upload failed: missing IpfsHash. Response: ${JSON.stringify(res.data)}`);
    }

    return {
      cid,
      url: `${this.ipfsGatewayBaseUrl}${cid}`,
      provider: "pinata",
      raw: res.data,
    };
  }
}

class Web3StorageUploader {
  constructor({ web3StorageToken, ipfsGatewayBaseUrl }) {
    this.web3StorageToken = web3StorageToken;
    this.ipfsGatewayBaseUrl = ipfsGatewayBaseUrl;
  }

  async uploadBuffer({ buffer, filename }) {
    // Web3.Storage upload expects raw bytes; filename is best-effort via header.
    let res;
    try {
      res = await axios.post("https://api.web3.storage/upload", buffer, {
        headers: {
          Authorization: `Bearer ${this.web3StorageToken}`,
          "Content-Type": "application/octet-stream",
          "X-NAME": filename,
        },
        maxBodyLength: Infinity,
      });
    } catch (err) {
      throw new Error(axiosErrorMessage(err, "Web3.Storage upload failed"));
    }

    const cid = res?.data?.cid;
    if (!cid) {
      throw new Error(`Web3.Storage upload failed: missing cid. Response: ${JSON.stringify(res.data)}`);
    }

    return {
      cid,
      url: `${this.ipfsGatewayBaseUrl}${cid}`,
      provider: "web3.storage",
      raw: res.data,
    };
  }
}


