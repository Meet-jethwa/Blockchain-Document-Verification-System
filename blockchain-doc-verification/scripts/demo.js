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

  console.log("DocumentRegistry deployed to:", address);
  console.log("Hash:", hash);
  console.log("verifyDocument(hash):", exists);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
