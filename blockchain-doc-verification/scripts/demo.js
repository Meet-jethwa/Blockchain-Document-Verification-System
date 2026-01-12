import { network } from "hardhat";

async function main() {
  const { ethers } = await network.connect();

  const documentRegistry = await ethers.deployContract("DocumentRegistry");
  await documentRegistry.waitForDeployment();
  const address = await documentRegistry.getAddress();

  const hash = ethers.keccak256(ethers.toUtf8Bytes("example-document"));
  const cid = "bafybeigdyrzt5examplecid"; // demo placeholder

  const tx = await documentRegistry.registerDocument(hash, cid);
  await tx.wait();

  const exists = await documentRegistry.verifyDocument(hash);
  const mine = await documentRegistry.verifyMyDocument(hash);
  const doc = await documentRegistry.getDocument(hash);

  console.log("DocumentRegistry deployed to:", address);
  console.log("Hash:", hash);
  console.log("verifyDocument(hash):", exists);
  console.log("verifyMyDocument(hash):", mine);
  console.log("getDocument(hash):", doc);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
