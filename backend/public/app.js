function setLoading({ button, loadingEl, isLoading }) {
  button.disabled = isLoading;
  loadingEl.hidden = !isLoading;
}

function formatError(err) {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

async function postFile(url, file) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(url, {
    method: "POST",
    body: formData,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

function el(id) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element: ${id}`);
  return node;
}

function renderRegisterResult(data) {
  const ipfsLine = data?.ipfs?.url
    ? `IPFS URL: ${data.ipfs.url}`
    : `IPFS: ${data?.ipfs?.provider || "unknown"}`;

  return [
    "Registered Successfully",
    "",
    `Hash: ${data.hash}`,
    ipfsLine,
    data?.chain?.txHash ? `Tx: ${data.chain.txHash}` : "",
    data?.chain?.blockNumber ? `Block: ${data.chain.blockNumber}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function renderVerifyResult(data) {
  return [
    data.verified ? "Document Verified" : "Not Verified",
    "",
    `Hash: ${data.hash}`,
  ].join("\n");
}

async function main() {
  const registerForm = el("registerForm");
  const registerFile = el("registerFile");
  const registerBtn = el("registerBtn");
  const registerLoading = el("registerLoading");
  const registerResult = el("registerResult");

  const verifyForm = el("verifyForm");
  const verifyFile = el("verifyFile");
  const verifyBtn = el("verifyBtn");
  const verifyLoading = el("verifyLoading");
  const verifyResult = el("verifyResult");

  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    registerResult.textContent = "";

    const file = registerFile.files?.[0];
    if (!file) return;

    try {
      setLoading({ button: registerBtn, loadingEl: registerLoading, isLoading: true });
      const data = await postFile("/api/register", file);
      registerResult.innerHTML = `<div class="ok">${renderRegisterResult(data).replaceAll("\n", "<br />")}</div>`;
    } catch (err) {
      registerResult.innerHTML = `<div class="bad">${formatError(err)}</div>`;
    } finally {
      setLoading({ button: registerBtn, loadingEl: registerLoading, isLoading: false });
    }
  });

  verifyForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    verifyResult.textContent = "";

    const file = verifyFile.files?.[0];
    if (!file) return;

    try {
      setLoading({ button: verifyBtn, loadingEl: verifyLoading, isLoading: true });
      const data = await postFile("/api/verify", file);
      verifyResult.innerHTML = `<div class="${data.verified ? "ok" : "bad"}">${renderVerifyResult(data).replaceAll("\n", "<br />")}</div>`;
    } catch (err) {
      verifyResult.innerHTML = `<div class="bad">${formatError(err)}</div>`;
    } finally {
      setLoading({ button: verifyBtn, loadingEl: verifyLoading, isLoading: false });
    }
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
});
