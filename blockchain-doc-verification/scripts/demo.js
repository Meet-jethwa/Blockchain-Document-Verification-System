import { network } from "hardhat";

async function main() {
  const { ethers } = await network.connect();

  const documentRegistry = await ethers.deployContract("DocumentRegistry");
  await documentRegistry.waitForDeployment();
  const address = await documentRegistry.getAddress();

  const hash = ethers.keccak256(ethers.toUtf8Bytes("example-document"));

  const tx = await documentRegistry.registerDocument(hash);
  await tx.wait();

  const exists = await documentRegistry.verifyDocument(hash);
  const mine = await documentRegistry.verifyMyDocument(hash);
  const meta = await documentRegistry.getDocumentMeta(hash);

  console.log("DocumentRegistry deployed to:", address);
  console.log("Hash:", hash);
  console.log("verifyDocument(hash):", exists);
  console.log("verifyMyDocument(hash):", mine);
  console.log("getDocumentMeta(hash):", meta);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
